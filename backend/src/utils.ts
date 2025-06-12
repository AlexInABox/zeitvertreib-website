// Consolidated utilities
import { SessionData, SteamUser, Statistics, PlayerData, KillRecord } from './types/index.js';

// Response helpers
export function createResponse(data: any, status = 200, origin?: string | null): Response {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json'
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

export async function validateSession(request: Request, env: Env): Promise<{ isValid: boolean; session?: SessionData; error?: string }> {
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

export async function createSession(steamId: string, steamUser: SteamUser, env: Env): Promise<string> {
    const sessionId = crypto.randomUUID();
    const duration = 7 * 24 * 60 * 60 * 1000; // 7 days
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
    const returnUrl = url.searchParams.get('return_url') || `${url.origin}/auth/steam/callback`;

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

export async function verifySteamResponse(params: Record<string, string>): Promise<boolean> {
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
 * Fetches Steam user data with intelligent caching to handle rate limiting.
 * 
 * Caching strategy:
 * - Fresh data is preferred for up to 1 hour
 * - Cached data is kept for up to 24 hours
 * - On rate limits (429) or service unavailable (503), serves stale cache if available
 * - Falls back to stale cache on any error as last resort
 * 
 * @param steamId - The Steam ID to fetch data for
 * @param apiKey - Steam API key
 * @param env - Cloudflare environment with KV access
 * @returns Steam user data or null if not found
 */
export async function fetchSteamUserData(steamId: string, apiKey: string, env: Env): Promise<SteamUser | null> {
    const cacheKey = `steam_user:${steamId}`;

    // Try to get cached data first
    try {
        const cachedData = await env.SESSIONS.get(cacheKey);
        if (cachedData) {
            const cached = JSON.parse(cachedData) as { userData: SteamUser; cachedAt: number };
            const cacheAge = Date.now() - cached.cachedAt;
            const maxCacheAge = 60 * 60 * 1000; // 1 hour cache

            if (cacheAge < maxCacheAge) {
                console.log(`Using cached Steam user data for ${steamId} (age: ${Math.round(cacheAge / 1000)}s)`);
                return cached.userData;
            }

            console.log(`Cache expired for Steam user ${steamId} (age: ${Math.round(cacheAge / 1000)}s)`);
        }
    } catch (cacheError) {
        console.warn('Failed to read from cache:', cacheError);
    }

    try {
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`;
        console.log('Fetching Steam user data from:', url.replace(apiKey, '***'));

        const response = await fetch(url);
        console.log('Steam API response status:', response.status);
        console.log('Steam API response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Steam API error response:', errorText);

            // If we get a 429 (rate limit) or 503 (service unavailable), try to return stale cache if available
            if (response.status === 429 || response.status === 503) {
                console.log('Rate limited or service unavailable, checking for stale cache...');
                try {
                    const staleData = await env.SESSIONS.get(cacheKey);
                    if (staleData) {
                        const stale = JSON.parse(staleData) as { userData: SteamUser; cachedAt: number };
                        console.log('Using stale cached data due to rate limiting');
                        return stale.userData;
                    }
                } catch (staleCacheError) {
                    console.warn('Failed to read stale cache:', staleCacheError);
                }
            }

            throw new Error(`Steam API returned ${response.status}: ${errorText}`);
        }

        const responseText = await response.text();
        console.log('Steam API response body:', responseText.substring(0, 200));

        let data;
        try {
            data = JSON.parse(responseText) as { response: { players: SteamUser[] } };
        } catch (parseError) {
            console.error('Failed to parse Steam API response as JSON:', parseError);
            console.error('Response was:', responseText);
            throw new Error(`Steam API returned invalid JSON: ${responseText.substring(0, 100)}`);
        }

        const userData = data.response?.players?.[0] || null;

        // Cache the successful response
        if (userData) {
            try {
                const cacheData = {
                    userData,
                    cachedAt: Date.now()
                };

                // Cache for 24 hours (but prefer fresh data after 1 hour)
                await env.SESSIONS.put(cacheKey, JSON.stringify(cacheData), {
                    expirationTtl: 24 * 60 * 60 // 24 hours
                });

                console.log(`Cached Steam user data for ${steamId}`);
            } catch (cacheError) {
                console.warn('Failed to cache Steam user data:', cacheError);
            }
        }

        return userData;
    } catch (error) {
        console.error('Error fetching Steam user data:', error);

        // Try to return stale cache as a last resort
        try {
            const fallbackData = await env.SESSIONS.get(cacheKey);
            if (fallbackData) {
                const fallback = JSON.parse(fallbackData) as { userData: SteamUser; cachedAt: number };
                console.log('Using stale cached data as fallback');
                return fallback.userData;
            }
        } catch (fallbackError) {
            console.warn('Failed to read fallback cache:', fallbackError);
        }

        return null;
    }
}

// Steam user cache helpers
export async function clearSteamUserCache(steamId: string, env: Env): Promise<void> {
    const cacheKey = `steam_user:${steamId}`;
    try {
        await env.SESSIONS.delete(cacheKey);
        console.log(`Cleared Steam user cache for ${steamId}`);
    } catch (error) {
        console.warn('Failed to clear Steam user cache:', error);
    }
}

export async function refreshSteamUserData(steamId: string, apiKey: string, env: Env): Promise<SteamUser | null> {
    // Clear cache first, then fetch fresh data
    await clearSteamUserCache(steamId, env);
    return fetchSteamUserData(steamId, apiKey, env);
}

// Database helpers
export async function getPlayerData(steamId: string, env: Env): Promise<PlayerData | null> {
    try {
        const playerId = `${steamId}@steam`;
        console.log('Fetching player data for ID:', playerId);

        const result = await env['zeitvertreib-data']
            .prepare('SELECT * FROM playerdata WHERE id = ?')
            .bind(playerId)
            .first() as PlayerData | null;

        console.log('Player data result:', result);
        return result;
    } catch (error) {
        console.error('Database error:', error);
        throw new Error('Failed to fetch player data');
    }
}

// New kills table helpers
export async function getPlayerKillsCount(steamId: string, env: Env): Promise<number> {
    try {
        const playerId = `${steamId}@steam`;
        const result = await env['zeitvertreib-data']
            .prepare('SELECT COUNT(*) as count FROM kills WHERE attacker = ?')
            .bind(playerId)
            .first() as { count: number } | null;

        return result?.count || 0;
    } catch (error) {
        console.error('Error fetching kills count:', error);
        return 0;
    }
}

export async function getPlayerDeathsCount(steamId: string, env: Env): Promise<number> {
    try {
        const playerId = `${steamId}@steam`;
        const result = await env['zeitvertreib-data']
            .prepare('SELECT COUNT(*) as count FROM kills WHERE target = ?')
            .bind(playerId)
            .first() as { count: number } | null;

        return result?.count || 0;
    } catch (error) {
        console.error('Error fetching deaths count:', error);
        return 0;
    }
}

export async function getPlayerLastKillers(steamId: string, env: Env): Promise<Array<{ displayname: string; avatarmedium: string }>> {
    try {
        const playerId = `${steamId}@steam`;
        const results = await env['zeitvertreib-data']
            .prepare('SELECT attacker FROM kills WHERE target = ? ORDER BY timestamp DESC LIMIT 5')
            .bind(playerId)
            .all() as { results: Array<{ attacker: string }> };

        if (!results.results || results.results.length === 0) {
            return [];
        }

        // Get Steam user data for each unique attacker (excluding anonymous)
        const uniqueAttackers = [...new Set(results.results.map(r => r.attacker))]
            .filter(attacker => attacker !== 'anonymous');

        const killersData = await Promise.all(
            uniqueAttackers.map(async (attacker) => {
                const steamId = attacker.replace('@steam', '');
                const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
                return {
                    displayname: steamUser?.personaname || 'Unknown Player',
                    avatarmedium: steamUser?.avatarmedium || ''
                };
            })
        );

        // Map back to preserve order and handle anonymous attackers
        return results.results.map(r => {
            if (r.attacker === 'anonymous') {
                return { displayname: 'Anonymous', avatarmedium: '' };
            }
            const index = uniqueAttackers.indexOf(r.attacker);
            return killersData[index] || { displayname: 'Unknown Player', avatarmedium: '' };
        });
    } catch (error) {
        console.error('Error fetching last killers:', error);
        return [];
    }
}

export async function getPlayerLastKills(steamId: string, env: Env): Promise<Array<{ displayname: string; avatarmedium: string }>> {
    try {
        const playerId = `${steamId}@steam`;
        const results = await env['zeitvertreib-data']
            .prepare('SELECT target FROM kills WHERE attacker = ? ORDER BY timestamp DESC LIMIT 5')
            .bind(playerId)
            .all() as { results: Array<{ target: string }> };

        if (!results.results || results.results.length === 0) {
            return [];
        }

        // Get Steam user data for each unique target (excluding anonymous)
        const uniqueTargets = [...new Set(results.results.map(r => r.target))]
            .filter(target => target !== 'anonymous');

        const targetsData = await Promise.all(
            uniqueTargets.map(async (target) => {
                const steamId = target.replace('@steam', '');
                const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
                return {
                    displayname: steamUser?.personaname || 'Unknown Player',
                    avatarmedium: steamUser?.avatarmedium || ''
                };
            })
        );

        // Map back to preserve order and handle anonymous targets
        return results.results.map(r => {
            if (r.target === 'anonymous') {
                return { displayname: 'Anonymous', avatarmedium: '' };
            }
            const index = uniqueTargets.indexOf(r.target);
            return targetsData[index] || { displayname: 'Unknown Player', avatarmedium: '' };
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
    env: Env
): Promise<Statistics> {
    // Get kills and deaths data from the kills table
    const [kills, deaths, lastKillers, lastKills] = await Promise.all([
        getPlayerKillsCount(steamId, env),
        getPlayerDeathsCount(steamId, env),
        getPlayerLastKillers(steamId, env),
        getPlayerLastKills(steamId, env)
    ]);

    if (!playerData) {
        return {
            username, avatarFull,
            kills, deaths, experience: 0, playtime: 0, roundsplayed: 0,
            leaderboardposition: 0, usedmedkits: 0, usedcolas: 0, pocketescapes: 0,
            usedadrenaline: 0, lastkillers: lastKillers, lastkills: lastKills
        };
    }

    return {
        username,
        avatarFull,
        kills,
        deaths,
        experience: Number(playerData.experience) || 0,
        playtime: Number(playerData.playtime) || 0,
        roundsplayed: Number(playerData.roundsplayed) || 0,
        leaderboardposition: 0,
        usedmedkits: Number(playerData.usedmedkits) || 0,
        usedcolas: Number(playerData.usedcolas) || 0,
        pocketescapes: Number(playerData.pocketescapes) || 0,
        usedadrenaline: Number(playerData.usedadrenaline) || 0,
        lastkillers: lastKillers,
        lastkills: lastKills
    };
}
