import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createResponse, createSession, fetchSteamUserData } from '../utils.js';
import { playerdata } from '../db/schema.js';

const DISCORD_API = 'https://discord.com/api';

// Start OAuth flow
export async function handleDiscordLogin(request: Request, env: Env) {
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/discord/callback`;
  const scopes = ['identify', 'connections'].join(' ');

  const authUrl = `https://discord.com/oauth2/authorize?response_type=code&client_id=${env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

  return createResponse(authUrl, 302, request.headers.get('Origin'));
}

// Handle OAuth callback
export async function handleDiscordCallback(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return createResponse(
      { error: 'No authorization code received' },
      400,
      origin,
    );
  }

  try {
    const db = drizzle(env.ZEITVERTREIB_DATA);
    const redirectUri = `${url.origin}/api/auth/discord/callback`;

    // Exchange code for token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const { access_token } = (await tokenRes.json()) as {
      access_token: string;
    };

    // Get user and connections
    const [user, connections]: [any, any] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      }).then((r) => r.json()),
      fetch(`${DISCORD_API}/users/@me/connections`, {
        headers: { Authorization: `Bearer ${access_token}` },
      }).then((r) => r.json()),
    ]);

    // Validate connections is an array
    if (!Array.isArray(connections)) {
      console.error(
        'Discord connections response is not an array:',
        connections,
      );
      return createResponse(
        { error: 'Failed to fetch Discord connections' },
        500,
        origin,
      );
    }

    // Find Steam connection
    const steam = connections.find((c: any) => c.type === 'steam');
    if (!steam) {
      const redirectUrl = new URL(`${env.FRONTEND_URL}/no-steam-link`);
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl.toString(),
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    const steamId = steam.id;
    const discordId = Number(user.id);

    // Unlink old Discord ID if exists elsewhere
    const existing = await db
      .select()
      .from(playerdata)
      .where(eq(playerdata.discordId, discordId))
      .limit(1);
    if (existing[0]) {
      await db
        .update(playerdata)
        .set({ discordId: null })
        .where(eq(playerdata.id, existing[0].id));
    }

    // Link Discord to Steam account
    await db
      .insert(playerdata)
      .values({
        id: `${steamId}@steam`,
        discordId,
      })
      .onConflictDoUpdate({
        target: playerdata.id,
        set: { discordId },
      });

    // Fetch Steam data and create session
    const steamUser = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
    if (!steamUser) {
      return createResponse(
        { error: 'Could not fetch Steam user data' },
        500,
        origin,
      );
    }

    const sessionId = await createSession(steamId, steamUser, env);
    const isLocal = env.FRONTEND_URL.includes('localhost');
    const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);

    redirectUrl.searchParams.set('token', sessionId);
    if (url.searchParams.has('redirect')) {
      redirectUrl.searchParams.set(
        'redirect',
        url.searchParams.get('redirect')!,
      );
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Set-Cookie': `session=${sessionId}; Path=/; Max-Age=${7 * 24 * 60 * 60}${isLocal ? '; SameSite=Lax' : '; HttpOnly; Secure; SameSite=Strict'}`,
      },
    });
  } catch (error) {
    console.error('Discord auth error:', error);
    return createResponse({ error: 'Authentication failed' }, 500, origin);
  }
}
