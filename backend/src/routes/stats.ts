import { kills, playerdata } from '../db/schema.js';
import {
  validateSession,
  getPlayerData,
  mapPlayerDataToStats,
  createResponse,
  checkApiKey,
  increment,
  greatest,
} from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

export async function handleGetStats(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);

  const origin = request.headers.get('Origin');
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return createResponse({ error: error! }, 401, origin);
  }

  try {
    const playerData = await getPlayerData(session!.steamId, db, env);
    const stats = await mapPlayerDataToStats(
      playerData,
      session!.steamUser.personaname,
      session!.steamUser.avatarfull,
      session!.steamId,
      db,
      env,
    );

    return createResponse({ stats }, 200, origin);
  } catch (error) {
    console.error('Stats error:', error);
    return createResponse({ error: 'Failed to fetch player statistics' }, 500, origin);
  }
}

interface StatsPayload {
  players: Record<
    string,
    {
      timePlayed?: number;
      roundsPlayed?: number;
      medkits?: number;
      colas?: number;
      adrenaline?: number;
      pocketEscapes?: number;
      zvc?: number;
      snakeScore?: number;
      fakeRankAllowed?: boolean;
      fakeRankAdmin?: boolean;
      username?: string;
    }
  >;
  kills: {
    Attacker: string;
    Target: string;
    Timestamp: number;
  }[];
}

export async function handlePostStats(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);

  // Verify the validity of the request
  if (!checkApiKey(request, env.TRACKED_API_KEY)) {
    return createResponse({ error: 'Unauthorized' }, 401);
  }

  let body: StatsPayload;
  try {
    body = (await request.json()) as StatsPayload;
  } catch {
    return createResponse({ error: 'Invalid JSON' }, 400);
  }

  console.log('Received stats payload:', body);

  // Basic validation
  if (!body.players || !body.kills) {
    return createResponse({ error: 'Missing required fields' }, 400);
  }

  for (const [userId, stats] of Object.entries(body.players)) {
    // Check if userId already exists in the database. If not create with userId and default values
    const existingPlayer = await db.select().from(playerdata).where(eq(playerdata.id, userId)).limit(1);
    if (existingPlayer.length === 0) {
      await db.insert(playerdata).values({
        id: userId,
      });
    }

    await db
      .update(playerdata)
      .set({
        experience: increment(playerdata.experience, stats.zvc || 0),
        playtime: increment(playerdata.playtime, stats.timePlayed || 0),
        roundsplayed: increment(playerdata.roundsplayed, stats.roundsPlayed || 0),
        usedmedkits: increment(playerdata.usedadrenaline, stats.medkits || 0),
        usedcolas: increment(playerdata.usedcolas, stats.colas || 0),
        pocketescapes: increment(playerdata.pocketescapes, stats.pocketEscapes || 0),
        usedadrenaline: increment(playerdata.usedadrenaline, stats.adrenaline || 0),
        snakehighscore: greatest(playerdata.snakehighscore, stats.snakeScore || 0),
        killcount: increment(playerdata.killcount, body.kills.filter((kill) => kill.Attacker === userId).length),
        deathcount: increment(playerdata.deathcount, body.kills.filter((kill) => kill.Target === userId).length),
        fakerankUntil: stats.fakeRankAllowed
          ? Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)
          : playerdata.fakerankUntil,
        fakerankadminUntil: stats.fakeRankAdmin
          ? Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)
          : playerdata.fakerankadminUntil,
        username: stats.username || playerdata.username,
      })
      .where(eq(playerdata.id, userId));
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