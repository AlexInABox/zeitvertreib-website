// Consolidated utilities
import type { SteamUser, Statistics, PlayerData } from '@zeitvertreib/types';
import { proxyFetch } from './proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { AwsClient } from 'aws4fetch';
import { eq, count, lt, sql, and, gt } from 'drizzle-orm';
import { playerdata, kills, loginSecrets, discordInfo, steamCache, sessions, discordCache } from './db/schema.js';
import { AnyColumn } from 'drizzle-orm';
import { Context } from 'vm';

/**
 * Validate and normalize a Steam64 ID
 * @param steamId - The Steam ID to validate (can have @steam suffix)
 * @returns { valid: boolean, normalized?: string, error?: string }
 * - valid: true if the Steam ID is a valid Steam64
 * - normalized: the normalized Steam ID (with @steam suffix) if valid
 * - error: error message describing why the Steam ID is invalid
 *
 * Validation rules:
 * - Min: 0x0110000100000000 (76561197960265728)
 * - Max: 0x01100001FFFFFFFF (76561202255233023)
 * - Must be exactly 17 decimal digits
 */
export function validateSteamId(steamId: string): { valid: boolean; normalized?: string; error?: string } {
  const raw = steamId.trim();

  // Check for empty string
  if (!raw) {
    return { valid: false, error: 'Steam ID darf nicht leer sein' };
  }

  // Remove all @steam suffixes (catches duplication like @steam@steam)
  const base = raw.replace(/@steam/g, '');

  // Check if exactly 17 decimal digits
  if (!/^\d{17}$/.test(base)) {
    return { valid: false, error: 'Steam ID muss genau 17 Dezimalziffern sein' };
  }

  // Verify within valid Steam64 ID range
  const MIN_STEAM64 = 76561197960265728n; // 0x0110000100000000
  const MAX_STEAM64 = 76561202255233023n; // 0x01100001FFFFFFFF
  const steamId64 = BigInt(base);

  if (steamId64 < MIN_STEAM64 || steamId64 > MAX_STEAM64) {
    return { valid: false, error: 'Steam ID liegt außerhalb des gültigen Bereichs' };
  }

  // Normalize: return with @steam suffix
  return { valid: true, normalized: `${base}@steam` };
}

// Response helpers
export function createResponse(data: any, status = 200, origin?: string | null): Response {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    // Add additional headers for Safari compatibility
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (status === 302) {
    headers['Location'] = data;
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(data), { status, headers });
}

// Compute canonical truncated SHA256 hash for spray image base64 data
export async function computeSpraySha256(full_res: string): Promise<string> {
  const base64Data = full_res.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const hashBuffer = await crypto.subtle.digest('SHA-256', imageBuffer);
  const fullHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return fullHash.substring(0, 10); // First 10 hex chars (5 bytes)
}

// Extract steamId from a request's session and return session status
export async function validateSession(
  request: Request,
  env: Env,
): Promise<{ status: 'valid' | 'expired' | 'invalid'; steamId?: string }> {
  const sessionId =
    request.headers.get('Authorization')?.replace(/^Bearer /, '') ??
    request.headers.get('Cookie')?.match(/session=([^;]+)/)?.[1] ??
    null;

  if (!sessionId) return { status: 'invalid' };

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

  if (!session) return { status: 'invalid' };

  const now = Date.now();
  if (now > session.expiresAt) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return { status: 'expired' };
  }

  // Update lastLoginAt
  await db.update(sessions).set({ lastLoginAt: now }).where(eq(sessions.id, sessionId));

  return { status: 'valid', steamId: session.userid };
}

export async function getSupporterAndZvcIndex(
  steamId: string,
  env: Env,
): Promise<{ isSupporter: boolean; zvcIndex: number }> {
  const isSupporter =
    (await isDonator(steamId, env)) || (await isVip(steamId, env)) || (await isBooster(steamId, env));
  const zvcIndex = isSupporter ? 2 : 1;
  return { isSupporter, zvcIndex };
}

