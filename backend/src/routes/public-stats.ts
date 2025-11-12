import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse } from '../utils.js';

export async function handleGetPublicStats(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA, { schema });
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamid');
    const discordId = url.searchParams.get('discordid');

    // Use first parameter provided
    if (steamId) {
      const [playerData] = await db
        .select()
        .from(schema.playerdata)
        .where(eq(schema.playerdata.id, steamId))
        .limit(1);

      if (!playerData) {
        return createResponse({ error: 'Player not found' }, 404, origin);
      }

      return createResponse({ stats: playerData }, 200, origin);
    } else if (discordId) {
      const [playerData] = await db
        .select()
        .from(schema.playerdata)
        .where(eq(schema.playerdata.discordId, discordId))
        .limit(1);

      if (!playerData) {
        return createResponse({ error: 'Player not found' }, 404, origin);
      }

      return createResponse({ stats: playerData }, 200, origin);
    } else {
      return createResponse(
        { error: 'Either steamid or discordid parameter is required' },
        400,
        origin,
      );
    }
  } catch (error) {
    console.error('Public stats error:', error);
    return createResponse(
      { error: 'Failed to fetch player statistics' },
      500,
      origin,
    );
  }
}
