import { createResponse } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';

interface PlayerListItem {
  Name: string;
  UserId: string;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
  Fakerank?: string;
  FakerankColor?: string;
}

/**
 * Builds Discord avatar URL from user ID and avatar hash
 */
function buildAvatarUrl(discordId: string, avatarHash: string): string {
  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${extension}?size=256`;
}

/**
 * Fetches Discord user info from Discord API
 */
async function getDiscordUserAvatar(discordId: string, env: Env): Promise<string | undefined> {
  try {
    const url = `https://discord.com/api/v10/users/${discordId}`;
    console.log(`[Discord API] Fetching user ${discordId} from ${url}`);

    const response = await proxyFetch(
      url,
      {
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
        },
      },
      env,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Discord API] Failed to fetch user ${discordId}: ${response.status} - ${errorText}`);
      return undefined;
    }

    const userData = (await response.json()) as { avatar?: string };

    if (userData.avatar) {
      return buildAvatarUrl(discordId, userData.avatar);
    }

    return undefined;
  } catch (error) {
    console.error(`Error fetching Discord avatar for ${discordId}:`, error);
    return undefined;
  }
}

/**
 * Enriches playerlist with Discord information and fakerank data
 */
async function enrichPlayerlistWithDiscordData(playerlist: PlayerListItem[], env: Env): Promise<PlayerListItem[]> {
  const db = drizzle(env.ZEITVERTREIB_DATA);

  console.log(`[Playerlist] Starting enrichment for ${playerlist.length} players`);

  const enrichedPlayers = await Promise.all(
    playerlist.map(async (player) => {
      try {
        // UserId is already in the correct format (e.g., "76561199367667107@steam")
        const steamId = player.UserId;

        if (!steamId) {
          console.log(`[Playerlist] No Steam ID found for player: ${player.Name}`);
          return player;
        }

        // Query database for Discord ID and fakerank data using the full UserId (with @steam)
        const [playerData] = await db
          .select({
            discordId: playerdata.discordId,
            fakerank: playerdata.fakerank,
            fakerankColor: playerdata.fakerankColor,
          })
          .from(playerdata)
          .where(eq(playerdata.id, steamId))
          .limit(1);

        if (!playerData) {
          console.log(`[Playerlist] No data found for ${player.Name} (${steamId})`);
          return player;
        }

        const enrichedPlayer: PlayerListItem = { ...player };

        // Add Discord data if available
        if (playerData.discordId) {
          const discordId = playerData.discordId.toString();
          console.log(`[Playerlist] Found Discord ID ${discordId} for ${player.Name}`);

          // Fetch Discord avatar
          const avatarUrl = await getDiscordUserAvatar(discordId, env);
          enrichedPlayer.DiscordId = discordId;
          if (avatarUrl) {
            enrichedPlayer.AvatarUrl = avatarUrl;
          }
        }

        // Add fakerank data if available
        if (playerData.fakerank) {
          enrichedPlayer.Fakerank = playerData.fakerank;
          console.log(`[Playerlist] Found fakerank "${playerData.fakerank}" for ${player.Name}`);
        }

        if (playerData.fakerankColor) {
          enrichedPlayer.FakerankColor = playerData.fakerankColor;
          console.log(`[Playerlist] Found fakerank color "${playerData.fakerankColor}" for ${player.Name}`);
        }

        console.log(
          `[Playerlist] Enriched ${player.Name}: DiscordId=${enrichedPlayer.DiscordId ? 'Yes' : 'No'}, Avatar=${enrichedPlayer.AvatarUrl ? 'Yes' : 'No'}, Fakerank=${enrichedPlayer.Fakerank || 'None'}, Color=${enrichedPlayer.FakerankColor || 'None'}`,
        );

        return enrichedPlayer;
      } catch (error) {
        console.error(`[Playerlist] Error enriching player ${player.Name}:`, error);
        return player;
      }
    }),
  );

  const enrichedCount = enrichedPlayers.filter((p) => p.DiscordId).length;
  const fakerankCount = enrichedPlayers.filter((p) => p.Fakerank).length;
  console.log(
    `[Playerlist] Enrichment complete: ${enrichedCount}/${playerlist.length} players with Discord, ${fakerankCount}/${playerlist.length} players with fakerank`,
  );

  return enrichedPlayers;
}

/**
 * Validates the API key from the Authorization header
 */
function validateApiKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);
  return token === env.PLAYERLIST_API_KEY;
}

/**
 * GET /playerlist
 * Fetches the current playerlist from Durable Object storage
 * Public endpoint - no authentication required
 */
export async function handleGetPlayerlist(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Get Durable Object instance
    const id = env.PLAYERLIST_STORAGE.idFromName('playerlist');
    const stub = env.PLAYERLIST_STORAGE.get(id);

    // Fetch playerlist from Durable Object
    const response = await stub.fetch(
      new Request('https://playerlist-storage.worker/playerlist', {
        method: 'GET',
      }),
    );

    if (!response.ok) {
      return createResponse(
        {
          error: `Failed to fetch playerlist: ${response.status} ${response.statusText}`,
        },
        500,
        origin,
      );
    }

    const playerlistData = (await response.json()) as PlayerListItem[];

    return createResponse(playerlistData, 200, origin);
  } catch (error) {
    console.error('Error fetching playerlist:', error);
    return createResponse({ error: 'Internal server error while fetching playerlist' }, 500, origin);
  }
}

/**
 * POST /playerlist
 * Updates the playerlist in Durable Object storage
 * Requires valid API key authentication via Bearer token
 */
export async function handleUpdatePlayerlist(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate API key
  if (!validateApiKey(request, env)) {
    return createResponse({ error: 'Unauthorized: Invalid or missing API key' }, 401, origin);
  }

  try {
    // Parse request body
    const playerlistData = (await request.json()) as PlayerListItem[];
    console.log(`[Playerlist POST] Received playerlist with ${playerlistData.length} players`);

    // Enrich playerlist with Discord data before storing
    const enrichedPlayerlist = await enrichPlayerlistWithDiscordData(playerlistData, env);
    console.log(`[Playerlist POST] Storing enriched playerlist`);

    // Get Durable Object instance
    const id = env.PLAYERLIST_STORAGE.idFromName('playerlist');
    const stub = env.PLAYERLIST_STORAGE.get(id);

    // Update playerlist in Durable Object with enriched data
    const response = await stub.fetch(
      new Request('https://playerlist-storage.worker/playerlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrichedPlayerlist),
      }),
    );

    if (!response.ok) {
      return createResponse(
        {
          error: `Failed to update playerlist: ${response.status} ${response.statusText}`,
        },
        500,
        origin,
      );
    }

    return createResponse({ success: true, message: 'Playerlist updated successfully' }, 200, origin);
  } catch (error) {
    console.error('Error updating playerlist:', error);
    return createResponse({ error: 'Internal server error while updating playerlist' }, 500, origin);
  }
}