export async function createSession(
  steamId: string,
  _steamUser: SteamUser,
  env: Env,
  request?: Request,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const duration = 7 * 24 * 60 * 60 * 1000 * 4 * 3; // 3 months
  const now = Date.now();
  const userid = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const userAgent = request?.headers.get('User-Agent') ?? 'Unknown';
  const ipAddress = request?.headers.get('CF-Connecting-IP') ?? request?.headers.get('X-Forwarded-For') ?? 'Unknown';

  const db = drizzle(env.ZEITVERTREIB_DATA);
  await db.insert(sessions).values({
    id: sessionId,
    userid,
    userAgent,
    ipAddress,
    createdAt: now,
    lastLoginAt: now,
    expiresAt: now + duration,
  });

  return sessionId;
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const sessionId =
    request.headers.get('Authorization')?.replace(/^Bearer /, '') ??
    request.headers.get('Cookie')?.match(/session=([^;]+)/)?.[1] ??
    null;

  if (sessionId) {
    const db = drizzle(env.ZEITVERTREIB_DATA);
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
}

// Steam helpers
export function generateSteamLoginUrl(request: Request): string {
  const url = new URL(request.url);
  const redirectParam = url.searchParams.get('redirect');

  let returnUrl = `${url.origin}/api/auth/steam/callback`;
  if (redirectParam) {
    returnUrl += `?redirect=${encodeURIComponent(redirectParam)}`;
  }

  const customReturnUrl = url.searchParams.get('return_url');
  if (customReturnUrl) {
    returnUrl = customReturnUrl;
  }

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': url.origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return `https://steamcommunity.com/openid/login?${params.toString()}`;
}

export async function verifySteamResponse(params: Record<string, string>, env: Env): Promise<boolean> {
  if (params['openid.mode'] !== 'id_res') return false;

  const verifyParams = new URLSearchParams(params);
  verifyParams.set('openid.mode', 'check_authentication');

  const response = await proxyFetch(
    'https://steamcommunity.com/openid/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    },
    env,
  );

  return (await response.text()).includes('is_valid:true');
}

export function extractSteamId(identity?: string): string | null {
  return identity?.replace('https://steamcommunity.com/openid/id/', '') || null;
}

export async function fetchSteamUserData(steamId: string, env: Env, ctx: ExecutionContext): Promise<SteamUser | null> {
  steamId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const staleThreshold = 24 * 60 * 60 * 7; // 1 week in seconds
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let steamUser: SteamUser | null = null;

  // Check cache first
  let cached = await db.select().from(steamCache).where(eq(steamCache.steamId, steamId)).get();
  const now = Math.floor(Date.now() / 1000);

  if (!cached) {
    await refreshSteamCache(steamId, env);
    cached = await db.select().from(steamCache).where(eq(steamCache.steamId, steamId)).get();
  }

  if (cached) {
    steamUser = {
      steamId: steamId,
      username: cached.username,
      avatarUrl: cached.avatarUrl,
    };

    if (now - cached.lastUpdated >= staleThreshold) {
      ctx.waitUntil(refreshSteamCache(steamId, env));
    }
  }

  return steamUser;
}

async function refreshSteamCache(steamId: string, env: Env): Promise<void> {
  steamId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const url =
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/` +
    `?key=${env.STEAM_API_KEY}&steamids=${steamId}`;

  const res = await proxyFetch(url, {}, env);
  if (!res.ok) {
    console.error(`Failed to refresh Steam cache for ${steamId}: ${res.status} ${res.statusText}`);
    return;
  }

  const data: any = await res.json();
  const player = data?.response?.players?.[0];

  if (!player || !steamId.includes(player.steamid)) {
    console.error(`Steam ID mismatch when refreshing cache for ${steamId}`);
    console.error('Data received:', data);
    return;
  }

  const username = player.personaname;
  const avatarUrl = player.avatarfull;

  if (!username || !avatarUrl) {
    console.error(`Invalid data when refreshing Steam cache for ${steamId}`);
    console.error('Data received:', data);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const db = drizzle(env.ZEITVERTREIB_DATA);

  await db
    .insert(steamCache)
    .values({
      steamId,
      username,
      avatarUrl,
      lastUpdated: now,
    })
    .onConflictDoUpdate({
      target: steamCache.steamId,
      set: {
        username,
        avatarUrl,
        lastUpdated: now,
      },
    });
}

// Discord Cache Stuff
export async function fetchDiscordUserData(
  discordId: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<{ displayName: string; username: string; avatarUrl: string } | null> {
  const staleThreshold = 24 * 60 * 60 * 7; // 1 week in seconds
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let cached = await db.select().from(discordCache).where(eq(discordCache.discordId, discordId)).get();
  const now = Math.floor(Date.now() / 1000);

  if (!cached) {
    await refreshDiscordCache(discordId, env);
    cached = await db.select().from(discordCache).where(eq(discordCache.discordId, discordId)).get();
  }

  if (cached) {
    if (now - cached.lastUpdated >= staleThreshold) {
      ctx.waitUntil(refreshDiscordCache(discordId, env));
    }
    return { displayName: cached.displayName, username: cached.username, avatarUrl: cached.avatarUrl };
  }

  return null;
}

async function refreshDiscordCache(discordId: string, env: Env): Promise<void> {
  const url = `https://discord.com/api/v10/users/${discordId}`;

  const res = await proxyFetch(url, { headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` } }, env);

  if (!res.ok) {
    console.error(`Failed to refresh Discord cache for ${discordId}: ${res.status} ${res.statusText}`);
    return;
  }

  const data: any = await res.json();
  const displayName = data.global_name || data.username;
  const username = data.username;
  const avatarUrl = data.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${data.avatar}.png` : '';

  if (!displayName || !username) {
    console.error(`Invalid data when refreshing Discord cache for ${discordId}`);
    console.error('Data received:', data);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const db = drizzle(env.ZEITVERTREIB_DATA);

  await db
    .insert(discordCache)
    .values({
      discordId,
      displayName,
      username,
      avatarUrl,
      lastUpdated: now,
    })
    .onConflictDoUpdate({
      target: discordCache.discordId,
      set: {
        displayName,
        username,
        avatarUrl,
        lastUpdated: now,
      },
    });
}

// Database helpers
export async function getPlayerData(
  steamId: string,
  db: ReturnType<typeof drizzle>,
  _env: Env,
): Promise<PlayerData | null> {
  try {
    const playerId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;
    console.log('Fetching player data for ID:', playerId);

    const result = await db.select().from(playerdata).where(eq(playerdata.id, playerId)).get();

    console.log('Player data result:', result);

    // Convert result to match PlayerData interface (map camelCase DB columns to snake_case interface)
    if (result) {
      return {
        id: result.id,
        experience: result.experience ?? undefined,
        playtime: result.playtime ?? undefined,
        roundsplayed: result.roundsplayed ?? undefined,
        usedmedkits: result.usedmedkits ?? undefined,
        usedcolas: result.usedcolas ?? undefined,
        pocketescapes: result.pocketescapes ?? undefined,
        usedadrenaline: result.usedadrenaline ?? undefined,
        snakehighscore: result.snakehighscore ?? undefined,
        fakerank: result.fakerank ?? undefined,
        fakerank_color: result.fakerankColor ?? undefined,
        killcount: result.killcount ?? undefined,
        deathcount: result.deathcount ?? undefined,
        fakerank_until: result.fakerankUntil ?? undefined,
        fakerankadmin_until: result.fakerankadminUntil ?? undefined,
        fakerankoverride_until: result.fakerankoverrideUntil ?? undefined,
        redeemed_codes: result.redeemedCodes ?? undefined,
      } as PlayerData;
    }

    return null;
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Failed to fetch player data');
  }
}

// New kills table helpers
export async function getPlayerKillsCount(steamId: string, db: ReturnType<typeof drizzle>, _env: Env): Promise<number> {
  try {
    const playerId = `${steamId}@steam`;
    const result = await db.select({ count: count() }).from(kills).where(eq(kills.attacker, playerId)).get();

    return result?.count || 0;
  } catch (error) {
    console.error('Error fetching kills count:', error);
    return 0;
  }
}

export async function getPlayerDeathsCount(
  steamId: string,
  db: ReturnType<typeof drizzle>,
  _env: Env,
): Promise<number> {
  try {
    const playerId = `${steamId}@steam`;
    const result = await db.select({ count: count() }).from(kills).where(eq(kills.target, playerId)).get();

    return result?.count || 0;
  } catch (error) {
    console.error('Error fetching deaths count:', error);
    return 0;
  }
}

export async function getPlayerLastKillers(
  steamId: string,
  db: ReturnType<typeof drizzle>,
  env: Env,
  ctx: ExecutionContext,
): Promise<Array<{ displayname: string; avatarmedium: string }>> {
  try {
    const playerId = `${steamId}@steam`;
    const results = await db
      .select({ attacker: kills.attacker })
      .from(kills)
      .where(eq(kills.target, playerId))
      .orderBy(kills.timestamp)
      .limit(5);

    if (!results || results.length === 0) {
      return [];
    }

    // Get Steam user data for each unique attacker (excluding anonymous)
    const uniqueAttackers = [...new Set(results.map((r) => r.attacker))].filter(
      (attacker) => attacker !== 'anonymous' && attacker !== null,
    ) as string[];

    const killersData = await Promise.all(
      uniqueAttackers.map(async (attacker) => {
        const steamUser = await fetchSteamUserData(attacker, env, ctx);
        return {
          displayname: steamUser?.username || 'Unknown Player',
          avatarmedium: steamUser?.avatarUrl || '',
        };
      }),
    );

    // Map back to preserve order and handle anonymous attackers
    return results.map((r) => {
      if (r.attacker === 'anonymous') {
        return { displayname: 'Anonymous', avatarmedium: '' };
      }
      const index = uniqueAttackers.indexOf(r.attacker!);
      return (
        killersData[index] || {
          displayname: 'Unknown Player',
          avatarmedium: '',
        }
      );
    });
  } catch (error) {
    console.error('Error fetching last killers:', error);
    return [];
  }
}

export async function getPlayerLastKills(
  steamId: string,
  db: ReturnType<typeof drizzle>,
  env: Env,
  ctx: ExecutionContext,
): Promise<Array<{ displayname: string; avatarmedium: string }>> {
  try {
    const playerId = `${steamId}@steam`;
    const results = await db
      .select({ target: kills.target })
      .from(kills)
      .where(eq(kills.attacker, playerId))
      .orderBy(kills.timestamp)
      .limit(5);

    if (!results || results.length === 0) {
      return [];
    }

    // Get Steam user data for each unique target (excluding anonymous)
    const uniqueTargets = [...new Set(results.map((r) => r.target))].filter(
      (target) => target !== 'anonymous' && target !== null,
    ) as string[];

    const targetsData = await Promise.all(
      uniqueTargets.map(async (target) => {
        const steamUser = await fetchSteamUserData(target, env, ctx);
        return {
          displayname: steamUser?.username || 'Unknown Player',
          avatarmedium: steamUser?.avatarUrl || '',
        };
      }),
    );

    // Map back to preserve order and handle anonymous targets
    return results.map((r) => {
      if (r.target === 'anonymous') {
        return { displayname: 'Anonymous', avatarmedium: '' };
      }
      const index = uniqueTargets.indexOf(r.target!);
      return (
        targetsData[index] || {
          displayname: 'Unknown Player',
          avatarmedium: '',
        }
      );
    });
  } catch (error) {
    console.error('Error fetching last kills:', error);
    return [];
  }
}

export async function mapPlayerDataToStats(
  playerData: PlayerData | null,
  username: string,
  avatarFull: string,
  steamId: string,
  db: ReturnType<typeof drizzle>,
  env: Env,
  ctx: ExecutionContext,
): Promise<Statistics> {
  // Get kills and deaths directly from playerdata, but still get last killers/kills from kills table
  const [lastKillers, lastKills] = await Promise.all([
    getPlayerLastKillers(steamId, db, env, ctx),
    getPlayerLastKills(steamId, db, env, ctx),
  ]);

  // const currentTimestamp = Math.floor(Date.now() / 1000);

  if (!playerData) {
    return {
      username,
      avatarFull,
      kills: 0,
      deaths: 0,
      experience: 0, // Represents ZV Coins
      playtime: 0,
      roundsplayed: 0,
      leaderboardposition: 0,
      usedmedkits: 0,
      usedcolas: 0,
      pocketescapes: 0,
      usedadrenaline: 0,
      snakehighscore: 0,
      fakerank_until: 0,
      fakerankadmin_until: 0,
      fakerankoverride_until: 0,
      lastkillers: lastKillers,
      lastkills: lastKills,
    };
  }

  // Determine fakerank access based on unix timestamp
  const fakerankUntil = Number(playerData.fakerank_until) || 0;
  const fakerankAdminUntil = Number(playerData.fakerankadmin_until) || 0;
  const fakerankOverrideUntil = Number(playerData.fakerankoverride_until) || 0;

  return {
    username,
    avatarFull,
    kills: Number(playerData.killcount) || 0,
    deaths: Number(playerData.deathcount) || 0,
    experience: Number(playerData.experience) || 0, // Represents ZV Coins
    playtime: Number(playerData.playtime) || 0,
    roundsplayed: Number(playerData.roundsplayed) || 0,
    leaderboardposition: 0,
    usedmedkits: Number(playerData.usedmedkits) || 0,
    usedcolas: Number(playerData.usedcolas) || 0,
    pocketescapes: Number(playerData.pocketescapes) || 0,
    usedadrenaline: Number(playerData.usedadrenaline) || 0,
    snakehighscore: Number(playerData.snakehighscore) || 0,
    fakerank_until: fakerankUntil,
    fakerankadmin_until: fakerankAdminUntil,
    fakerankoverride_until: fakerankOverrideUntil,
    lastkillers: lastKillers,
    lastkills: lastKills,
  };
}

// Login secret helpers
export async function generateLoginSecret(steamId: string, db: ReturnType<typeof drizzle>, _env: Env): Promise<string> {
  try {
    const secret = crypto.randomUUID();
    const expiresAt = Date.now() + 40 * 60 * 1000; // 40 minutes from now

    console.log('[AUTH] Generating login secret for steamId:', steamId);

    await db.insert(loginSecrets).values({
      secret: secret,
      steamId: steamId,
      expiresAt: expiresAt,
    });

    console.log('[AUTH] Login secret generated successfully:', secret);
    return secret;
  } catch (error) {
    console.error('[AUTH] Error generating login secret:', error);
    throw error;
  }
}

export async function validateLoginSecret(
  secret: string,
  db: ReturnType<typeof drizzle>,
  _env: Env,
): Promise<{ isValid: boolean; steamId?: string; error?: string }> {
  const result = await db
    .select({
      steamId: loginSecrets.steamId,
      expiresAt: loginSecrets.expiresAt,
    })
    .from(loginSecrets)
    .where(eq(loginSecrets.secret, secret))
    .get();

  if (!result) {
    return { isValid: false, error: 'Invalid login secret' };
  }

  if (Date.now() > result.expiresAt) {
    // Delete the expired secret
    await db.delete(loginSecrets).where(eq(loginSecrets.secret, secret));
    return { isValid: false, error: 'Invalid login secret' };
  }

  // Delete the secret after successful validation (one-time use)
  await db.delete(loginSecrets).where(eq(loginSecrets.secret, secret));

  return { isValid: true, steamId: result.steamId };
}

export async function cleanupExpiredLoginSecrets(db: ReturnType<typeof drizzle>, _env: Env): Promise<void> {
  try {
    console.log('[AUTH] Cleaning up expired login secrets');
    await db.delete(loginSecrets).where(lt(loginSecrets.expiresAt, Date.now()));
    console.log('[AUTH] Expired login secrets cleanup completed');
  } catch (error) {
    console.error('[AUTH] Error cleaning up expired login secrets:', error);
    throw error;
  }
}

export const increment = (column: AnyColumn, value = 1) => {
  return sql`${column} + ${value}`;
};

export const greatest = (column: AnyColumn, value: number) => {
  return sql`MAX(${column}, ${value})`;
};

export function checkApiKey(request: Request, apiKey: string): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);
  return token === apiKey;
}

export async function isTeam(steamId: string, env: Env): Promise<boolean> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let id = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const playerdataResult = await db.select().from(playerdata).where(eq(playerdata.id, id)).get();
  if (!playerdataResult || !playerdataResult.discordId) return false;

  const discordInfoResult = await db
    .select()
    .from(discordInfo)
    .where(eq(discordInfo.discordId, playerdataResult.discordId))
    .get();
  if (!discordInfoResult) return false;

  return discordInfoResult.teamSince > 0;
}

export async function isDonator(steamId: string, env: Env): Promise<boolean> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let id = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const playerdataResult = await db.select().from(playerdata).where(eq(playerdata.id, id)).get();
  if (!playerdataResult || !playerdataResult.discordId) return false;

  const discordInfoResult = await db
    .select()
    .from(discordInfo)
    .where(eq(discordInfo.discordId, playerdataResult.discordId))
    .get();
  if (!discordInfoResult) return false;

  return discordInfoResult.donatorSince > 0;
}

