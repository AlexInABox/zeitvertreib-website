import { createResponse, fetchSteamUserData } from '../utils.js';

/**
 * GET /profile-details?steamId={steamId}
 * Fetch enriched profile data (username and avatar) for a Steam user
 */
export async function handleGetProfileDetails(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Parse the query parameter
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');

    if (!steamId) {
      return createResponse({ error: 'steamId parameter is required' }, 400, origin);
    }

    // Fetch steam user data (username and avatar)
    const steamUser = await fetchSteamUserData(steamId, env, ctx);

    if (!steamUser) {
      return createResponse(
        { error: 'Failed to fetch Steam user data', steamId },
        500,
        origin,
      );
    }

    // Return the profile data
    return createResponse(
      {
        steamId: steamUser.steamId,
        username: steamUser.username || undefined,
        avatarUrl: steamUser.avatarUrl || undefined,
      },
      200,
      origin,
    );
  } catch (err) {
    console.error('Error fetching profile details:', err);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}
