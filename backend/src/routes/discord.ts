import { createResponse } from '../utils.js';

const DISCORD_BASE_URL = 'https://discord.com';
const DISCORD_API_URL = 'https://discord.com/api';

async function generateDiscordAuthUrl(
  clientId: string,
  redirectUri: string,
): Promise<string> {
  const scope = ['identify', 'connections'].join(' ');
  return `${DISCORD_BASE_URL}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
}

async function exchangeCodeForToken(
  code: string,
  env: Env,
  redirectUri: string,
): Promise<string> {
  const data = {
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
  };

  const response = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data).toString(),
  });

  const results: any = await response.json();
  return results.access_token;
}

async function getDiscordConnections(token: string): Promise<any> {
  const response = await fetch(`${DISCORD_API_URL}/users/@me/connections`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return await response.json();
}

export async function handleDiscordLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/auth/discord/callback`;

  const authUrl = await generateDiscordAuthUrl(
    env.DISCORD_CLIENT_ID,
    redirectUri,
  );
  return createResponse(authUrl, 302, origin);
}

export async function handleDiscordCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return createResponse(
      { error: 'No authorization code provided' },
      400,
      origin,
    );
  }

  try {
    const redirectUri = `${url.origin}/auth/discord/callback`;
    const accessToken = await exchangeCodeForToken(code, env, redirectUri);
    const connections = await getDiscordConnections(accessToken);

    // Find Steam connection
    const steamConnection = connections.find(
      (conn: any) => conn.type === 'steam',
    );

    if (steamConnection) {
      console.log('Steam ID:', steamConnection.id);
      return createResponse(
        {
          hasSteam: true,
          steamId: steamConnection.id,
        },
        200,
        origin,
      );
    } else {
      return createResponse(
        {
          hasSteam: false,
          steamId: null,
        },
        200,
        origin,
      );
    }
  } catch (error) {
    console.error('Discord callback error:', error);
    return createResponse(
      { error: 'Discord authentication failed' },
      500,
      origin,
    );
  }
}
