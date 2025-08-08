import {
  generateSteamLoginUrl,
  verifySteamResponse,
  extractSteamId,
  fetchSteamUserData,
  validateSession,
  createSession,
  deleteSession,
  createResponse,
} from '../utils.js';

export async function handleSteamLogin(request: Request): Promise<Response> {
  return createResponse(generateSteamLoginUrl(request), 302);
}

export async function handleSteamCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const origin = request.headers.get('Origin');

  // Verify Steam response
  if (!(await verifySteamResponse(params))) {
    return createResponse(
      { error: 'Steam authentication failed' },
      401,
      origin,
    );
  }

  // Extract Steam ID
  const steamId = extractSteamId(params['openid.identity']);
  if (!steamId) {
    return createResponse({ error: 'Could not extract Steam ID' }, 400, origin);
  }

  // Get Steam user data
  if (!env.STEAM_API_KEY) {
    return createResponse(
      { error: 'Steam API key not configured' },
      500,
      origin,
    );
  }

  const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
  if (!steamUser) {
    return createResponse({ error: 'Could not fetch user data' }, 500, origin);
  }

  // Create session and redirect
  const sessionId = await createSession(steamId, steamUser, env);

  const frontendUrl = env.FRONTEND_URL || 'http://localhost:4200';
  const redirectUrl = new URL(frontendUrl);
  redirectUrl.searchParams.set('token', sessionId);

  // Check if there's a redirect parameter in the return_to URL
  const returnToUrl = params['openid.return_to'];
  if (returnToUrl) {
    const returnToUrlObj = new URL(returnToUrl);
    const redirectParam = returnToUrlObj.searchParams.get('redirect');
    if (redirectParam) {
      redirectUrl.searchParams.set('redirect', redirectParam);
    }
  }

  return createResponse(redirectUrl.toString(), 302);
}

export async function handleGetUser(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return createResponse({ error: error! }, 401, origin);
  }

  return createResponse({ user: session!.steamUser }, 200, origin);
}

export async function handleLogout(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  await deleteSession(request, env);
  return createResponse({ success: true }, 200, origin);
}
