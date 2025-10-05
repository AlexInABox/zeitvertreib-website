import {
  validateSession,
  createResponse,
  getPlayerData,
  fetchDiscordWithProxy,
} from '../utils.js';
import OpenAI from 'openai';
import { profanity } from '@2toad/profanity';
import { EmbedBuilder } from '@discordjs/builders';
import { drizzle } from 'drizzle-orm/d1';

// Extend the Env interface to include OPENAI_API_KEY
declare global {
  interface Env {
    OPENAI_API_KEY: string;
  }
}

// Send accepted fakerank to Discord webhook for moderation tracking
async function sendFakerankToDiscord(
  steamId: string,
  fakerank: string,
  env: Env,
): Promise<void> {
  try {
    if (!env.SPRAY_MOD_WEBHOOK) {
      console.log(
        'No Discord webhook URL configured, skipping Discord notification',
      );
      return;
    }

    // Get Steam user data for nickname from our KV store
    let steamNickname = 'Unknown User';
    try {
      const userCacheKey = `steam_user:${steamId}`;
      const cachedUserData = await env.SESSIONS.get(userCacheKey);
      if (cachedUserData) {
        const userData = JSON.parse(cachedUserData);
        steamNickname = userData?.userData?.personaname || 'Unknown User';
      }
    } catch (error) {
      console.error('Error fetching cached Steam user data:', error);
    }

    // Create the embed using EmbedBuilder
    const embed = new EmbedBuilder()
      .setTitle('🏷️ Fakerank Updated')
      .setColor(0x0099ff) // Blue color
      .addFields(
        {
          name: 'Steam ID',
          value: steamId,
          inline: true,
        },
        {
          name: 'Steam Nickname',
          value: steamNickname,
          inline: true,
        },
        {
          name: 'New Fakerank',
          value: `"${fakerank}"`,
          inline: false,
        },
        {
          name: 'Timestamp',
          value: new Date().toISOString(),
          inline: false,
        },
      )
      .setTimestamp();

    // Discord webhooks support link buttons in raw JSON format
    const deleteUrl = `${env.BACKEND_URL}/fakerank/moderate/delete?steamId=${encodeURIComponent(steamId)}&fakerank=${encodeURIComponent(fakerank)}`;
    const banUrl = `${env.BACKEND_URL}/fakerank/moderate/ban?steamId=${encodeURIComponent(steamId)}&fakerank=${encodeURIComponent(fakerank)}`;

    // Create components in Discord webhook format
    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 5, // Link style
            label: '❌ DELETE & BLACKLIST',
            url: deleteUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '🔨 DELETE & BAN USER',
            url: banUrl,
          },
        ],
      },
    ];

    const payload = {
      content: `🏷️ New fakerank set`,
      embeds: [embed.toJSON()],
      username: 'Fakerank Moderation System',
      components: components,
    };

    // Add with_components=true query parameter to enable components
    const webhookUrl = new URL(env.SPRAY_MOD_WEBHOOK);
    webhookUrl.searchParams.set('with_components', 'true');

    const response = await fetchDiscordWithProxy(
      webhookUrl.toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Failed to send fakerank to Discord webhook:',
        response.status,
        response.statusText,
        'Response body:',
        errorText,
      );
    } else {
      console.log(
        `Successfully sent fakerank notification to Discord for Steam ID: ${steamId}`,
      );
    }
  } catch (error) {
    console.error('Error sending fakerank to Discord webhook:', error);
  }
}

// Load blacklisted words from KV and add them to profanity filter
async function loadBlacklist(env: Env): Promise<void> {
  try {
    const blacklistData = await env.SESSIONS.get('fakerank_blacklist');
    if (blacklistData) {
      const blacklistedWords = JSON.parse(blacklistData);
      if (Array.isArray(blacklistedWords) && blacklistedWords.length > 0) {
        profanity.addWords(blacklistedWords);
        console.log(`Loaded ${blacklistedWords.length} blacklisted words`);
      }
    }
  } catch (error) {
    console.error('Error loading blacklist:', error);
  }
}

