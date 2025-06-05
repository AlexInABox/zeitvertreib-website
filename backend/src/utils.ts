// Consolidated utilities
import { SessionData, SteamUser, Statistics, PlayerData } from './types/index.js';

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

export async function fetchSteamUserData(steamId: string, apiKey: string): Promise<SteamUser | null> {
    try {
        const response = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`);
        const data = await response.json() as { response: { players: SteamUser[] } };
        return data.response?.players?.[0] || null;
    } catch (error) {
        console.error('Error fetching Steam user data:', error);
        return null;
    }
}

// Database helpers
export async function getPlayerData(steamId: string, env: Env): Promise<PlayerData | null> {
    try {
        return await env['zeitvertreib-data']
            .prepare('SELECT * FROM playerdata WHERE id = ?')
            .bind(`${steamId}@steam`)
            .first() as PlayerData | null;
    } catch (error) {
        console.error('Database error:', error);
        throw new Error('Failed to fetch player data');
    }
}

export function mapPlayerDataToStats(playerData: PlayerData | null, username: string, avatarFull: string): Statistics {
    const parseJson = (jsonString?: string) => {
        if (!jsonString) return [];
        try {
            return JSON.parse(String(jsonString));
        } catch {
            return [];
        }
    };

    if (!playerData) {
        return {
            username, avatarFull,
            kills: 0, deaths: 0, experience: 0, playtime: 0, roundsplayed: 0, level: 0,
            leaderboardposition: 0, usedmedkits: 0, usedcolas: 0, pocketescapes: 0,
            usedadrenaline: 0, lastkillers: [], lastkills: []
        };
    }

    return {
        username,
        avatarFull,
        kills: Number(playerData.kills) || 0,
        deaths: Number(playerData.deaths) || 0,
        experience: Number(playerData.experience) || 0,
        playtime: Number(playerData.playtime) || 0,
        roundsplayed: Number(playerData.roundsplayed) || 0,
        level: Number(playerData.level) || 0,
        leaderboardposition: 0,
        usedmedkits: Number(playerData.usedmedkits) || 0,
        usedcolas: Number(playerData.usedcolas) || 0,
        pocketescapes: Number(playerData.pocketescapes) || 0,
        usedadrenaline: Number(playerData.usedadrenaline) || 0,
        lastkillers: parseJson(playerData.lastkillers),
        lastkills: parseJson(playerData.lastkills)
    };
}
