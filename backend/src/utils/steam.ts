import { SteamUser } from '../types/index.js';
import { STEAM_CONFIG } from '../config/constants.js';

/**
 * Generate Steam OpenID login URL
 */
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

    return `${STEAM_CONFIG.OPENID_URL}?${params.toString()}`;
}

/**
 * Verify Steam OpenID response
 */
export async function verifySteamResponse(params: Record<string, string>): Promise<boolean> {
    if (!params['openid.mode'] || params['openid.mode'] !== 'id_res') {
        return false;
    }

    const verifyParams = new URLSearchParams(params);
    verifyParams.set('openid.mode', 'check_authentication');

    const verifyResponse = await fetch(STEAM_CONFIG.OPENID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams.toString(),
    });

    const verifyText = await verifyResponse.text();
    return verifyText.includes('is_valid:true');
}

/**
 * Extract Steam ID from OpenID identity
 */
export function extractSteamId(identity?: string): string | null {
    if (!identity) return null;
    return identity.replace('https://steamcommunity.com/openid/id/', '');
}

/**
 * Fetch Steam user data from Steam API
 */
export async function fetchSteamUserData(steamId: string, apiKey: string): Promise<SteamUser | null> {
    try {
        const userResponse = await fetch(`${STEAM_CONFIG.API_URL}?key=${apiKey}&steamids=${steamId}`);
        const userData = await userResponse.json() as { response: { players: SteamUser[] } };

        if (!userData.response?.players?.length) {
            return null;
        }

        return userData.response.players[0];
    } catch (error) {
        console.error('Error fetching Steam user data:', error);
        return null;
    }
}
