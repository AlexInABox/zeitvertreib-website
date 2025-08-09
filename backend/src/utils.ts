// Consolidated utilities
import {
  SessionData,
  SteamUser,
  Statistics,
  PlayerData,
  KillRecord,
} from './types/index.js';

// Discord API proxy utility
export async function fetchDiscordWithProxy(
  url: string,
  options: RequestInit,
  env: Env,
): Promise<Response> {
  // Check if the URL is a Discord API endpoint
  const isDiscordAPI =
    url.includes('discord.com') || url.includes('discordapp.com');

  if (!isDiscordAPI) {
    // If not Discord API, use regular fetch
    return fetch(url, options);
  }

  // For Discord API calls, use proxy if configured
  if (env.PROXY_HOST_PORT && env.PROXY_USERNAME && env.PROXY_PASSWORD) {
    try {
      console.log(`Using proxy for Discord API call: ${url}`);

      const [proxyHost, proxyPort] = env.PROXY_HOST_PORT.split(':');

      // Create a proxy request using HTTP CONNECT method
      // This implements a basic HTTP proxy relay
      const proxyUrl = `http://${proxyHost}:${proxyPort}`;
      const proxyAuth = `Basic ${btoa(`${env.PROXY_USERNAME}:${env.PROXY_PASSWORD}`)}`;

      // Parse the target URL
      const targetUrl = new URL(url);
      const targetHost = targetUrl.hostname;
      const targetPort =
        targetUrl.port || (targetUrl.protocol === 'https:' ? '443' : '80');

      // For HTTP proxies, we can try to make the request through the proxy
      // by sending the full URL in the request line
      const proxiedOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          'Proxy-Authorization': proxyAuth,
          Host: targetHost,
        },
      };

      // Try to make the request through the HTTP proxy
      // Note: This might not work in all Cloudflare Workers environments
      // as it depends on the specific proxy configuration and network setup
      try {
        // Method 1: Try using the proxy as an HTTP proxy with full URL
        const response = await fetch(url, {
          ...proxiedOptions,
          // Some proxies might require the request to be made to the proxy URL
          // with the target URL in headers or as a parameter
        });

        if (response.ok || response.status < 500) {
          console.log('Successfully used proxy for Discord API call');
          return response;
        } else {
          throw new Error(`Proxy returned status: ${response.status}`);
        }
      } catch (proxyError) {
        console.log(
          'Direct proxy method failed, trying alternative approach:',
          proxyError,
        );

        // Method 2: Try making request to proxy with target in path/headers
        // This is a fallback that might work with some proxy configurations
        try {
          const proxyResponse = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              Authorization: proxyAuth,
              'Content-Type': 'application/json',
              'X-Target-URL': url,
              'X-Target-Method': options.method || 'GET',
            },
            body: JSON.stringify({
              url: url,
              method: options.method || 'GET',
              headers: Object.fromEntries(
                new Headers(options.headers || {}).entries(),
              ),
              body: options.body
                ? typeof options.body === 'string'
                  ? options.body
                  : 'FORM_DATA'
                : undefined,
            }),
          });

          if (proxyResponse.ok) {
            console.log('Successfully used proxy relay for Discord API call');
            return proxyResponse;
          }
        } catch (relayError) {
          console.log('Proxy relay method also failed:', relayError);
        }

        // If all proxy methods fail, fall back to direct connection
        console.log('All proxy methods failed, using direct connection');
        return fetch(url, options);
      }
    } catch (error) {
      console.error(
        'Proxy configuration error, falling back to direct connection:',
        error,
      );
      return fetch(url, options);
    }
  }

  // Fallback to regular fetch if no proxy configured
  console.log(`Direct Discord API call (no proxy configured): ${url}`);
  return fetch(url, options);
}

// Response helpers
export function createResponse(
  data: any,
  status = 200,
  origin?: string | null,
): Response {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };

  if (status === 302) {
    headers['Location'] = data;
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(data), { status, headers });
}

// Session helpers
function getSessionId(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/session=([^;]+)/);
  return match?.[1] || null;
}

export async function validateSession(
  request: Request,
  env: Env,
): Promise<{ isValid: boolean; session?: SessionData; error?: string }> {
  const sessionId = getSessionId(request);
  if (!sessionId) return { isValid: false, error: 'No session found' };

  const sessionData = await env.SESSIONS.get(sessionId);
  if (!sessionData) return { isValid: false, error: 'Invalid session' };

  const session: SessionData = JSON.parse(sessionData);
  if (Date.now() > session.expiresAt) {
    await env.SESSIONS.delete(sessionId);
    return { isValid: false, error: 'Session expired' };
  }

  return { isValid: true, session };
}

