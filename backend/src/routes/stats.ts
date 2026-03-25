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

import { logProgress } from './quests.js';
import { appendNotification } from '../notifications.js';

import type { StatsPostRequest } from '@zeitvertreib/types';

export async function handleGetStats(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);

  const origin = request.headers.get('Origin');
  const { status, steamId } = await validateSession(request, env);

  if (status !== 'valid' || !steamId) {
    return createResponse({ error: status === 'expired' ? 'Session expired' : 'Not authenticated' }, 401, origin);
  }

  try {
    // Get Steam user data
    const steamUser = await fetchSteamUserData(steamId, env, ctx);
    if (!steamUser) {
      return createResponse({ error: 'Failed to fetch Steam user data' }, 500, origin);
    }

    const playerData = await getPlayerData(steamId, db, env);
    const stats = await mapPlayerDataToStats(
      playerData,
      steamUser.username,
      steamUser.avatarUrl,
      steamId,
      db,
      env,
      ctx,
    );

    return createResponse({ stats }, 200, origin);
  } catch (error) {
    console.error('Stats error:', error);
    return createResponse({ error: 'Failed to fetch player statistics' }, 500, origin);
  }
}

export async function handlePostStats(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

  const normalizeUserId = (userId: string): string =>
    userId === 'anonymous' || userId.endsWith('@steam') ? userId : `${userId}@steam`;
  const killCounts = new Map<string, number>();
  const deathCounts = new Map<string, number>();

  for (const kill of body.kills) {
    const attackerId = normalizeUserId(kill.Attacker);
    const targetId = normalizeUserId(kill.Target);

    killCounts.set(attackerId, (killCounts.get(attackerId) || 0) + 1);
    deathCounts.set(targetId, (deathCounts.get(targetId) || 0) + 1);
  }

  for (const player of body.players) {
    player.userid = normalizeUserId(player.userid);

    const sessionKills = killCounts.get(player.userid) || 0;
    const sessionDeaths = deathCounts.get(player.userid) || 0;

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
        killcount: increment(playerdata.killcount, sessionKills),
        deathcount: increment(playerdata.deathcount, sessionDeaths),
        username: player.username || playerdata.username,
      })
      .where(eq(playerdata.id, player.userid));

    // Log quest progress for relevant quests
    ctx.waitUntil(
      logProgress(env, {
        userId: player.userid,
        medipacks: player.medkits,
        colas: player.colas,
        playtime: player.timePlayed,
        kills: sessionKills,
        rounds: player.roundsPlayed,
        pocketescapes: player.pocketEscapes,
        adrenaline: player.adrenaline,
      }),
    );

    // Notify player about their completed session
    if (
      player.userid !== 'anonymous' &&
      ((player.zvc || 0) > 0 || (player.timePlayed || 0) > 60 || sessionKills > 0 || sessionDeaths > 0)
    ) {
      ctx.waitUntil(
        appendNotification(env, player.userid, {
          type: 'session_completed',
          title: 'Session abgeschlossen',
          message: `${Math.floor((player.timePlayed || 0) / 60)} Min. gespielt · ${sessionKills} Kills · ${sessionDeaths} Tode · ${player.zvc || 0} ZVC verdient`,
        }).catch((error) => console.error('❌ Failed to send session_completed notification:', error)),
      );
    }
  }

  // Add all kill records to the kills table (IDs normalized for consistent DB queries)
  for (const kill of body.kills) {
    await db.insert(kills).values({
      attacker: normalizeUserId(kill.Attacker),
      target: normalizeUserId(kill.Target),
      timestamp: kill.Timestamp,
    });
  }
  return createResponse({ success: true }, 200);
}
