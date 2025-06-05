import { validateSession, getPlayerData, mapPlayerDataToStats, createResponse } from '../utils.js';

export async function handleGetStats(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const { isValid, session, error } = await validateSession(request, env);

    if (!isValid) {
        return createResponse({ error: error! }, 401, origin);
    }

    try {
        const playerData = await getPlayerData(session!.steamId, env);
        const stats = mapPlayerDataToStats(
            playerData,
            session!.steamUser.personaname,
            session!.steamUser.avatarfull
        );

        return createResponse({ stats }, 200, origin);
    } catch (error) {
        console.error('Stats error:', error);
        return createResponse({ error: 'Failed to fetch player statistics' }, 500, origin);
    }
}
