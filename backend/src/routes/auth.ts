import {
    generateSteamLoginUrl,
    verifySteamResponse,
    extractSteamId,
    fetchSteamUserData
} from '../utils/steam.js';
import { validateSession, createSession, deleteSession } from '../utils/session.js';
import { createErrorResponse, createSuccessResponse, createRedirectResponse } from '../utils/response.js';
import { DEFAULT_FRONTEND_URL } from '../config/constants.js';

/**
 * Handle Steam login initiation
 */
export async function handleSteamLogin(request: Request, env: Env): Promise<Response> {
    const loginUrl = generateSteamLoginUrl(request);
    return createRedirectResponse(loginUrl);
}

/**
 * Handle Steam authentication callback
 */
export async function handleSteamCallback(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const origin = request.headers.get('Origin');

    // Verify the OpenID response
    const isValid = await verifySteamResponse(params);
    if (!isValid) {
        return createErrorResponse('Steam authentication failed', 401, origin);
    }

    // Extract Steam ID
    const steamId = extractSteamId(params['openid.identity']);
    if (!steamId) {
        return createErrorResponse('Could not extract Steam ID', 400, origin);
    }

    // Get Steam user info
    const steamApiKey = env.STEAM_API_KEY;
    if (!steamApiKey) {
        return createErrorResponse('Steam API key not configured', 500, origin);
    }

    const steamUser = await fetchSteamUserData(steamId, steamApiKey);
    if (!steamUser) {
        return createErrorResponse('Could not fetch user data', 500, origin);
    }

    // Create session
    const sessionId = await createSession(steamId, steamUser, env);

    // Redirect back to frontend with session token
    const frontendUrl = env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
    const redirectUrl = new URL(frontendUrl);
    redirectUrl.searchParams.set('token', sessionId);

    return createRedirectResponse(redirectUrl.toString());
}

/**
 * Get current user information
 */
export async function handleGetUser(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const { isValid, session, error } = await validateSession(request, env);

    if (!isValid) {
        return createErrorResponse(error!, 401, origin);
    }

    return createSuccessResponse({ user: session!.steamUser }, origin);
}

/**
 * Handle user logout
 */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    await deleteSession(request, env);

    return createSuccessResponse({ success: true }, origin);
}
