import {
  generateSteamLoginUrl,
  verifySteamResponse,
  extractSteamId,
  fetchSteamUserData,
  validateSession,
  createSession,
  deleteSession,
  createResponse,
  getPlayerData,
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
  
  // Redirect to the auth callback page instead of directly to the app
  const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
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

  // Create a response that also sets a secure cookie for Safari compatibility
  // Determine if we're in development or production
  const isLocalDev = frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1');
  
  let cookieSettings = `session=${sessionId}; Path=/; Max-Age=${7 * 24 * 60 * 60 * 3}`;
  
  if (!isLocalDev) {
    // Production settings: secure, with domain for subdomain sharing
    // Extract domain from frontend URL (e.g., "zeitvertreib.vip" from "https://dev.zeitvertreib.vip")
    const frontendHost = new URL(frontendUrl).hostname;
    const domainParts = frontendHost.split('.');
    let cookieDomain = frontendHost;
    
    // If it's a subdomain (more than 2 parts), use the parent domain
    if (domainParts.length > 2) {
      cookieDomain = domainParts.slice(-2).join('.');
    }
    
    cookieSettings += `; Domain=.${cookieDomain}; HttpOnly; Secure; SameSite=None`;
  } else {
    // Development settings: less restrictive for localhost testing
    cookieSettings += '; SameSite=Lax';
  }

  const response = new Response(null, {
    status: 302,
    headers: {
      'Location': redirectUrl.toString(),
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Set-Cookie': cookieSettings
    }
  });

  return response;
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

  // Get player data including fakerankadmin flag
  const playerData = await getPlayerData(session!.steamId, env);

  return createResponse(
    {
      user: session!.steamUser,
      playerData: playerData,
    },
    200,
    origin,
  );
}

export async function handleLogout(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  await deleteSession(request, env);
  return createResponse({ success: true }, 200, origin);
}
