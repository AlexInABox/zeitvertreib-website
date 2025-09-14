import {
  validateSession,
  createResponse,
  getPlayerData,
  fetchSteamUserData,
} from '../utils.js';

// Extend the Env interface to include DISCORD_WORKER_API_KEY
declare global {
  interface Env {
    DISCORD_WORKER_API_KEY: string;
  }
}

interface Player {
  Name: string;
  UserId: string;
  Health: number;
  Team: string;
}

// Helper function to check if user is fakerank admin
async function validateFakerankAdmin(request: Request, env: Env) {
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return { isValid: false, error: error || 'Not authenticated' };
  }

  // Get player data to check admin status
  const playerData = await getPlayerData(session!.steamId, env);

  // Check if user has fakerank admin access based on unix timestamp
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const fakerankAdminUntil = playerData?.fakerankadmin_until || 0;

  // If fakerankadmin_until is 0 or current time is past the expiration, no access
  if (fakerankAdminUntil === 0 || currentTimestamp > fakerankAdminUntil) {
    return { isValid: false, error: 'Insufficient privileges - fakerank admin access expired' };
  }

  return { isValid: true, session, playerData };
}

// GET user fakerank by steamid
export async function handleGetUserFakerank(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');

    if (!steamId) {
      return createResponse(
        { error: 'steamId parameter required' },
        400,
        origin,
      );
    }

    // Get player data for the requested user
    const playerData = await getPlayerData(steamId, env);
    if (!playerData) {
      return createResponse({ error: 'User not found' }, 404, origin);
    }

    // Get Steam user data for avatar and username
    let steamUserData = null;
    try {
      steamUserData = await fetchSteamUserData(steamId, env.STEAM_API_KEY, env);
    } catch (error) {
      console.warn('Could not fetch Steam user data:', error);
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const fakerankUntil = Number(playerData.fakerank_until) || 0;
    const hasFakerankAccess = fakerankUntil > 0 && currentTimestamp < fakerankUntil;

    return createResponse(
      {
        steamId,
        username: steamUserData?.personaname || `Player ${steamId.slice(-4)}`,
        avatarFull:
          steamUserData?.avatarfull || steamUserData?.avatarmedium || null,
        fakerank: playerData.fakerank || null,
        fakerank_color: playerData.fakerank_color || 'default',
        fakerank_until: fakerankUntil,
        hasFakerankAccess,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting user fakerank:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// SET user fakerank by steamid
export async function handleSetUserFakerank(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const body = (await request.json()) as any;
    const { steamId, fakerank, fakerank_color = 'default' } = body;

    if (!steamId) {
      return createResponse({ error: 'steamId is required' }, 400, origin);
    }

    if (fakerank && (typeof fakerank !== 'string' || fakerank.length > 50)) {
      return createResponse({ error: 'Invalid fakerank format' }, 400, origin);
    }

    // Validate fakerank content - ban parentheses and commas
    if (fakerank && (fakerank.includes('(') || fakerank.includes(')') || fakerank.includes(','))) {
      return createResponse(
        { error: 'Fakerank darf keine Klammern () oder Kommas enthalten' },
        400,
        origin,
      );
    }

    // Update the user's fakerank
    const playerId = `${steamId}@steam`;

    if (fakerank) {
      // Set fakerank
      await env['zeitvertreib-data']
        .prepare(
          'UPDATE playerdata SET fakerank = ?, fakerank_color = ? WHERE id = ?',
        )
        .bind(fakerank, fakerank_color, playerId)
        .run();
    } else {
      // Clear fakerank
      await env['zeitvertreib-data']
        .prepare(
          'UPDATE playerdata SET fakerank = NULL, fakerank_color = ? WHERE id = ?',
        )
        .bind('default', playerId)
        .run();
    }

    console.log(
      `Admin ${adminCheck.session!.steamId} updated fakerank for ${steamId}: "${fakerank}"`,
    );

    return createResponse(
      {
        success: true,
        steamId,
        fakerank: fakerank || null,
        fakerank_color,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error setting user fakerank:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// GET blacklisted words
export async function handleGetBlacklist(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const blacklistData = await env.SESSIONS.get('fakerank_blacklist');
    let blacklistedWords: string[] = [];

    if (blacklistData) {
      blacklistedWords = JSON.parse(blacklistData);
    }

    // Convert string array to BlacklistItem format expected by frontend
    const blacklistItems = blacklistedWords.map((word, index) => ({
      id: index + 1,
      word: word,
      createdAt: new Date().toISOString(), // Since we don't store creation dates, use current time
    }));

    return createResponse(
      {
        blacklistedWords: blacklistItems,
        count: blacklistItems.length,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting blacklist:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// ADD word to blacklist
export async function handleAddToBlacklist(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const body = (await request.json()) as any;
    const { word } = body;

    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return createResponse({ error: 'Valid word is required' }, 400, origin);
    }

    const wordLower = word.trim().toLowerCase();

    // Get existing blacklist
    const blacklistData = await env.SESSIONS.get('fakerank_blacklist');
    let blacklistedWords: string[] = [];

    if (blacklistData) {
      blacklistedWords = JSON.parse(blacklistData);
    }

    // Add word if not already present
    if (!blacklistedWords.includes(wordLower)) {
      blacklistedWords.push(wordLower);
      await env.SESSIONS.put(
        'fakerank_blacklist',
        JSON.stringify(blacklistedWords),
      );

      console.log(
        `Admin ${adminCheck.session!.steamId} added "${wordLower}" to blacklist`,
      );

      return createResponse(
        {
          success: true,
          id: blacklistedWords.length, // Use the new length as ID
          word: wordLower,
          message: 'Word added to blacklist',
          totalWords: blacklistedWords.length,
        },
        200,
        origin,
      );
    } else {
      return createResponse(
        {
          success: false,
          message: 'Word already in blacklist',
        },
        409,
        origin,
      );
    }
  } catch (error) {
    console.error('Error adding to blacklist:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// REMOVE word from blacklist
export async function handleRemoveFromBlacklist(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const body = (await request.json()) as any;
    const { word } = body;

    if (!word || typeof word !== 'string') {
      return createResponse({ error: 'Valid word is required' }, 400, origin);
    }

    const wordLower = word.trim().toLowerCase();

    // Get existing blacklist
    const blacklistData = await env.SESSIONS.get('fakerank_blacklist');
    let blacklistedWords: string[] = [];

    if (blacklistData) {
      blacklistedWords = JSON.parse(blacklistData);
    }

    // Remove word if present
    const initialLength = blacklistedWords.length;
    blacklistedWords = blacklistedWords.filter((w) => w !== wordLower);

    if (blacklistedWords.length < initialLength) {
      await env.SESSIONS.put(
        'fakerank_blacklist',
        JSON.stringify(blacklistedWords),
      );

      console.log(
        `Admin ${adminCheck.session!.steamId} removed "${wordLower}" from blacklist`,
      );

      return createResponse(
        {
          success: true,
          word: wordLower,
          message: 'Word removed from blacklist',
          totalWords: blacklistedWords.length,
        },
        200,
        origin,
      );
    } else {
      return createResponse(
        {
          success: false,
          message: 'Word not found in blacklist',
        },
        404,
        origin,
      );
    }
  } catch (error) {
    console.error('Error removing from blacklist:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// GET whitelisted words
export async function handleGetWhitelist(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const whitelistData = await env.SESSIONS.get('fakerank_whitelist');
    let whitelistedWords: string[] = [];

    if (whitelistData) {
      whitelistedWords = JSON.parse(whitelistData);
    }

    // Convert string array to WhitelistItem format expected by frontend
    const whitelistItems = whitelistedWords.map((word, index) => ({
      id: index + 1,
      word: word,
      createdAt: new Date().toISOString(), // Since we don't store creation dates, use current time
    }));

    return createResponse(
      {
        whitelistedWords: whitelistItems,
        count: whitelistItems.length,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting whitelist:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// ADD word to whitelist
export async function handleAddToWhitelist(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const body = (await request.json()) as any;
    const { word } = body;

    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return createResponse({ error: 'Valid word is required' }, 400, origin);
    }

    const wordLower = word.trim().toLowerCase();

    // Get existing whitelist
    const whitelistData = await env.SESSIONS.get('fakerank_whitelist');
    let whitelistedWords: string[] = [];

    if (whitelistData) {
      whitelistedWords = JSON.parse(whitelistData);
    }

    // Add word if not already present
    if (!whitelistedWords.includes(wordLower)) {
      whitelistedWords.push(wordLower);
      await env.SESSIONS.put(
        'fakerank_whitelist',
        JSON.stringify(whitelistedWords),
      );

      console.log(
        `Admin ${adminCheck.session!.steamId} added "${wordLower}" to whitelist`,
      );

      return createResponse(
        {
          success: true,
          id: whitelistedWords.length, // Use the new length as ID
          word: wordLower,
          message: 'Word added to whitelist',
          totalWords: whitelistedWords.length,
        },
        200,
        origin,
      );
    } else {
      return createResponse(
        {
          success: false,
          message: 'Word already in whitelist',
        },
        409,
        origin,
      );
    }
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// REMOVE word from whitelist
export async function handleRemoveFromWhitelist(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const body = (await request.json()) as any;
    const { word } = body;

    if (!word || typeof word !== 'string') {
      return createResponse({ error: 'Valid word is required' }, 400, origin);
    }

    const wordLower = word.trim().toLowerCase();

    // Get existing whitelist
    const whitelistData = await env.SESSIONS.get('fakerank_whitelist');
    let whitelistedWords: string[] = [];

    if (whitelistData) {
      whitelistedWords = JSON.parse(whitelistData);
    }

    // Remove word if present
    const initialLength = whitelistedWords.length;
    whitelistedWords = whitelistedWords.filter((w) => w !== wordLower);

    if (whitelistedWords.length < initialLength) {
      await env.SESSIONS.put(
        'fakerank_whitelist',
        JSON.stringify(whitelistedWords),
      );

      console.log(
        `Admin ${adminCheck.session!.steamId} removed "${wordLower}" from whitelist`,
      );

      return createResponse(
        {
          success: true,
          word: wordLower,
          message: 'Word removed from whitelist',
          totalWords: whitelistedWords.length,
        },
        200,
        origin,
      );
    } else {
      return createResponse(
        {
          success: false,
          message: 'Word not found in whitelist',
        },
        404,
        origin,
      );
    }
  } catch (error) {
    console.error('Error removing from whitelist:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

// GET all users with fakeranks from current player list (for admin overview, excludes requesting user)
export async function handleGetAllFakeranks(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const adminCheck = await validateFakerankAdmin(request, env);
    if (!adminCheck.isValid) {
      return createResponse({ error: adminCheck.error }, 401, origin);
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Try to get player list from Discord worker HTTP API
    let playerListData: Player[] = [];
    let currentPlayersOnline = 0;

    try {
      const response = await fetch(
        'https://zeitvertreib-discord-backend.zeitvertreib.vip/webhook/playerlist',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.DISCORD_WORKER_API_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.ok) {
        const rawData = await response.json();
        playerListData = Array.isArray(rawData) ? rawData : [];
        currentPlayersOnline = playerListData.length;
        console.log(
          `Successfully fetched ${currentPlayersOnline} players from Discord worker API`,
        );
      } else {
        console.warn(
          'Failed to get player list from Discord worker API:',
          response.status,
          response.statusText,
        );
      }
    } catch (error) {
      console.warn('Error calling Discord worker API for playerlist:', error);
      // Continue without current player data
    }

    // Extract unique player names and user IDs from the player list (if available)
    const uniquePlayerNames =
      playerListData.length > 0
        ? [...new Set(playerListData.map((player) => player.Name))]
        : [];
    const uniqueUserIds =
      playerListData.length > 0
        ? [
          ...new Set(
            playerListData.map((player) =>
              player.UserId.replace('@steam', ''),
            ),
          ),
        ]
        : [];

    // Get all users with fakeranks from database
    const allFakeranksResult = await env['zeitvertreib-data']
      .prepare(
        `
                SELECT id, fakerank, fakerank_color, fakerank_until, experience 
                FROM playerdata 
                WHERE fakerank IS NOT NULL
            `,
      )
      .all();

    // Create a map of player data by Steam ID
    const playerDataMap = new Map();
    const currentTimestamp = Math.floor(Date.now() / 1000);

    allFakeranksResult.results.forEach((row: any) => {
      const steamId = row.id.replace('@steam', '');
      const fakerankUntil = Number(row.fakerank_until) || 0;
      const hasFakerankAccess = fakerankUntil > 0 && currentTimestamp < fakerankUntil;

      playerDataMap.set(steamId, {
        steamId,
        fakerank: row.fakerank,
        fakerank_color: row.fakerank_color,
        fakerank_until: fakerankUntil,
        hasFakerankAccess,
        experience: row.experience,
      });
    });

    // Create a map only for current players
    const allUsersMap = new Map();

    // Only add current players from the player list
    playerListData.forEach((player) => {
      const steamId = player.UserId.replace('@steam', '');

      const existingFakerank = playerDataMap.get(steamId);

      allUsersMap.set(steamId, {
        steamId,
        fakerank: existingFakerank?.fakerank || null,
        fakerank_color: existingFakerank?.fakerank_color || null,
        fakerank_until: existingFakerank?.fakerank_until || 0,
        hasFakerankAccess: existingFakerank?.hasFakerankAccess || false,
        experience: existingFakerank?.experience || 0,
        isCurrentlyOnline: true,
        currentPlayer: player,
      });
    });

    // Convert to array and sort (online players with fakeranks first, then online players without fakeranks)
    let allUsersWithFakeranks = Array.from(allUsersMap.values());
    allUsersWithFakeranks.sort((a, b) => {
      // Priority 1: Players with fakeranks first
      if (a.fakerank && !b.fakerank) return -1;
      if (!a.fakerank && b.fakerank) return 1;

      // Priority 2: By ZV Coins (experience column)
      return b.experience - a.experience;
    });

    const totalUsersWithFakeranks = allUsersWithFakeranks.length;
    const paginatedUsers = allUsersWithFakeranks.slice(offset, offset + limit);

    // Map each user with current player session info
    const users = paginatedUsers.map((userData) => {
      const currentPlayer = userData.currentPlayer;

      return {
        steamId: userData.steamId,
        username: currentPlayer?.Name || `Player ${userData.steamId.slice(-4)}`, // Use actual name if available
        fakerank: userData.fakerank || 'No Fakerank', // Show "No Fakerank" for players without one
        fakerank_color: userData.fakerank_color || '#ffffff',
        fakerank_until: userData.fakerank_until,
        hasFakerankAccess: userData.hasFakerankAccess,
        experience: userData.experience,
        // Additional info from current session (if player is currently online)
        currentHealth: currentPlayer?.Health || null,
        currentTeam: currentPlayer?.Team || null,
        isCurrentlyOnline: userData.isCurrentlyOnline,
        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    return createResponse(
      {
        users,
        pagination: {
          limit,
          offset,
          total: totalUsersWithFakeranks,
        },
        // Additional info about current session
        currentPlayersOnline,
        uniquePlayerNames:
          playerListData.length > 0 ? uniquePlayerNames.length : null,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting all fakeranks:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}
