import { drizzle } from 'drizzle-orm/d1';
import { playerdata, steamCache, reducedLuckUsers } from '../db/schema.js';
import { validateSession, createResponse, fetchSteamUserData } from '../utils.js';
import { desc, eq, sql, inArray } from 'drizzle-orm';
import typia from 'typia';
import { proxyFetch } from '../proxy.js';

// List of admin Steam IDs allowed to access coin management
const COIN_MANAGEMENT_ADMINS = ['76561198834070725@steam', '76561198354414854@steam'];

interface CoinManagementPlayer {
  steamId: string;
  username: string;
  avatarUrl: string;
  coins: number;
  luck: number;
}

export async function handleListPlayers(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ error: 'Nicht autorisiert' }, 401, origin);
  }

  // Check if user is an admin
  if (!validation.steamId || !COIN_MANAGEMENT_ADMINS.includes(validation.steamId)) {
    return createResponse({ error: 'Zugriff verweigert - Admin-Rechte erforderlich' }, 403, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // Get all players ordered by experience (coins)
    const players = await db
      .select({
        id: playerdata.id,
        experience: playerdata.experience,
      })
      .from(playerdata)
      .orderBy(desc(playerdata.experience));

    // Batch-load Steam cache data
    const steamIds = players.map((player) => player.id);
    const steamCacheData =
      steamIds.length > 0 ? await db.select().from(steamCache).where(inArray(steamCache.steamId, steamIds)) : [];
    const steamDataMap = new Map<string, { username: string; avatarUrl: string }>(
      steamCacheData.map((cache) => [
        cache.steamId,
        {
          username: cache.username,
          avatarUrl: cache.avatarUrl,
        },
      ]),
    );

    // Batch-load reduced luck users from database
    const reducedLuckData =
      steamIds.length > 0
        ? await db
            .select({ steamId: reducedLuckUsers.steamId })
            .from(reducedLuckUsers)
            .where(inArray(reducedLuckUsers.steamId, steamIds))
        : [];
    const reducedLuckSet = new Set(reducedLuckData.map((row) => row.steamId));

    // Combine player data with cached Steam data
    const playersWithData: CoinManagementPlayer[] = players.map((player) => {
      const steamUser = steamDataMap.get(player.id);
      const hasReducedLuck = reducedLuckSet.has(player.id);

      return {
        steamId: player.id,
        username: steamUser?.username || 'Unknown Player',
        avatarUrl: steamUser?.avatarUrl || '/assets/logos/logo_full_color_1to1.png',
        coins: Number(player.experience) || 0,
        luck: hasReducedLuck ? 0 : 50,
      };
    });

    return createResponse({ players: playersWithData }, 200, origin);
  } catch (error) {
    console.error('Error fetching players:', error);
    return createResponse({ error: 'Fehler beim Laden der Spielerliste' }, 500, origin);
  }
}

export async function handleCheckCoinManagementAccess(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ hasAccess: false }, 200, origin);
  }

  const hasAccess = validation.steamId ? COIN_MANAGEMENT_ADMINS.includes(validation.steamId) : false;

  return createResponse({ hasAccess }, 200, origin);
}

/**
 * Send coin award notification to Discord webhook
 */
async function sendCoinAwardToDiscord(
  username: string,
  amount: number,
  customMessage: string | undefined,
  env: Env,
): Promise<void> {
  try {
    const message =
      customMessage || `🎁 **${username}** hat **${amount} ZVC** ${amount > 0 ? 'erhalten' : 'verloren'}!`;

    const embed = {
      title: '💰 Admin Coin Award',
      description: message,
      color: amount > 0 ? 0x10b981 : 0xf59e0b, // Green for positive, orange for negative
      fields: [
        {
          name: 'Spieler',
          value: username,
          inline: true,
        },
        {
          name: 'Betrag',
          value: `${amount > 0 ? '+' : ''}${amount} ZVC`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const payload = {
      embeds: [embed],
    };

    await proxyFetch(
      env.GAMBLING_WINS_WEBHOOK,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    console.log(`✅ Sent coin award notification to Discord for ${username}`);
  } catch (error) {
    console.error('Error sending coin award to Discord webhook:', error);
  }
}

interface AwardCoinsRequest {
  steamId: string;
  amount: number;
  discordNotification?: {
    enabled: boolean;
    message: string;
  };
}

export async function handleAwardCoins(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ error: 'Nicht autorisiert' }, 401, origin);
  }

  // Check if user is an admin
  if (!validation.steamId || !COIN_MANAGEMENT_ADMINS.includes(validation.steamId)) {
    return createResponse({ error: 'Zugriff verweigert - Admin-Rechte erforderlich' }, 403, origin);
  }

  const bodyRaw = await request.json();

  if (!typia.is<AwardCoinsRequest>(bodyRaw)) {
    return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
  }

  const body = bodyRaw as AwardCoinsRequest;

  // Normalize Steam ID to include @steam suffix
  const steamId = body.steamId.endsWith('@steam') ? body.steamId : `${body.steamId}@steam`;

  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // Update player experience (coins) and get the new value
    await db
      .update(playerdata)
      .set({
        experience: sql`${playerdata.experience} + ${body.amount}`,
      })
      .where(eq(playerdata.id, steamId));

    // Get the updated balance
    const updatedPlayer = await db
      .select({ experience: playerdata.experience })
      .from(playerdata)
      .where(eq(playerdata.id, steamId))
      .limit(1);

    if (updatedPlayer.length === 0 || !updatedPlayer[0]) {
      return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
    }

    const newBalance = Number(updatedPlayer[0].experience) || 0;

    // Send Discord notification if enabled (non-blocking)
    if (body.discordNotification?.enabled && body.discordNotification.message) {
      // Fetch username for Discord message
      const steamUser = await fetchSteamUserData(steamId, env, ctx);
      const username = steamUser?.username || 'Unknown Player';

      ctx.waitUntil(
        sendCoinAwardToDiscord(username, body.amount, body.discordNotification.message, env).catch((error) =>
          console.error('Failed to send Discord notification:', error),
        ),
      );
    }

    return createResponse({ success: true, newBalance }, 200, origin);
  } catch (error) {
    console.error('Error awarding coins:', error);
    return createResponse({ error: 'Fehler beim Vergeben von Coins' }, 500, origin);
  }
}
