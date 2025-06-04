import { validateSession } from '../utils/session.js';
import { getPlayerData, mapPlayerDataToStats } from '../utils/database.js';
import { createErrorResponse, createSuccessResponse } from '../utils/response.js';

/**
 * Handle getting player statistics
 */
export async function handleGetStats(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    // Validate user session
    const { isValid, session, error } = await validateSession(request, env);
    if (!isValid) {
        return createErrorResponse(error!, 401, origin);
    }

    try {
        // Fetch player data from database
        const playerData = await getPlayerData(session!.steamId, env);

        // Map to Statistics interface
        const stats = mapPlayerDataToStats(
            playerData,
            session!.steamUser.personaname,
            session!.steamUser.avatarfull
        );

        return createSuccessResponse({ stats }, origin);

    } catch (error) {
        console.error('Stats error:', error);
        return createErrorResponse('Failed to fetch player statistics', 500, origin);
    }
}
