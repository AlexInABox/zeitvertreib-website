import { validateSession, createResponse, getPlayerData, fetchSteamUserData, isModerator } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, isNotNull } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';

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

// GET user fakerank by steamid
export async function handleGetUserFakerank(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
    }

    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');

    if (!steamId) {
      return createResponse({ error: 'steamId parameter required' }, 400, origin);
    }

    // Get player data for the requested user
    const playerData = await getPlayerData(steamId, db, env);
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
        avatarFull: steamUserData?.avatarfull || steamUserData?.avatarmedium || null,
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
export async function handleSetUserFakerank(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA, { casing: 'camelCase' });
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
    }

    const body = (await request.json()) as any;
    const { steamId, fakerank, fakerank_color = 'default', isOverride = false, overrideDurationHours = 24 } = body;

    if (!steamId) {
      return createResponse({ error: 'steamId is required' }, 400, origin);
    }

    if (fakerank && (typeof fakerank !== 'string' || fakerank.length > 50)) {
      return createResponse({ error: 'Invalid fakerank format' }, 400, origin);
    }

    // Validate fakerank content - ban parentheses and commas
    if (fakerank && (fakerank.includes('(') || fakerank.includes(')') || fakerank.includes(','))) {
      return createResponse({ error: 'Fakerank darf keine Klammern () oder Kommas enthalten' }, 400, origin);
    }

    // Update the user's fakerank
    // Ensure steamId has @steam suffix (don't duplicate if already present)
    const playerId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

    if (fakerank) {
      // Set fakerank
      if (isOverride) {
        // Set as override fakerank with expiration
        const overrideUntil = Math.floor(Date.now() / 1000) + overrideDurationHours * 3600;
        await db
          .update(playerdata)
          .set({
            fakerank,
            fakerankColor: fakerank_color,
            fakerankoverrideUntil: overrideUntil,
          })
          .where(eq(playerdata.id, playerId));
      } else {
        // Set regular fakerank (user can modify)
        await db
          .update(playerdata)
          .set({
            fakerank,
            fakerankColor: fakerank_color,
            fakerankoverrideUntil: 0,
          })
          .where(eq(playerdata.id, playerId));
      }
    } else {
      // Clear fakerank and override
      await db
        .update(playerdata)
        .set({
          fakerank: null,
          fakerankColor: 'default',
          fakerankoverrideUntil: 0,
        })
        .where(eq(playerdata.id, playerId));
    }

    console.log(`Admin ${sessionValidation.steamId} updated fakerank for ${steamId}: "${fakerank}" (override: ${isOverride})`);

    return createResponse(
      {
        success: true,
        steamId,
        fakerank: fakerank || null,
        fakerank_color,
        isOverride,
        overrideDurationHours: isOverride ? overrideDurationHours : undefined,
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
export async function handleGetBlacklist(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
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
export async function handleAddToBlacklist(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
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
      await env.SESSIONS.put('fakerank_blacklist', JSON.stringify(blacklistedWords));

      console.log(`Admin ${sessionValidation.steamId} added "${wordLower}" to blacklist`);

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
export async function handleRemoveFromBlacklist(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
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
      await env.SESSIONS.put('fakerank_blacklist', JSON.stringify(blacklistedWords));

      console.log(`Admin ${sessionValidation.steamId} removed "${wordLower}" from blacklist`);

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
export async function handleGetWhitelist(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
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
export async function handleAddToWhitelist(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
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
      await env.SESSIONS.put('fakerank_whitelist', JSON.stringify(whitelistedWords));

      console.log(`Admin ${sessionValidation.steamId} added "${wordLower}" to whitelist`);

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
export async function handleRemoveFromWhitelist(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const isModeratorUser = await isModerator(sessionValidation.steamId, env);
    if (!isModeratorUser) {
      return createResponse({ error: 'Insufficient privileges - moderator access required' }, 403, origin);
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
      await env.SESSIONS.put('fakerank_whitelist', JSON.stringify(whitelistedWords));

      console.log(`Admin ${sessionValidation.steamId} removed "${wordLower}" from whitelist`);

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