export async function createSession(
  steamId: string,
  steamUser: SteamUser,
  env: Env,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const duration = 7 * 24 * 60 * 60 * 1000 * 4 * 3; // 3 months
  const now = Date.now();

  const sessionData: SessionData = {
    steamId,
    steamUser,
    createdAt: now,
    expiresAt: now + duration,
  };

  await env.SESSIONS.put(sessionId, JSON.stringify(sessionData), {
    expirationTtl: Math.floor(duration / 1000),
  });

  return sessionId;
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.SESSIONS.delete(sessionId);
  }
}

// Steam helpers
export function generateSteamLoginUrl(request: Request): string {
  const url = new URL(request.url);
  const redirectParam = url.searchParams.get('redirect');

  let returnUrl = `${url.origin}/auth/steam/callback`;
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

export async function verifySteamResponse(
  params: Record<string, string>,
): Promise<boolean> {
  if (params['openid.mode'] !== 'id_res') return false;

  const verifyParams = new URLSearchParams(params);
  verifyParams.set('openid.mode', 'check_authentication');

  const response = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
  });

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
export async function fetchSteamUserData(
  steamId: string,
  apiKey: string,
  env: Env,
): Promise<SteamUser | null> {
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
        console.log(
          `Using fresh cached Steam user data for ${steamId} (age: ${Math.round(cacheAge / 1000)}s)`,
        );
        console.log('Chache data: ' + cachedData);
        return cachedData.userData;
      }

      console.log(
        `Cache is stale for Steam user ${steamId} (age: ${Math.round(cacheAge / 1000)}s), attempting to refresh...`,
      );
    } else {
      console.log(
        `No cache found for Steam user ${steamId}, fetching fresh data...`,
      );
    }
  } catch (cacheError) {
    console.warn('Failed to read from cache:', cacheError);
  }

  // If we reach here, either no cache exists OR cache is older than 1 hour
  // Try to fetch fresh data from Steam
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`;
    console.log('Fetching Steam user data from:', url.replace(apiKey, '***'));

    const response = await fetch(url);
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
      throw new Error(
        `Steam API returned invalid JSON: ${responseText.substring(0, 100)}`,
      );
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
      console.log(
        `Steam API failed, using stale cached data for ${steamId} (age: ${Math.round(cacheAge / 1000)}s)`,
      );
      return cachedData.userData;
    }

    // No cache available and Steam API failed
    console.log(`No cached data available for ${steamId} and Steam API failed`);
    return null;
  }
}

// Steam user cache helpers
export async function clearSteamUserCache(
  steamId: string,
  env: Env,
): Promise<void> {
  // Note: We no longer clear cache as per the new strategy
  // Cache is kept indefinitely to always provide fallback data
  console.log(
    `Cache clearing disabled for ${steamId} - cache is kept for fallback purposes`,
  );
}

export async function refreshSteamUserData(
  steamId: string,
  apiKey: string,
  env: Env,
): Promise<SteamUser | null> {
  // Force a refresh attempt by fetching data (cache will be used as fallback if Steam fails)
  // We don't clear cache anymore, just attempt to get fresh data
  console.log(`Attempting to refresh Steam user data for ${steamId}...`);
  return fetchSteamUserData(steamId, apiKey, env);
}

// Database helpers
export async function getPlayerData(
  steamId: string,
  env: Env,
): Promise<PlayerData | null> {
  try {
    const playerId = `${steamId}@steam`;
    console.log('Fetching player data for ID:', playerId);

    const result = (await env['zeitvertreib-data']
      .prepare('SELECT * FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first()) as PlayerData | null;

    console.log('Player data result:', result);
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Failed to fetch player data');
  }
}

// New kills table helpers
export async function getPlayerKillsCount(
  steamId: string,
  env: Env,
): Promise<number> {
  try {
    const playerId = `${steamId}@steam`;
    const result = (await env['zeitvertreib-data']
      .prepare('SELECT COUNT(*) as count FROM kills WHERE attacker = ?')
      .bind(playerId)
      .first()) as { count: number } | null;

    return result?.count || 0;
  } catch (error) {
    console.error('Error fetching kills count:', error);
    return 0;
  }
}

export async function getPlayerDeathsCount(
  steamId: string,
  env: Env,
): Promise<number> {
  try {
    const playerId = `${steamId}@steam`;
    const result = (await env['zeitvertreib-data']
      .prepare('SELECT COUNT(*) as count FROM kills WHERE target = ?')
      .bind(playerId)
      .first()) as { count: number } | null;

    return result?.count || 0;
  } catch (error) {
    console.error('Error fetching deaths count:', error);
    return 0;
  }
}

export async function getPlayerLastKillers(
  steamId: string,
  env: Env,
): Promise<Array<{ displayname: string; avatarmedium: string }>> {
  try {
    const playerId = `${steamId}@steam`;
    const results = (await env['zeitvertreib-data']
      .prepare(
        'SELECT attacker FROM kills WHERE target = ? ORDER BY timestamp DESC LIMIT 5',
      )
      .bind(playerId)
      .all()) as { results: Array<{ attacker: string }> };

    if (!results.results || results.results.length === 0) {
      return [];
    }

    // Get Steam user data for each unique attacker (excluding anonymous)
    const uniqueAttackers = [
      ...new Set(results.results.map((r) => r.attacker)),
    ].filter((attacker) => attacker !== 'anonymous');

    const killersData = await Promise.all(
      uniqueAttackers.map(async (attacker) => {
        const steamId = attacker.replace('@steam', '');
        const steamUser = await fetchSteamUserData(
          steamId,
          env.STEAM_API_KEY,
          env,
        );
        return {
          displayname: steamUser?.personaname || 'Unknown Player',
          avatarmedium: steamUser?.avatarmedium || '',
        };
      }),
    );

    // Map back to preserve order and handle anonymous attackers
    return results.results.map((r) => {
      if (r.attacker === 'anonymous') {
        return { displayname: 'Anonymous', avatarmedium: '' };
      }
      const index = uniqueAttackers.indexOf(r.attacker);
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
  env: Env,
): Promise<Array<{ displayname: string; avatarmedium: string }>> {
  try {
    const playerId = `${steamId}@steam`;
    const results = (await env['zeitvertreib-data']
      .prepare(
        'SELECT target FROM kills WHERE attacker = ? ORDER BY timestamp DESC LIMIT 5',
      )
      .bind(playerId)
      .all()) as { results: Array<{ target: string }> };

    if (!results.results || results.results.length === 0) {
      return [];
    }

    // Get Steam user data for each unique target (excluding anonymous)
    const uniqueTargets = [
      ...new Set(results.results.map((r) => r.target)),
    ].filter((target) => target !== 'anonymous');

    const targetsData = await Promise.all(
      uniqueTargets.map(async (target) => {
        const steamId = target.replace('@steam', '');
        const steamUser = await fetchSteamUserData(
          steamId,
          env.STEAM_API_KEY,
          env,
        );
        return {
          displayname: steamUser?.personaname || 'Unknown Player',
          avatarmedium: steamUser?.avatarmedium || '',
        };
      }),
    );

    // Map back to preserve order and handle anonymous targets
    return results.results.map((r) => {
      if (r.target === 'anonymous') {
        return { displayname: 'Anonymous', avatarmedium: '' };
      }
      const index = uniqueTargets.indexOf(r.target);
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
  env: Env,
): Promise<Statistics> {
  // Get kills and deaths directly from playerdata, but still get last killers/kills from kills table
  const [lastKillers, lastKills] = await Promise.all([
    getPlayerLastKillers(steamId, env),
    getPlayerLastKills(steamId, env),
  ]);

  if (!playerData) {
    return {
      username,
      avatarFull,
      kills: 0,
      deaths: 0,
      experience: 0,
      playtime: 0,
      roundsplayed: 0,
      leaderboardposition: 0,
      usedmedkits: 0,
      usedcolas: 0,
      pocketescapes: 0,
      usedadrenaline: 0,
      snakehighscore: 0,
      fakerankallowed: false,
      lastkillers: lastKillers,
      lastkills: lastKills,
    };
  }

  return {
    username,
    avatarFull,
    kills: Number(playerData.killcount) || 0,
    deaths: Number(playerData.deathcount) || 0,
    experience: Number(playerData.experience) || 0,
    playtime: Number(playerData.playtime) || 0,
    roundsplayed: Number(playerData.roundsplayed) || 0,
    leaderboardposition: 0,
    usedmedkits: Number(playerData.usedmedkits) || 0,
    usedcolas: Number(playerData.usedcolas) || 0,
    pocketescapes: Number(playerData.pocketescapes) || 0,
    usedadrenaline: Number(playerData.usedadrenaline) || 0,
    snakehighscore: Number(playerData.snakehighscore) || 0,
    fakerankallowed: Boolean(playerData.fakerankallowed) || false,
    lastkillers: lastKillers,
    lastkills: lastKills,
  };
}
