import { drizzle } from 'drizzle-orm/d1';
import { playerdata } from '../db/schema.js';
import { validateSession, createResponse, REDUCED_LUCK_USERS, fetchSteamUserData } from '../utils.js';
import { desc, eq, sql } from 'drizzle-orm';
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
      .orderBy(desc(playerdata.experience))
      .limit(100); // Limit to top 100 players

    // Fetch Steam user data for each player
    const playersWithData: CoinManagementPlayer[] = await Promise.all(
      players.map(async (player) => {
        const steamUser = await fetchSteamUserData(player.id, env, ctx);
        const hasReducedLuck = REDUCED_LUCK_USERS.includes(player.id);

        return {
          steamId: player.id,
          username: steamUser?.username || 'Unknown Player',
          avatarUrl: steamUser?.avatarUrl || '/assets/logos/logo_full_color_1to1.png',
          coins: Number(player.experience) || 0,
          luck: hasReducedLuck ? 0 : 50,
        };
      }),
    );

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

  const body = await request.json();

  if (!typia.is<AwardCoinsRequest>(body)) {
    return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // Get current player data
    const player = await db
      .select({
        experience: playerdata.experience,
      })
      .from(playerdata)
      .where(eq(playerdata.id, body.steamId))
      .limit(1);

    if (player.length === 0 || !player[0]) {
      return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
    }

    const playerData = player[0];
    const currentCoins = Number(playerData.experience) || 0;
    const newCoins = currentCoins + body.amount;

    // Prevent negative balance
    if (newCoins < 0) {
      return createResponse({ error: 'Ungültige Menge - würde zu negativem Guthaben führen' }, 400, origin);
    }

    // Update player experience (coins)
    await db
      .update(playerdata)
      .set({
        experience: sql`${playerdata.experience} + ${body.amount}`,
      })
      .where(eq(playerdata.id, body.steamId));

    // Send Discord notification if enabled (non-blocking)
    if (body.discordNotification?.enabled && body.discordNotification.message) {
      // Fetch username for Discord message
      const steamUser = await fetchSteamUserData(body.steamId, env, ctx);
      const username = steamUser?.username || 'Unknown Player';

      ctx.waitUntil(
        sendCoinAwardToDiscord(username, body.amount, body.discordNotification.message, env).catch((error) =>
          console.error('Failed to send Discord notification:', error),
        ),
      );
    }

    return createResponse({ success: true, newBalance: newCoins }, 200, origin);
  } catch (error) {
    console.error('Error awarding coins:', error);
    return createResponse({ error: 'Fehler beim Vergeben von Coins' }, 500, origin);
  }
}
