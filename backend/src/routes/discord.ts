import { createResponse } from '../utils.js';

const DISCORD_BASE_URL = 'https://discord.com';
const DISCORD_API_URL = 'https://discord.com/api';

/**
 * Builds the Discord OAuth2 authorization URL that users will visit to log in.
 * We're asking for permission to see their basic profile and connected accounts.
 */
async function generateDiscordAuthUrl(
  clientId: string,
  redirectUri: string,
): Promise<string> {
  // We need to see who the user is and what accounts they've linked to Discord
  const requestedPermissions = ['identify', 'connections'].join(' ');

  return `${DISCORD_BASE_URL}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(requestedPermissions)}`;
}

/**
 * Trades the temporary authorization code for an actual access token.
 */
async function exchangeCodeForToken(
  authorizationCode: string,
  env: Env,
  redirectUri: string,
): Promise<string> {
  // Prepare our credentials to prove we're a legit app
  const tokenRequestData = {
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: redirectUri,
  };

  const response = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(tokenRequestData).toString(),
  });

  const tokenData: any = await response.json();
  return tokenData.access_token;
}

/**
 * Fetches the Discord user's basic profile information.
 */
async function getDiscordUser(accessToken: string): Promise<any> {
  const response = await fetch(`${DISCORD_API_URL}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return await response.json();
}

/**
 * Fetches all the external accounts this user has linked to their Discord.
 * We're mainly looking for Steam, but we get all of them.
 */
async function getDiscordConnections(accessToken: string): Promise<any> {
  const response = await fetch(`${DISCORD_API_URL}/users/@me/connections`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return await response.json();
}

/**
 * Kicks off the Discord login flow by redirecting the user to Discord's authorization page.
 * They'll see a nice Discord screen asking if they want to let us in.
 */
export async function handleDiscordLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const currentUrl = new URL(request.url);
  const callbackUrl = `${currentUrl.origin}/api/auth/discord/callback`;

  // Build the URL where we'll send the user to authorize with Discord
  const discordAuthUrl = await generateDiscordAuthUrl(
    env.DISCORD_CLIENT_ID,
    callbackUrl,
  );

  // Off they go to Discord!
  return createResponse(discordAuthUrl, 302, origin);
}

/**
 * Discord sends the user back here after they've authorized (or denied) our app.
 * We'll grab their authorization code and use it to fetch their Steam ID if they have one linked.
 */
export async function handleDiscordCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const currentUrl = new URL(request.url);
  const authorizationCode = currentUrl.searchParams.get('code');

  // Uh oh, Discord didn't give us an authorization code - something went wrong
  if (!authorizationCode) {
    return createResponse(
      { error: "Hmm, we didn't get an authorization code from Discord. Please try logging in again!" },
      400,
      origin,
    );
  }

  try {
    const callbackUrl = `${currentUrl.origin}/api/auth/discord/callback`;

    // Step 1: Trade the authorization code for an access token
    const accessToken = await exchangeCodeForToken(authorizationCode, env, callbackUrl);

    // Step 2: Fetch the Discord user's profile information
    const discordUser = await getDiscordUser(accessToken);

    // Step 3: Use that token to fetch all their connected accounts
    const userConnections = await getDiscordConnections(accessToken);

    // Step 4: Look through their connections to see if they have Steam linked
    const steamAccount = userConnections.find(
      (connection: any) => connection.type === 'steam',
    );

    if (steamAccount) {
      // Awesome! They have Steam connected to Discord
      console.log('Discord ID:', discordUser.id, 'Steam ID:', steamAccount.id);
      return createResponse(
        {
          hasSteam: true,
          discordId: discordUser.id,
          steamId: steamAccount.id,
        },
        200,
        origin,
      );
    } else {
      // No Steam connection found - that's okay, we'll let them know
      return createResponse(
        {
          hasSteam: false,
          discordId: discordUser.id,
          steamId: null,
        },
        200,
        origin,
      );
    }
  } catch (error) {
    // Something went wrong during the Discord authentication process
    console.error('Oops, ran into an issue with Discord authentication:', error);
    return createResponse(
      { error: "Something went wrong while connecting to Discord. Mind giving it another shot?" },
      500,
      origin,
    );
  }
}
