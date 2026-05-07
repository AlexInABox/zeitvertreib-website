import { drizzle } from 'drizzle-orm/d1';
import { playerdata, fakeranks, fakerankBans, sprays, sprayBans, cases, casesRelatedUsers } from '../db/schema.js';
import {
  validateSession,
  createResponse,
  fetchSteamUserData,
  fetchDiscordUserData,
  isTeam,
  validateSteamId,
  getSprayImage,
  getCedModBans,
  isCedModBanned,
  getCedModWarns,
} from '../utils.js';
import { eq, inArray } from 'drizzle-orm';
import type { ZeitGetResponse, FakerankColor, CaseCategory } from '@zeitvertreib/types';

export async function getUserData(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const db = drizzle(env.ZEITVERTREIB_DATA);

  // TODO: Implement API Keys for this endpoint so partners can query this too!
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ error: 'Nicht autorisiert' }, 401, origin);
  }

  if (!validation.steamId || !isTeam(validation.steamId, env)) {
    return createResponse({ error: 'Zugriff verweigert' }, 403, origin);
  }

  let steamId: string | null = url.searchParams.get('steamid');

  if (url.searchParams.has('discordid')) {
    const discordId = url.searchParams.get('discordid')!;

    const user = await db.select().from(playerdata).where(eq(playerdata.discordId, discordId)).limit(1);

    if (user[0]) {
      steamId = user[0].id;
    }
  }

  if (!steamId || !validateSteamId(steamId).valid) {
    return createResponse({ error: 'Ungültige SteamID' }, 400, origin);
  }

  // Lets start fetching all the data!
  let playerdataResult = await db.select().from(playerdata).where(eq(playerdata.id, steamId)).limit(1);
  // If not found, return empty row instead of 404
  if (playerdataResult.length === 0) {
    playerdataResult = [{} as typeof playerdata.$inferSelect];
  }

  const steamUserDataResult = await fetchSteamUserData(steamId, env, ctx);

  let discordData: { id: string; username: string; avatar: string } | null = null;
  if (playerdataResult[0]!.discordId) {
    const discordUserDataResult = await fetchDiscordUserData(playerdataResult[0]!.discordId, env, ctx);
    if (discordUserDataResult) {
      discordData = {
        id: playerdataResult[0]!.discordId!,
        username: discordUserDataResult.username,
        avatar: discordUserDataResult.avatarUrl,
      };
    }
  }

  let fakerankData: { text: string; color: FakerankColor } | null = null;
  const fakerankResult = await db.select().from(fakeranks).where(eq(fakeranks.userid, steamId)).limit(1);
  if (fakerankResult[0]) {
    fakerankData = {
      text: fakerankResult[0]!.text,
      color: fakerankResult[0]!.color as FakerankColor,
    };
  }
  const fakerankBanResult = await db.select().from(fakerankBans).where(eq(fakerankBans.userid, steamId)).limit(1);

  let sprayData: { id: number; name: string; full_res: string }[] = [];
  const spraysResult = await db.select().from(sprays).where(eq(sprays.userid, steamId));
  if (spraysResult.length > 0) {
    sprayData = await Promise.all(
      spraysResult.map(async (spray) => ({
        id: spray.id,
        name: spray.name,
        full_res: (await getSprayImage(spray.id, env)) || '',
      })),
    );
  }
  const sprayBanResult = await db.select().from(sprayBans).where(eq(sprayBans.userid, steamId)).limit(1);

  let createdCasesData: { caseId: string; title: string; category: CaseCategory; createdAt: number }[] = [];
  const casesResult = await db
    .select()
    .from(cases)
    .where(eq(cases.createdByDiscordId, playerdataResult[0]!.discordId || ''));
  if (casesResult.length > 0) {
    createdCasesData = casesResult.map((c) => ({
      caseId: c.id,
      title: c.title,
      category: c.category as CaseCategory,
      createdAt: c.createdAt,
    }));
  }

  let linkedCasesData: { caseId: string; title: string; category: CaseCategory; createdAt: number }[] = [];
  const linkedCasesResult = await db.select().from(casesRelatedUsers).where(eq(casesRelatedUsers.steamId, steamId));
  if (linkedCasesResult.length > 0) {
    const caseIds = linkedCasesResult.map((c) => c.caseId!);
    const casesData = await db.select().from(cases).where(inArray(cases.id, caseIds));
    linkedCasesData = casesData.map((c) => ({
      caseId: c.id,
      title: c.title,
      category: c.category as CaseCategory,
      createdAt: c.createdAt,
    }));
  }

  const userData: ZeitGetResponse = {
    steam: {
      id: steamId,
      username: steamUserDataResult?.username || 'Unbekannter Name',
      avatar: steamUserDataResult?.avatarUrl || '',
    },
    discord: discordData,
    zvc: playerdataResult[0]!.experience ? playerdataResult[0]!.experience! : 0,
    playtime: playerdataResult[0]!.playtime ? playerdataResult[0]!.playtime! : 0,
    roundsplayed: playerdataResult[0]!.roundsplayed ? playerdataResult[0]!.roundsplayed! : 0,
    fakerank: fakerankData,
    fakerankBanned: fakerankBanResult.length > 0,
    fakerankBanReason: fakerankBanResult[0]?.reason,
    fakerankBannedByDiscordId: fakerankBanResult[0]?.bannedByDiscordId,
    sprays: sprayData,
    sprayBanned: sprayBanResult.length > 0,
    sprayBanReason: sprayBanResult[0]?.reason,
    sprayBannedByDiscordId: sprayBanResult[0]?.bannedByDiscordId,
    cedmodBans: await getCedModBans(steamId, env),
    cedmodActivelyBanned: await isCedModBanned(steamId, env),
    cedmodWarns: await getCedModWarns(steamId, env),
    linkedCases: linkedCasesData,
  };
  return createResponse(userData, 200, origin);
}
