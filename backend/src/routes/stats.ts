import { kills, playerdata } from '../db/schema.js';
import {
  validateSession,
  getPlayerData,
  mapPlayerDataToStats,
  createResponse,
  checkApiKey,
  increment,
  greatest,
  fetchSteamUserData,
} from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { StatsPostRequest } from '@zeitvertreib/types';

export async function handleGetStats(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);

  const origin = request.headers.get('Origin');
  const { status, steamId } = await validateSession(request, env);

  if (status !== 'valid' || !steamId) {
    return createResponse({ error: status === 'expired' ? 'Session expired' : 'Not authenticated' }, 401, origin);
  }

  try {
    // Get Steam user data
    const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
    if (!steamUser) {
      return createResponse({ error: 'Failed to fetch Steam user data' }, 500, origin);
    }

    const playerData = await getPlayerData(steamId, db, env);
    const stats = await mapPlayerDataToStats(playerData, steamUser.personaname, steamUser.avatarfull, steamId, db, env);

    return createResponse({ stats }, 200, origin);
  } catch (error) {
    console.error('Stats error:', error);
    return createResponse({ error: 'Failed to fetch player statistics' }, 500, origin);
  }
}

export async function handlePostStats(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);

  // Verify the validity of the request
  if (!checkApiKey(request, env.TRACKED_API_KEY)) {
    return createResponse({ error: 'Unauthorized' }, 401);
  }

  let body: StatsPostRequest;
  try {
    body = (await request.json()) as StatsPostRequest;
  } catch {
    return createResponse({ error: 'Invalid JSON' }, 400);
  }

  console.log('Received stats payload:', body);

  // Basic validation
  if (!body.players || !body.kills) {
    return createResponse({ error: 'Missing required fields' }, 400);
  }

  for (const player of body.players) {
    if (!player.userid.endsWith('@steam')) {
      player.userid = `${player.userid}@steam`;
    }
    // Check if userId already exists in the database. If not create with userId and default values
    const existingPlayer = await db.select().from(playerdata).where(eq(playerdata.id, player.userid)).limit(1);
    if (existingPlayer.length === 0) {
      await db.insert(playerdata).values({
        id: player.userid,
      });
    }

    await db
      .update(playerdata)
      .set({
        experience: increment(playerdata.experience, player.zvc || 0),
        playtime: increment(playerdata.playtime, player.timePlayed || 0),
        roundsplayed: increment(playerdata.roundsplayed, player.roundsPlayed || 0),
        usedmedkits: increment(playerdata.usedmedkits, player.medkits || 0),
        usedcolas: increment(playerdata.usedcolas, player.colas || 0),
        pocketescapes: increment(playerdata.pocketescapes, player.pocketEscapes || 0),
        usedadrenaline: increment(playerdata.usedadrenaline, player.adrenaline || 0),
        snakehighscore: greatest(playerdata.snakehighscore, player.snakeScore || 0),
        killcount: increment(playerdata.killcount, body.kills.filter((kill) => kill.Attacker === player.userid).length),
        deathcount: increment(playerdata.deathcount, body.kills.filter((kill) => kill.Target === player.userid).length),
        fakerankUntil: player.fakeRankAllowed
          ? Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)
          : playerdata.fakerankUntil,
        fakerankadminUntil: player.fakeRankAdmin
          ? Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)
          : playerdata.fakerankadminUntil,
        username: player.username || playerdata.username,
      })
      .where(eq(playerdata.id, player.userid));
  }

  // Add all kill records to the kills table
  for (const kill of body.kills) {
    await db.insert(kills).values({
      attacker: kill.Attacker,
      target: kill.Target,
      timestamp: kill.Timestamp,
    });
  }
  return createResponse({ success: true }, 200);
}
