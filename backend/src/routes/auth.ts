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
  generateLoginSecret,
  validateLoginSecret,
  cleanupExpiredLoginSecrets,
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
  if (!(await verifySteamResponse(params, env))) {
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
  const isLocalDev =
    frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1');

  let cookieSettings = `session=${sessionId}; Path=/; Max-Age=${7 * 24 * 60 * 60 * 3}`;

  if (!isLocalDev) {
    // Production settings: same domain, so no cross-origin issues
    cookieSettings += '; HttpOnly; Secure; SameSite=Strict';
  } else {
    // Development settings: less restrictive for localhost testing
    cookieSettings += '; SameSite=Lax';
  }

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Set-Cookie': cookieSettings,
    },
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

export async function handleGenerateLoginSecret(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate API key authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createResponse({ error: 'API key required' }, 401, origin);
    }

    const apiKey = authHeader.substring(7);
    if (!env.LOGIN_SECRET_API_KEY || apiKey !== env.LOGIN_SECRET_API_KEY) {
      return createResponse({ error: 'Invalid API key' }, 403, origin);
    }

    let steamId: string;

    if (request.method === 'GET') {
      // Handle GET request with query parameters
      const url = new URL(request.url);
      steamId = url.searchParams.get('steamId') || '';
    } else if (request.method === 'POST') {
      // Handle POST request with JSON body
      const body = (await request.json()) as { steamId?: string };
      steamId = body.steamId || '';
    } else {
      return createResponse({ error: 'Method not allowed' }, 405, origin);
    }

    if (!steamId) {
      return createResponse({ error: 'Steam ID is required' }, 400, origin);
    }

    // Validate steamId format (should end with @steam)
    if (!steamId.includes('@steam')) {
      return createResponse(
        { error: 'Invalid Steam ID format. Must include @steam' },
        400,
        origin,
      );
    }

    // Generate new login secret
    const secret = await generateLoginSecret(steamId, env);

    const frontendUrl = env.FRONTEND_URL || 'http://localhost:4200';
    const loginUrl = `${frontendUrl}/?loginSecret=${secret}`;

    return createResponse(
      {
        secret,
        loginUrl,
        steamId,
        expiresIn: '40 minutes',
      },
      200,
      origin,
    );
  } catch (err) {
    console.error('[AUTH] Generate login secret error:', err);
    return createResponse(
      {
        error: 'Failed to generate login secret',
        details: err instanceof Error ? err.message : String(err),
      },
      500,
      origin,
    );
  }
}

export async function handleLoginWithSecret(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!secret) {
    return createResponse({ error: 'Login secret is required' }, 400, origin);
  }

  try {
    // Validate the login secret
    const { isValid, steamId, error } = await validateLoginSecret(secret, env);

    if (!isValid) {
      return createResponse({ error: error! }, 400, origin);
    }

    // Get Steam user data
    if (!env.STEAM_API_KEY) {
      return createResponse(
        { error: 'Steam API key not configured' },
        500,
        origin,
      );
    }

    // Extract the numeric Steam ID from the stored format (remove @steam suffix)
    const numericSteamId = steamId!.replace('@steam', '');

    console.log('[AUTH] Login with secret - stored steamId:', steamId);
    console.log(
      '[AUTH] Login with secret - numeric steamId for API:',
      numericSteamId,
    );

    const steamUser = await fetchSteamUserData(
      numericSteamId,
      env.STEAM_API_KEY,
      env,
    );
    if (!steamUser) {
      return createResponse(
        { error: 'Could not fetch user data' },
        500,
        origin,
      );
    }

    // Create session using the numeric Steam ID (consistent with normal login)
    const sessionId = await createSession(numericSteamId, steamUser, env);

    // Determine if we're in development or production
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:4200';
    const isLocalDev =
      frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1');

    let cookieSettings = `session=${sessionId}; Path=/; Max-Age=${7 * 24 * 60 * 60 * 3}`;

    if (!isLocalDev) {
      // Production settings: same domain, so no cross-origin issues
      cookieSettings += '; HttpOnly; Secure; SameSite=Strict';
    } else {
      // Development settings: less restrictive for localhost testing
      cookieSettings += '; SameSite=Lax';
    }

    // Create custom response with cookie
    const response = new Response(
      JSON.stringify({
        success: true,
        sessionId,
        user: steamUser,
      }),
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Credentials': 'true',
          'Content-Type': 'application/json',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Set-Cookie': cookieSettings,
        },
      },
    );

    return response;
  } catch (err) {
    return createResponse(
      { error: 'Failed to login with secret' },
      500,
      origin,
    );
  }
}
