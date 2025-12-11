// Consolidated utilities
import type { SessionData, SteamUser, Statistics, PlayerData } from '@zeitvertreib/types';
import { proxyFetch } from './proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, lt, sql } from 'drizzle-orm';
import { playerdata, kills, loginSecrets, discordInfo } from './db/schema.js';
import { AnyColumn } from 'drizzle-orm';

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

  const raw = await env.ZEITVERTREIB_SESSIONS.get(sessionId);
  if (!raw) return { status: 'invalid' };

  const session: SessionData = JSON.parse(raw);

  if (Date.now() > session.expiresAt) {
    await env.ZEITVERTREIB_SESSIONS.delete(sessionId);
    return { status: 'expired' };
  }

  return { status: 'valid', steamId: session.steamId };
}

export async function createSession(steamId: string, steamUser: SteamUser, env: Env): Promise<string> {
  const sessionId = crypto.randomUUID();
  const duration = 7 * 24 * 60 * 60 * 1000 * 4 * 3; // 3 months
  const now = Date.now();

  const sessionData: SessionData = {
    steamId,
    steamUser,
    createdAt: now,
    expiresAt: now + duration,
  };

  await env.ZEITVERTREIB_SESSIONS.put(sessionId, JSON.stringify(sessionData), {
    expirationTtl: Math.floor(duration / 1000),
  });

  return sessionId;
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const sessionId =
    request.headers.get('Authorization')?.replace(/^Bearer /, '') ??
    request.headers.get('Cookie')?.match(/session=([^;]+)/)?.[1] ??
    null;

  if (sessionId) {
    await env.ZEITVERTREIB_SESSIONS.delete(sessionId);
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

/**
 * Fetches Steam user data with intelligent caching strategy.
 *
 * Caching strategy:
 * - If no cache exists: fetch from Steam and cache the result
 * - If cache exists and is less than 1 hour old: use cached data
 * - If cache exists but is older than 1 hour: try to fetch fresh data from Steam
 *   - If Steam returns new data: update cache and return fresh data
 *   - If Steam returns an error: use stale cache regardless of age
 * - Cache is NEVER cleared, always provides fallback data
 *
 * @param steamId - The Steam ID to fetch data for
 * @param apiKey - Steam API key
 * @param env - Cloudflare environment with KV access
 * @returns Steam user data or null if not found
 */
export async function fetchSteamUserData(steamId: string, apiKey: string, env: Env): Promise<SteamUser | null> {
  const cacheKey = `steam_user:${steamId}`;
  let cachedData: { userData: SteamUser; cachedAt: number } | null = null;

  // Try to get cached data first
  try {
    const cached = await env.SESSIONS.get(cacheKey);
    if (cached) {
      cachedData = JSON.parse(cached) as {
        userData: SteamUser;
        cachedAt: number;
      };
      const cacheAge = Date.now() - cachedData.cachedAt;
      const maxFreshAge = 60 * 60 * 1000; // 1 hour

      // If cache is fresh (less than 1 hour), use it immediately
      if (cacheAge < maxFreshAge) {
        console.log(`Using fresh cached Steam user data for ${steamId} (age: ${Math.round(cacheAge / 1000)}s)`);
        console.log('Chache data: ' + cachedData);
        return cachedData.userData;
      }

      console.log(
        `Cache is stale for Steam user ${steamId} (age: ${Math.round(cacheAge / 1000)}s), attempting to refresh...`,
      );
    } else {
      console.log(`No cache found for Steam user ${steamId}, fetching fresh data...`);
    }
  } catch (cacheError) {
    console.warn('Failed to read from cache:', cacheError);
  }

  // If we reach here, either no cache exists OR cache is older than 1 hour
  // Try to fetch fresh data from Steam
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`;
    console.log('Fetching Steam user data from:', url.replace(apiKey, '***'));

    const response = await proxyFetch(url, {}, env);
    console.log('Steam API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Steam API error response:', errorText);
      throw new Error(`Steam API returned ${response.status}: ${errorText}`);
    }

    const responseText = await response.text();
    console.log('Steam API response body:', responseText.substring(0, 200));

    let data;
    try {
      data = JSON.parse(responseText) as { response: { players: SteamUser[] } };
    } catch (parseError) {
      console.error('Failed to parse Steam API response as JSON:', parseError);
      throw new Error(`Steam API returned invalid JSON: ${responseText.substring(0, 100)}`);
    }

    const userData = data.response?.players?.[0] || null;

    // Cache the successful response (never expires, but we track freshness)
    if (userData) {
      try {
        const cacheData = {
          userData,
          cachedAt: Date.now(),
        };

        // Store without expiration - we manage freshness manually
        await env.SESSIONS.put(cacheKey, JSON.stringify(cacheData));
        console.log(`Updated cache with fresh Steam user data for ${steamId}`);
      } catch (cacheError) {
        console.warn('Failed to update cache with fresh data:', cacheError);
      }
    }

    return userData;
  } catch (error) {
    console.error('Error fetching fresh Steam user data:', error);

    // Steam API failed - use stale cache if available, regardless of age
    if (cachedData) {
      const cacheAge = Date.now() - cachedData.cachedAt;
      console.log(`Steam API failed, using stale cached data for ${steamId} (age: ${Math.round(cacheAge / 1000)}s)`);
      return cachedData.userData;
    }

    // No cache available and Steam API failed
    console.log(`No cached data available for ${steamId} and Steam API failed`);
    return null;
  }
}

export async function refreshSteamUserData(steamId: string, apiKey: string, env: Env): Promise<SteamUser | null> {
  // Force a refresh attempt by fetching data (cache will be used as fallback if Steam fails)
  // We don't clear cache anymore, just attempt to get fresh data
  console.log(`Attempting to refresh Steam user data for ${steamId}...`);
  return fetchSteamUserData(steamId, apiKey, env);
}

// Database helpers
export async function getPlayerData(
  steamId: string,
  db: ReturnType<typeof drizzle>,
  _env: Env,
): Promise<PlayerData | null> {
  try {
    const playerId = `${steamId}@steam`;
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
        const steamId = attacker.replace('@steam', '');
        const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
        return {
          displayname: steamUser?.personaname || 'Unknown Player',
          avatarmedium: steamUser?.avatarmedium || '',
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
        const steamId = target.replace('@steam', '');
        const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
        return {
          displayname: steamUser?.personaname || 'Unknown Player',
          avatarmedium: steamUser?.avatarmedium || '',
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
): Promise<Statistics> {
  // Get kills and deaths directly from playerdata, but still get last killers/kills from kills table
  const [lastKillers, lastKills] = await Promise.all([
    getPlayerLastKillers(steamId, db, env),
    getPlayerLastKills(steamId, db, env),
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

export async function isModerator(steamId: string, env: Env): Promise<boolean> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  let id = steamId.endsWith("@steam") ? steamId : `${steamId}@steam`;

  const playerdataResult = await db
    .select()
    .from(playerdata)
    .where(eq(playerdata.id, id))
    .get(); if (!playerdataResult || !playerdataResult.discordId) return false;

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
  let id = steamId.endsWith("@steam") ? steamId : `${steamId}@steam`;

  const playerdataResult = await db
    .select()
    .from(playerdata)
    .where(eq(playerdata.id, id))
    .get(); if (!playerdataResult || !playerdataResult.discordId) return false;

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
  let id = steamId.endsWith("@steam") ? steamId : `${steamId}@steam`;

  const playerdataResult = await db
    .select()
    .from(playerdata)
    .where(eq(playerdata.id, id))
    .get(); if (!playerdataResult || !playerdataResult.discordId) return false;

  const discordInfoResult = await db
    .select()
    .from(discordInfo)
    .where(eq(discordInfo.discordId, playerdataResult.discordId))
    .get();
  if (!discordInfoResult) return false;

  return discordInfoResult.boosterSince > 0;
}
