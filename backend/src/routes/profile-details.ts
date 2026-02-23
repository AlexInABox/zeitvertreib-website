import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, inArray } from 'drizzle-orm';
import { createResponse, validateSession, isTeam, fetchSteamUserData, fetchDiscordUserData } from '../utils.js';
import { playerdata, steamCache, sprays, sprayBans, cases, casesRelatedUsers } from '../db/schema.js';

/// GET /profile-details?steamId=...
/// Returns comprehensive profile information for a given steamId (team-only).
export async function handleGetProfileDetails(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse({ error: 'Authentifizierung erforderlich' }, 401, origin);
  }

  if (!(await isTeam(sessionValidation.steamId, env))) {
    return createResponse({ error: 'Unauthorized' }, 403, origin);
  }

  const url = new URL(request.url);
  const rawSteamId = url.searchParams.get('steamId');

  if (!rawSteamId) {
    return createResponse({ error: 'steamId erforderlich' }, 400, origin);
  }

  const steamId = rawSteamId.endsWith('@steam') ? rawSteamId : `${rawSteamId}@steam`;
  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // 1. Basic player data
    const playerRows = await db.select().from(playerdata).where(eq(playerdata.id, steamId)).limit(1);
    const player = playerRows[0] ?? null;

    // 2. Steam cache (username + avatar)
    const steamCacheRows = await db.select().from(steamCache).where(eq(steamCache.steamId, steamId)).limit(1);
    const steamCacheRow = steamCacheRows[0] ?? null;

    let username: string | null = steamCacheRow?.username ?? null;
    let avatarUrl: string | null = steamCacheRow?.avatarUrl ?? null;

    if (!username || !avatarUrl) {
      const steamData = await fetchSteamUserData(steamId, env, ctx);
      if (steamData) {
        username = steamData.username ?? username;
        avatarUrl = steamData.avatarUrl ?? avatarUrl;
      }
    }

    // 3. Sprays
    const userSprays = await db
      .select({ id: sprays.id, name: sprays.name, uploadedAt: sprays.uploadedAt })
      .from(sprays)
      .where(eq(sprays.userid, steamId))
      .orderBy(desc(sprays.uploadedAt));

    // 4. Spray ban check
    const sprayBanRows = await db.select().from(sprayBans).where(eq(sprayBans.userid, steamId)).limit(1);
    const isSprayBanned = sprayBanRows.length > 0;

    // 5. Discord IDs
    const discordId: string | null = player?.discordId ?? null;
    let discordAvatarUrl: string | null = null;

    if (discordId) {
      const discordData = await fetchDiscordUserData(discordId, env, ctx);
      discordAvatarUrl = discordData?.avatarUrl ?? null;
    }

    // 6. Linked cases (cases where this steamId is in casesRelatedUsers)
    const linkedCaseRows = await db
      .select({ caseId: casesRelatedUsers.caseId })
      .from(casesRelatedUsers)
      .where(eq(casesRelatedUsers.steamId, steamId));

    const linkedCaseIds = linkedCaseRows.map((r) => r.caseId).filter((id): id is string => id !== null);

    let linkedCases: CaseListEntry[] = [];

    if (linkedCaseIds.length > 0) {
      const casesList = await db
        .select({
          id: cases.id,
          title: cases.title,
          category: cases.category,
          createdByDiscordId: cases.createdByDiscordId,
          createdAt: cases.createdAt,
          lastUpdatedAt: cases.lastUpdatedAt,
        })
        .from(cases)
        .where(inArray(cases.id, linkedCaseIds))
        .orderBy(desc(cases.createdAt));

      const creatorDataList = await Promise.all(
        casesList.map((c) => fetchDiscordUserData(c.createdByDiscordId, env, ctx)),
      );

      linkedCases = casesList.map((c, i) => ({
        caseId: c.id,
        title: c.title,
        rule: c.category ?? null,
        createdBy: {
          discordId: c.createdByDiscordId,
          displayName: creatorDataList[i]?.displayName ?? c.createdByDiscordId,
          avatarUrl: creatorDataList[i]?.avatarUrl ?? '',
        },
        createdAt: c.createdAt,
        lastUpdatedAt: c.lastUpdatedAt,
      }));
    }

    // 7. Created cases (cases where createdByDiscordId = this user's discordId)
    let createdCases: CreatedCaseEntry[] = [];

    if (discordId) {
      const createdCasesList = await db
        .select({
          id: cases.id,
          title: cases.title,
          category: cases.category,
          createdAt: cases.createdAt,
          lastUpdatedAt: cases.lastUpdatedAt,
        })
        .from(cases)
        .where(eq(cases.createdByDiscordId, discordId))
        .orderBy(desc(cases.createdAt));

      const createdCaseIds = createdCasesList.map((c) => c.id);
      const linkedCountMap: Record<string, number> = {};

      if (createdCaseIds.length > 0) {
        const linkedUserRows = await db
          .select({ caseId: casesRelatedUsers.caseId, steamId: casesRelatedUsers.steamId })
          .from(casesRelatedUsers)
          .where(inArray(casesRelatedUsers.caseId, createdCaseIds));

        for (const row of linkedUserRows) {
          if (row.caseId) {
            const existing = linkedCountMap[row.caseId];
            linkedCountMap[row.caseId] = existing !== undefined ? existing + 1 : 1;
          }
        }
      }

      createdCases = createdCasesList.map((c) => ({
        caseId: c.id,
        title: c.title,
        rule: c.category ?? null,
        createdAt: c.createdAt,
        lastUpdatedAt: c.lastUpdatedAt,
        linkedUserCount: linkedCountMap[c.id] ?? 0,
      }));
    }

    return createResponse(
      {
        steamId,
        username,
        avatarUrl,
        coins: Number(player?.experience) || 0,
        discordId,
        discordAvatarUrl,
        firstSeen: player?.firstSeen
          ? player.firstSeen instanceof Date
            ? player.firstSeen.getTime()
            : player.firstSeen
          : null,
        lastSeen: player?.lastSeen
          ? player.lastSeen instanceof Date
            ? player.lastSeen.getTime()
            : player.lastSeen
          : null,
        sprays: userSprays,
        sprayBanned: isSprayBanned,
        cases: linkedCases,
        createdCases,
        coinRestriction: null,
        moderation: null,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error fetching profile details:', error);
    return createResponse(
      {
        error: 'Fehler beim Laden der Profildaten',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

interface CaseListEntry {
  caseId: string;
  title: string;
  rule: string | null;
  createdBy: {
    discordId: string;
    displayName: string;
    avatarUrl: string;
  };
  createdAt: number;
  lastUpdatedAt: number;
}

interface CreatedCaseEntry {
  caseId: string;
  title: string;
  rule: string | null;
  createdAt: number;
  lastUpdatedAt: number;
  linkedUserCount: number;
}
