import { createResponse } from '../utils.js';

/**
 * Validates the API key from the Authorization header
 */
function validateApiKey(request: Request, env: Env): boolean {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return false;
    }

    const token = authHeader.substring(7);
    return token === env.PLAYERLIST_API_KEY;
}

/**
 * GET /playerlist
 * Fetches the current playerlist from Durable Object storage
 * Public endpoint - no authentication required
 */
export async function handleGetPlayerlist(
    request: Request,
    env: Env,
): Promise<Response> {
    const origin = request.headers.get('Origin');

    try {
        // Get Durable Object instance
        const id = env.PLAYERLIST_STORAGE.idFromName('playerlist');
        const stub = env.PLAYERLIST_STORAGE.get(id);

        // Fetch playerlist from Durable Object
        const response = await stub.fetch(
            new Request('https://playerlist-storage.worker/playerlist', {
                method: 'GET',
            }),
        );

        if (!response.ok) {
            return createResponse(
                {
                    error: `Failed to fetch playerlist: ${response.status} ${response.statusText}`,
                },
                500,
                origin,
            );
        }

        const playerlistData = await response.json();

        return createResponse(playerlistData, 200, origin);
    } catch (error) {
        console.error('Error fetching playerlist:', error);
        return createResponse(
            { error: 'Internal server error while fetching playerlist' },
            500,
            origin,
        );
    }
}

/**
 * POST /playerlist
 * Updates the playerlist in Durable Object storage
 * Requires valid API key authentication via Bearer token
 */
export async function handleUpdatePlayerlist(
    request: Request,
    env: Env,
): Promise<Response> {
    const origin = request.headers.get('Origin');

    // Validate API key
    if (!validateApiKey(request, env)) {
        return createResponse(
            { error: 'Unauthorized: Invalid or missing API key' },
            401,
            origin,
        );
    }

    try {
        // Parse request body
        const playerlistData = await request.json();

        // Get Durable Object instance
        const id = env.PLAYERLIST_STORAGE.idFromName('playerlist');
        const stub = env.PLAYERLIST_STORAGE.get(id);

        // Update playerlist in Durable Object
        const response = await stub.fetch(
            new Request('https://playerlist-storage.worker/playerlist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(playerlistData),
            }),
        );

        if (!response.ok) {
            return createResponse(
                {
                    error: `Failed to update playerlist: ${response.status} ${response.statusText}`,
                },
                500,
                origin,
            );
        }

        return createResponse(
            { success: true, message: 'Playerlist updated successfully' },
            200,
            origin,
        );
    } catch (error) {
        console.error('Error updating playerlist:', error);
        return createResponse(
            { error: 'Internal server error while updating playerlist' },
            500,
            origin,
        );
    }
}
