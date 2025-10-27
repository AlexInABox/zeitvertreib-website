import {
  validateSession,
  getPlayerData,
  mapPlayerDataToStats,
  createResponse,
} from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';

export async function handleGetStats(
  request: Request,
  env: Env,
): Promise<Response> {
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
    return createResponse(
      { error: 'Failed to fetch player statistics' },
      500,
      origin,
    );
  }
}
