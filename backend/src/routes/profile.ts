import { validateSession, createResponse, getPlayerData } from '../utils.js';

export async function handleFakerank(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    // Validate session first
    const { isValid, session, error } = await validateSession(request, env);

    if (!isValid) {
        return createResponse({ error: error! }, 401, origin);
    }

    const method = request.method;
    const playerId = `${session!.steamId}@steam`;

    try {
        switch (method) {
            case 'GET':
                return await handleGetFakerank(playerId, env, origin);

            case 'POST':
            case 'PATCH':
                return await handleUpdateFakerank(request, playerId, env, origin);

            case 'DELETE':
                return await handleDeleteFakerank(playerId, env, origin);

            default:
                return createResponse({ error: 'Method Not Allowed' }, 405, origin);
        }
    } catch (error) {
        console.error('Error handling fakerank request:', error);
        return createResponse({ error: 'Internal server error' }, 500, origin);
    }
}

async function handleGetFakerank(playerId: string, env: Env, origin: string | null): Promise<Response> {
    try {
        const playerData = await getPlayerData(playerId.replace('@steam', ''), env);

        return createResponse({
            fakerank: playerData?.fakerank || null
        }, 200, origin);
    } catch (error) {
        console.error('Error fetching fakerank:', error);
        return createResponse({ error: 'Failed to fetch fakerank' }, 500, origin);
    }
}

async function handleUpdateFakerank(request: Request, playerId: string, env: Env, origin: string | null): Promise<Response> {
    try {
        // Parse request body
        const body = await request.json() as { fakerank: string };

        if (!body.fakerank && body.fakerank !== '') {
            return createResponse({ error: 'Fakerank is required' }, 400, origin);
        }

        // Validate fakerank length (optional, adjust as needed)
        if (body.fakerank.length > 50) {
            return createResponse({ error: 'Fakerank must be 50 characters or less' }, 400, origin);
        }

        // Check if player exists in database
        const existingPlayer = await env['zeitvertreib-data']
            .prepare('SELECT id FROM playerdata WHERE id = ?')
            .bind(playerId)
            .first();

        if (existingPlayer) {
            // Update existing player's fakerank
            await env['zeitvertreib-data']
                .prepare('UPDATE playerdata SET fakerank = ? WHERE id = ?')
                .bind(body.fakerank, playerId)
                .run();
        } else {
            // Create new player record with fakerank
            await env['zeitvertreib-data']
                .prepare(`INSERT INTO playerdata (id, fakerank, experience, playtime, roundsplayed, usedmedkits, usedcolas, pocketescapes, usedadrenaline) 
                         VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`)
                .bind(playerId, body.fakerank)
                .run();
        }

        return createResponse({
            success: true,
            message: 'Fakerank updated successfully',
            fakerank: body.fakerank
        }, 200, origin);

    } catch (error) {
        console.error('Error updating fakerank:', error);
        return createResponse({ error: 'Failed to update fakerank' }, 500, origin);
    }
}

async function handleDeleteFakerank(playerId: string, env: Env, origin: string | null): Promise<Response> {
    try {
        // Check if player exists in database
        const existingPlayer = await env['zeitvertreib-data']
            .prepare('SELECT id FROM playerdata WHERE id = ?')
            .bind(playerId)
            .first();

        if (existingPlayer) {
            // Set fakerank to NULL (or empty string, depending on your preference)
            await env['zeitvertreib-data']
                .prepare('UPDATE playerdata SET fakerank = NULL WHERE id = ?')
                .bind(playerId)
                .run();

            return createResponse({
                success: true,
                message: 'Fakerank deleted successfully'
            }, 200, origin);
        } else {
            return createResponse({
                success: true,
                message: 'No fakerank to delete'
            }, 200, origin);
        }

    } catch (error) {
        console.error('Error deleting fakerank:', error);
        return createResponse({ error: 'Failed to delete fakerank' }, 500, origin);
    }
}