export async function isBooster(steamId: string, env: Env): Promise<boolean> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let id = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const playerdataResult = await db.select().from(playerdata).where(eq(playerdata.id, id)).get();
  if (!playerdataResult || !playerdataResult.discordId) return false;

  const discordInfoResult = await db
    .select()
    .from(discordInfo)
    .where(eq(discordInfo.discordId, playerdataResult.discordId))
    .get();
  if (!discordInfoResult) return false;

  return discordInfoResult.boosterSince > 0;
}

export async function isVip(steamId: string, env: Env): Promise<boolean> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let id = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  const playerdataResult = await db.select().from(playerdata).where(eq(playerdata.id, id)).get();
  if (!playerdataResult || !playerdataResult.discordId) return false;

  const discordInfoResult = await db
    .select()
    .from(discordInfo)
    .where(eq(discordInfo.discordId, playerdataResult.discordId))
    .get();
  if (!discordInfoResult) return false;

  return discordInfoResult.vipSince > 0;
}

/**
 * Fetch a spray image from S3 storage
 * @param sprayId - The ID of the spray to fetch
 * @param env - The environment with S3/MinIO credentials
 * @returns The base64 encoded image string or null if not found
 */
export async function getSprayImage(sprayId: number, env: Env): Promise<string | null> {
  // Initialize AWS client
  const aws = new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    service: 's3',
    region: 'us-east-1',
  });

  // Construct S3 path and URL
  const base64Url = `https://s3.zeitvertreib.vip/test/sprays/${sprayId}.base64`;

  try {
    // Sign and fetch the request
    const base64Request = await aws.sign(base64Url, { method: 'GET' });
    const base64Response = await fetch(base64Request);

    if (base64Response.ok) {
      return await base64Response.text();
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch spray image ${sprayId}:`, error);
    return null;
  }
}

/**
 *
 * Fetch CedMod bans for a given Steam ID
 * @param steamId
 * @param env
 * @returns
 */
export async function getCedModBans(
  steamId: string,
  env: Env,
): Promise<{ id: number; reason: string; bannedAt: number; duration: number; issuer: string }[]> {
  try {
    const normalizedSteamId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;
    const url = new URL('https://cedmod.zeitvertreib.vip/Api/BanLog/Query');
    url.searchParams.set('q', normalizedSteamId);
    url.searchParams.set('idOnly', 'true');
    url.searchParams.set('banList', '11026');
    url.searchParams.set('page', '0');
    url.searchParams.set('max', '50');

    const response = await proxyFetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.CEDMOD_API_KEY_BANS}`,
          'Content-Type': 'application/json',
        },
      },
      env,
    );

    if (!response.ok) {
      console.error(`Failed to fetch CedMod bans for ${normalizedSteamId}: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: any = await response.json();

    if (!data.players || !Array.isArray(data.players)) {
      return [];
    }

    return data.players.map((player: any) => ({
      id: player.id,
      reason: player.reason || 'Unknown reason',
      bannedAt: new Date(`${player.timeStamp}Z`).getTime(),
      duration: (player.duration || 0) * 60 * 1000,
      issuer: player.issuer || 'Unknown issuer',
    }));
  } catch (error) {
    console.error(`Error fetching CedMod bans for ${steamId}:`, error);
    return [];
  }
}

export async function isCedModBanned(steamId: string, env: Env): Promise<boolean> {
  try {
    const normalizedSteamId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;
    const url = new URL('https://cedmod.zeitvertreib.vip/Api/Ban/Query');
    url.searchParams.set('q', normalizedSteamId);
    url.searchParams.set('banList', '11026');
    url.searchParams.set('page', '0');
    url.searchParams.set('max', '10');
    url.searchParams.set('idOnly', 'true');

    const response = await proxyFetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.CEDMOD_API_KEY_BANS}`,
          'Content-Type': 'application/json',
        },
      },
      env,
    );

    if (!response.ok) {
      console.error(
        `Failed to check CedMod active bans for ${normalizedSteamId}: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    const data: any = await response.json();
    return (data.total ?? 0) > 0;
  } catch (error) {
    console.error(`Error checking CedMod active bans for ${steamId}:`, error);
    return false;
  }
}

export async function getCedModWarns(
  steamId: string,
  env: Env,
): Promise<{ id: number; reason: string; warnedAt: number; issuer: string }[]> {
  try {
    const normalizedSteamId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;
    const url = new URL('https://cedmod.zeitvertreib.vip/Api/Warn/Query');
    url.searchParams.set('q', normalizedSteamId);
    url.searchParams.set('idOnly', 'true');
    url.searchParams.set('banList', '11026');
    url.searchParams.set('page', '0');
    url.searchParams.set('max', '50');

    const response = await proxyFetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.CEDMOD_API_KEY_WARNS}`,
          'Content-Type': 'application/json',
        },
      },
      env,
    );

    if (!response.ok) {
      console.error(`Failed to fetch CedMod warns for ${normalizedSteamId}: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: any = await response.json();

    if (!data.players || !Array.isArray(data.players)) {
      return [];
    }

    return data.players.map((player: any) => ({
      id: player.id,
      reason: player.reason || 'Unknown reason',
      warnedAt: new Date(`${player.timeStamp}Z`).getTime(),
      issuer: player.issuer || 'Unknown issuer',
    }));
  } catch (error) {
    console.error(`Error fetching CedMod warns for ${steamId}:`, error);
    return [];
  }
}

/**
 * Fetch all latest in-game reports from cedmod.
 */
export async function getCedModLastReports(
  env: Env,
): Promise<{ id: number; reporterId: string; reportedId: string; reason: string; reportedAt: number }[]> {
  try {
    const headers = {
      Authorization: `Bearer ${env.CEDMOD_API_KEY_REPORTS}`,
      'Content-Type': 'application/json',
    };

    const userUrl = new URL('https://cedmod.zeitvertreib.vip/Api/Report/Query');
    userUrl.searchParams.set('page', '0');
    userUrl.searchParams.set('q', 'none@custom'); // CedMod needs this to get ALL reports
    userUrl.searchParams.set('max', '10');

    const reportsResponse = await proxyFetch(userUrl.toString(), { method: 'GET', headers }, env);

    if (!reportsResponse.ok) {
      console.error(`Failed to fetch CedMod last reports: ${reportsResponse.status} ${reportsResponse.statusText}`);
      return [];
    }

    const data: any = await reportsResponse.json();
    if (!data.players || !Array.isArray(data.players)) {
      return [];
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    return data.players
      .map((report: any) => ({
        id: report.id,
        reporterId: report.reporterId || 'Unknown reporter',
        reportedId: report.reportedId || 'Unknown reported',
        reason: report.reason || 'Unknown reason',
        reportedAt: new Date(`${report.created}Z`).getTime(),
      }))
      .filter((report: { reportedAt: number }) => report.reportedAt >= oneHourAgo);
  } catch (error) {
    console.error(`Error fetching CedMod last reports:`, error);
    return [];
  }
}