// GET: Retrieve user's fakerank information
export async function getFakerank(
  request: Request,
  db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session first
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return createResponse({ error: error! }, 401, origin);
  }

  const playerId = `${session!.steamId}@steam`;
  try {
    const playerData = await getPlayerData(
      playerId.replace('@steam', ''),
      db,
      env,
    );

    // Calculate fakerank access based on timestamp
    const fakerankUntil = Number(playerData?.fakerank_until) || 0;
    // Calculate if user has fakerank access (for future use)
    // const currentTimestamp = Math.floor(Date.now() / 1000);
    // const hasFakerankAccess =
    //   fakerankUntil > 0 && currentTimestamp < fakerankUntil;

    return createResponse(
      {
        fakerank: playerData?.fakerank || null,
        fakerank_color: playerData?.fakerank_color || 'default',
        fakerank_until: fakerankUntil,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error fetching fakerank:', error);
    return createResponse(
      { error: 'Fakerank konnte nicht abgerufen werden' },
      500,
      origin,
    );
  }
}

// POST/PATCH: Create or update user's fakerank
export async function updateFakerank(
  request: Request,
  db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session first
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return createResponse({ error: error! }, 401, origin);
  }

  const playerId = `${session!.steamId}@steam`;
  try {
    // Check if user is allowed to set fakeranks based on timestamp
    const playerData = await getPlayerData(
      playerId.replace('@steam', ''),
      db,
      env,
    );

    // Check if user has valid fakerank access (regular access)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const fakerankUntil = Number(playerData?.fakerank_until) || 0;
    const fakerankOverrideUntil =
      Number(playerData?.fakerankoverride_until) || 0;

    const hasFakerankAccess =
      fakerankUntil > 0 && currentTimestamp < fakerankUntil;
    const hasOverrideAccess =
      fakerankOverrideUntil > 0 && currentTimestamp < fakerankOverrideUntil;

    // User can edit if they have regular access OR if they only have override (no regular access)
    // But if they have both, regular access takes precedence and they can edit
    if (!hasFakerankAccess && !hasOverrideAccess) {
      return createResponse(
        {
          error:
            'Du bist noch nicht für diese Zeitvertreib-Funktion freigeschaltet! Du kannst entweder den Discord-Server boosten, über ko-fi.com spenden oder durch sehr aktives Spielen auf dem SCP-Server VIP werden. Tritt dem Discord unter dsc.gg/zeit bei für weitere Informationen.',
        },
        403,
        origin,
      );
    }

    // Load blacklisted words and add them to profanity filter
    await loadBlacklist(env);

    // Check if user is banned from setting fakeranks
    const steamId = playerId.replace('@steam', '');
    const banKey = `fakerank_ban_${steamId}`;
    const banData = await env.SESSIONS.get(banKey);
    if (banData) {
      const ban = JSON.parse(banData);
      console.log(
        `Steam ID ${steamId} is banned from setting fakeranks: ${ban.reason}`,
      );
      return createResponse(
        { error: 'Du wurdest vom Setzen von Fakeranks gesperrt' },
        403,
        origin,
      );
    }

    // Parse request body
    const body = (await request.json()) as {
      fakerank: string;
      fakerank_color?: string;
    };

    if (!body.fakerank && body.fakerank !== '') {
      return createResponse(
        { error: 'Fakerank ist erforderlich' },
        400,
        origin,
      );
    }

    // Validate fakerank_color if provided
    const validColors = [
      'pink',
      'red',
      'brown',
      'silver',
      'default',
      'light_green',
      'crimson',
      'cyan',
      'aqua',
      'deep_pink',
      'tomato',
      'yellow',
      'magenta',
      'blue_green',
      'orange',
      'lime',
      'green',
      'emerald',
      'carmine',
      'nickel',
      'mint',
      'army_green',
      'pumpkin',
    ];

    const fakerankColor = body.fakerank_color || 'default';
    if (!validColors.includes(fakerankColor)) {
      return createResponse(
        { error: 'Ungültige Fakerank-Farbe ausgewählt' },
        400,
        origin,
      );
    }

    // Validate fakerank length (optional, adjust as needed)
    if (body.fakerank.length > 50) {
      return createResponse(
        { error: 'Fakerank darf maximal 50 Zeichen lang sein' },
        400,
        origin,
      );
    }

    // Validate fakerank content - ban parentheses and commas
    if (
      body.fakerank.includes('(') ||
      body.fakerank.includes(')') ||
      body.fakerank.includes(',')
    ) {
      return createResponse(
        { error: 'Fakerank darf keine Klammern () oder Kommas enthalten' },
        400,
        origin,
      );
    }

    // First, check whitelist - if whitelisted, skip all other content validation
    let isWhitelisted = false;
    try {
      const whitelistData = await env.SESSIONS.get('fakerank_whitelist');
      if (whitelistData) {
        const whitelistedWords = JSON.parse(whitelistData) as string[];
        isWhitelisted = whitelistedWords.some(
          (word) =>
            body.fakerank.toLowerCase().includes(word.toLowerCase()) ||
            word.toLowerCase().includes(body.fakerank.toLowerCase()) ||
            body.fakerank.toLowerCase() === word.toLowerCase(),
        );
      }
    } catch (whitelistError) {
      console.error('Error checking whitelist:', whitelistError);
      // Continue with normal validation if whitelist check fails
    }

    // Only perform content validation if the word is NOT whitelisted
    if (!isWhitelisted) {
      // Validate fakerank content using profanity filter
      try {
        // Check built-in profanity detection
        const containsProfanity = profanity.exists(body.fakerank);
        const containsProfanityWithLangs = profanity.exists(body.fakerank, [
          'en',
          'de',
          'fr',
        ]);

        // Manual check against our blacklist (more reliable than library for custom words)
        const blacklistData = await env.SESSIONS.get('fakerank_blacklist');
        let isBlacklisted = false;

        if (blacklistData) {
          const blacklistedWords = JSON.parse(blacklistData) as string[];
          isBlacklisted = blacklistedWords.some(
            (word) =>
              body.fakerank.toLowerCase().includes(word.toLowerCase()) ||
              word.toLowerCase().includes(body.fakerank.toLowerCase()),
          );
        }

        if (containsProfanity || containsProfanityWithLangs || isBlacklisted) {
          return createResponse(
            { error: 'Fakerank enthält unangemessene Inhalte' },
            400,
            origin,
          );
        }
      } catch (profanityError) {
        console.error('Error checking profanity:', profanityError);
        return createResponse(
          { error: 'Inhalt konnte nicht validiert werden' },
          500,
          origin,
        );
      }

      // Validate fakerank content using OpenAI moderation
      if (!env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is not configured');
        return createResponse(
          { error: 'Inhaltsvalidierung nicht verfügbar' },
          500,
          origin,
        );
      }

      try {
        const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

        const moderation = await openai.moderations.create({
          model: 'omni-moderation-latest',
          input: body.fakerank,
        });

        // Evaluate moderation response
        const results = moderation.results || [];
        if (Array.isArray(results) && results.length > 0) {
          for (const result of results) {
            if (result.flagged) {
              return createResponse(
                { error: 'Fakerank enthält unangemessene Inhalte' },
                400,
                origin,
              );
            }
          }
        }
      } catch (moderationError) {
        console.error('Error with OpenAI moderation:', moderationError);
        return createResponse(
          { error: 'Inhalt konnte nicht validiert werden' },
          500,
          origin,
        );
      }
    } else {
      console.log(
        `Fakerank "${body.fakerank}" is whitelisted, skipping content validation`,
      );
    }

    // Check if player exists in database
    const existingPlayer = await env['zeitvertreib-data']
      .prepare('SELECT id FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first();

    if (existingPlayer) {
      // If user has regular fakerank access and an override is active, clear the override
      if (hasFakerankAccess && hasOverrideAccess) {
        // Update existing player's fakerank, color, and clear override
        await env['zeitvertreib-data']
          .prepare(
            'UPDATE playerdata SET fakerank = ?, fakerank_color = ?, fakerankoverride_until = 0 WHERE id = ?',
          )
          .bind(body.fakerank, fakerankColor, playerId)
          .run();
      } else {
        // Update existing player's fakerank and color only
        await env['zeitvertreib-data']
          .prepare(
            'UPDATE playerdata SET fakerank = ?, fakerank_color = ? WHERE id = ?',
          )
          .bind(body.fakerank, fakerankColor, playerId)
          .run();
      }
    } else {
      // Create new player record with fakerank and color
      await env['zeitvertreib-data']
        .prepare(
          `INSERT INTO playerdata (id, fakerank, fakerank_color, experience, playtime, roundsplayed, usedmedkits, usedcolas, pocketescapes, usedadrenaline) 
                         VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0)`,
        )
        .bind(playerId, body.fakerank, fakerankColor)
        .run();
    }

    // Send Discord notification for successful fakerank update
    const userSteamId = playerId.replace('@steam', '');
    await sendFakerankToDiscord(userSteamId, body.fakerank, env);

    // Determine response message based on whether override was cleared
    const overrideCleared = hasFakerankAccess && hasOverrideAccess;
    const message = overrideCleared
      ? 'Fakerank erfolgreich aktualisiert und Admin-Override entfernt'
      : 'Fakerank erfolgreich aktualisiert';

    return createResponse(
      {
        success: true,
        message: message,
        fakerank: body.fakerank,
        fakerank_color: fakerankColor,
        override_cleared: overrideCleared,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error updating fakerank:', error);
    return createResponse({ error: 'Failed to fetch fakerank' }, 500, origin);
  }
}

// DELETE: Remove user's fakerank
export async function deleteFakerank(
  request: Request,
  db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session first
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return createResponse({ error: error! }, 401, origin);
  }

  const playerId = `${session!.steamId}@steam`;
  try {
    // Check if user is allowed to modify fakeranks based on timestamp
    const playerData = await getPlayerData(
      playerId.replace('@steam', ''),
      db,
      env,
    );

    // Check if user has valid fakerank access
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const fakerankUntil = Number(playerData?.fakerank_until) || 0;
    const hasFakerankAccess =
      fakerankUntil > 0 && currentTimestamp < fakerankUntil;

    if (!hasFakerankAccess) {
      return createResponse(
        {
          error:
            'Du bist noch nicht für diese Zeitvertreib-Funktion freigeschaltet! Du kannst entweder den Discord-Server boosten, über ko-fi.com spenden oder durch sehr aktives Spielen auf dem SCP-Server VIP werden. Tritt dem Discord unter dsc.gg/zeit bei für weitere Informationen.',
        },
        403,
        origin,
      );
    }

    // Check if player exists in database
    const existingPlayer = await env['zeitvertreib-data']
      .prepare('SELECT id FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first();

    if (existingPlayer) {
      // Set fakerank to NULL and reset color to default
      await env['zeitvertreib-data']
        .prepare(
          'UPDATE playerdata SET fakerank = NULL, fakerank_color = ? WHERE id = ?',
        )
        .bind('default', playerId)
        .run();

      return createResponse(
        {
          success: true,
          message: 'Fakerank erfolgreich gelöscht',
        },
        200,
        origin,
      );
    } else {
      return createResponse(
        {
          success: true,
          message: 'Kein Fakerank zum Löschen vorhanden',
        },
        200,
        origin,
      );
    }
  } catch (error) {
    console.error('Error deleting fakerank:', error);
    return createResponse(
      { error: 'Fakerank konnte nicht gelöscht werden' },
      500,
      origin,
    );
  }
}

// Handle Discord moderation action - delete fakerank and blacklist word
export async function handleFakerankModerationDelete(
  request: Request,
  _db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const fakerank = url.searchParams.get('fakerank');

    if (!steamId || !fakerank) {
      return createResponse(
        { error: 'steamId und fakerank sind erforderlich' },
        400,
        origin,
      );
    }

    const playerId = `${steamId}@steam`;

    // Delete the fakerank from database and reset color
    await env['zeitvertreib-data']
      .prepare(
        'UPDATE playerdata SET fakerank = NULL, fakerank_color = ? WHERE id = ?',
      )
      .bind('default', playerId)
      .run();

    // Add word to blacklist
    const blacklistKey = 'fakerank_blacklist';
    let blacklistedWords: string[] = [];

    const existingBlacklist = await env.SESSIONS.get(blacklistKey);
    if (existingBlacklist) {
      blacklistedWords = JSON.parse(existingBlacklist);
    }

    // Add the word if it's not already blacklisted
    const wordLower = fakerank.toLowerCase();
    if (!blacklistedWords.includes(wordLower)) {
      blacklistedWords.push(wordLower);
      await env.SESSIONS.put(blacklistKey, JSON.stringify(blacklistedWords));
    }

    console.log(
      `Moderator deleted fakerank "${fakerank}" for Steam ID: ${steamId} and added to blacklist`,
    );

    return createResponse(
      {
        success: true,
        message: 'Fakerank deleted and word blacklisted',
        blacklistedWord: fakerank,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling fakerank moderation delete:', error);
    return createResponse(
      { error: 'Failed to process moderation action' },
      500,
      origin,
    );
  }
}

// Handle Discord moderation action - delete fakerank, blacklist word, and ban user
export async function handleFakerankModerationBan(
  request: Request,
  _db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const fakerank = url.searchParams.get('fakerank');

    if (!steamId || !fakerank) {
      return createResponse(
        { error: 'steamId und fakerank sind erforderlich' },
        400,
        origin,
      );
    }

    const playerId = `${steamId}@steam`;

    // Delete the fakerank from database and reset color
    await env['zeitvertreib-data']
      .prepare(
        'UPDATE playerdata SET fakerank = NULL, fakerank_color = ? WHERE id = ?',
      )
      .bind('default', playerId)
      .run();

    // Add word to blacklist
    const blacklistKey = 'fakerank_blacklist';
    let blacklistedWords: string[] = [];

    const existingBlacklist = await env.SESSIONS.get(blacklistKey);
    if (existingBlacklist) {
      blacklistedWords = JSON.parse(existingBlacklist);
    }

    // Add the word if it's not already blacklisted
    const wordLower = fakerank.toLowerCase();
    if (!blacklistedWords.includes(wordLower)) {
      blacklistedWords.push(wordLower);
      await env.SESSIONS.put(blacklistKey, JSON.stringify(blacklistedWords));
    }

    // Ban the user from setting fakeranks
    const banKey = `fakerank_ban_${steamId}`;
    const banData = {
      steamId,
      bannedAt: Date.now(),
      bannedBy: 'moderator',
      reason: 'Banned via Discord fakerank moderation',
      permanent: true,
    };
    await env.SESSIONS.put(banKey, JSON.stringify(banData));

    console.log(
      `Moderator banned Steam ID: ${steamId}, deleted fakerank "${fakerank}", and added to blacklist`,
    );

    return createResponse(
      {
        success: true,
        message: 'Fakerank deleted, word blacklisted, and user banned',
        blacklistedWord: fakerank,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling fakerank moderation ban:', error);
    return createResponse(
      { error: 'Failed to process moderation action' },
      500,
      origin,
    );
  }
}
