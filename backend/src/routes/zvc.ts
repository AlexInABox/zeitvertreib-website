import { drizzle } from 'drizzle-orm/d1';
import { inArray } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse } from '../utils.js';

interface ZvcResponse {
  userId: string;
  zvc: number;
}

export async function handleGetZeitvertreibCoins(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const userIdQuery = url.searchParams.get('userId');

  if (!userIdQuery) {
    return createResponse([], 200, origin);
  }

  const userIds = userIdQuery.split(',');
  const db = drizzle(env.ZEITVERTREIB_DATA, { schema });

  const steamIdsToQuery: string[] = [];
  const discordIdsToQuery: string[] = [];

  const steamToOriginalIdMap: { [steamId: string]: string } = {};
  const discordToOriginalIdMap: { [discordId: string]: string } = {};

  for (const id of userIds) {
    const parts = id.split('@');
    if (parts.length !== 2) continue;

    const value = parts[0];
    const type = parts[1];

    if (!value) continue;

    if (type === 'steam') {
      steamIdsToQuery.push(value);
      steamToOriginalIdMap[value] = id;
    } else if (type === 'discord') {
      discordIdsToQuery.push(value);
      discordToOriginalIdMap[value] = id;
    }
  }

  const finalSteamIds: string[] = [...steamIdsToQuery];

  if (discordIdsToQuery.length > 0) {
    const discordUsers = await db
      .select({
        steamid: schema.playerdata.id,
        discordid: schema.playerdata.discordId,
      })
      .from(schema.playerdata)
      .where(inArray(schema.playerdata.discordId, discordIdsToQuery));

    for (const user of discordUsers) {
      if (user.steamid && user.discordid) {
        const originalId = discordToOriginalIdMap[user.discordid];
        if (originalId) {
          finalSteamIds.push(user.steamid);
          steamToOriginalIdMap[user.steamid] = originalId;
        }
      }
    }
  }

  if (finalSteamIds.length === 0) {
    return createResponse([], 200, origin);
  }

  const uniqueSteamIds = [...new Set(finalSteamIds)];

  const zvcResult = await db
    .select({
      steamid: schema.playerdata.id,
      zvc: schema.playerdata.experience,
    })
    .from(schema.playerdata)
    .where(inArray(schema.playerdata.id, uniqueSteamIds));

  const response: ZvcResponse[] = zvcResult
    .map((row) => ({
      userId: steamToOriginalIdMap[row.steamid],
      zvc: row.zvc ?? 0,
    }))
    .filter((item) => item.userId !== undefined) as ZvcResponse[];

  return createResponse(response, 200, origin);
}
