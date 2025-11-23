import { drizzle } from 'drizzle-orm/d1';
import { inArray } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse } from '../utils.js';

interface ZvcResponse {
  userId: string;
  zvc: number;
}

export async function handleGetZeitvertreibCoins(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const userIds = new URL(request.url).searchParams.getAll('userId');

  if (userIds.length === 0) {
    return createResponse([], 200, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const steamIdsToQuery: string[] = [];
  const discordIdsToQuery: string[] = [];
  const idMap: { [dbId: string]: string } = {};

  // Parse and categorize user IDs
  for (const id of userIds) {
    const [value, type] = id.split('@');
    if (!value || !type) continue;

    if (type === 'steam') {
      steamIdsToQuery.push(id);
      idMap[id] = id;
    } else if (type === 'discord') {
      discordIdsToQuery.push(value);
      idMap[value] = id;
    }
  }

  // Look up Discord users to get their Steam IDs
  if (discordIdsToQuery.length > 0) {
    const discordUsers = await db
      .select({
        steamid: schema.playerdata.id,
        discordid: schema.playerdata.discordId,
      })
      .from(schema.playerdata)
      .where(inArray(schema.playerdata.discordId, discordIdsToQuery));

    for (const user of discordUsers) {
      const originalId = user.discordid && idMap[user.discordid];
      if (user.steamid && originalId) {
        steamIdsToQuery.push(user.steamid);
        idMap[user.steamid] = originalId;
      }
    }
  }

  if (steamIdsToQuery.length === 0) {
    return createResponse([], 200, origin);
  }

  // Query ZVC for all Steam IDs
  const zvcResult = await db
    .select({
      steamid: schema.playerdata.id,
      zvc: schema.playerdata.experience,
    })
    .from(schema.playerdata)
    .where(inArray(schema.playerdata.id, [...new Set(steamIdsToQuery)]));

  const response: ZvcResponse[] = zvcResult
    .map((row) => ({
      userId: idMap[row.steamid],
      zvc: row.zvc ?? 0,
    }))
    .filter((item) => item.userId) as ZvcResponse[];

  return createResponse(response, 200, origin);
}
