import { validateSession, createResponse, getPlayerData } from '../utils.js';
import OpenAI from 'openai';
import { profanity } from '@2toad/profanity';
import { EmbedBuilder } from '@discordjs/builders';

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

    const response = await fetch(webhookUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

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

export async function handleFakerank(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session first
  const { isValid, session, error } = await validateSession(request, env);

  if (!isValid) {
    return createResponse({ error: error! }, 401, origin);
  }

  const method = request.method;
  const playerId = `${session!.steamId}@steam`;

  try {
    switch (method) {
      case 'GET':
        return await handleGetFakerank(playerId, env, origin);

      case 'POST':
      case 'PATCH':
        return await handleUpdateFakerank(request, playerId, env, origin);

      case 'DELETE':
        return await handleDeleteFakerank(playerId, env, origin);

      default:
        return createResponse({ error: 'Method Not Allowed' }, 405, origin);
    }
  } catch (error) {
    console.error('Error handling fakerank request:', error);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

async function handleGetFakerank(
  playerId: string,
  env: Env,
  origin: string | null,
): Promise<Response> {
  try {
    const playerData = await getPlayerData(playerId.replace('@steam', ''), env);

    return createResponse(
      {
        fakerank: playerData?.fakerank || null,
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

async function handleUpdateFakerank(
  request: Request,
  playerId: string,
  env: Env,
  origin: string | null,
): Promise<Response> {
  try {
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
    const body = (await request.json()) as { fakerank: string };

    if (!body.fakerank && body.fakerank !== '') {
      return createResponse(
        { error: 'Fakerank ist erforderlich' },
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
    } // Validate fakerank content using OpenAI moderation
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

    // Check if player exists in database
    const existingPlayer = await env['zeitvertreib-data']
      .prepare('SELECT id FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first();

    if (existingPlayer) {
      // Update existing player's fakerank
      await env['zeitvertreib-data']
        .prepare('UPDATE playerdata SET fakerank = ? WHERE id = ?')
        .bind(body.fakerank, playerId)
        .run();
    } else {
      // Create new player record with fakerank
      await env['zeitvertreib-data']
        .prepare(
          `INSERT INTO playerdata (id, fakerank, experience, playtime, roundsplayed, usedmedkits, usedcolas, pocketescapes, usedadrenaline) 
                         VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`,
        )
        .bind(playerId, body.fakerank)
        .run();
    }

    // Send Discord notification for successful fakerank update
    const userSteamId = playerId.replace('@steam', '');
    await sendFakerankToDiscord(userSteamId, body.fakerank, env);

    return createResponse(
      {
        success: true,
        message: 'Fakerank erfolgreich aktualisiert',
        fakerank: body.fakerank,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error updating fakerank:', error);
    return createResponse({ error: 'Failed to fetch fakerank' }, 500, origin);
  }
}

async function handleDeleteFakerank(
  playerId: string,
  env: Env,
  origin: string | null,
): Promise<Response> {
  try {
    // Check if player exists in database
    const existingPlayer = await env['zeitvertreib-data']
      .prepare('SELECT id FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first();

    if (existingPlayer) {
      // Set fakerank to NULL (or empty string, depending on your preference)
      await env['zeitvertreib-data']
        .prepare('UPDATE playerdata SET fakerank = NULL WHERE id = ?')
        .bind(playerId)
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

    // Delete the fakerank from database
    await env['zeitvertreib-data']
      .prepare('UPDATE playerdata SET fakerank = NULL WHERE id = ?')
      .bind(playerId)
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

    // Delete the fakerank from database
    await env['zeitvertreib-data']
      .prepare('UPDATE playerdata SET fakerank = NULL WHERE id = ?')
      .bind(playerId)
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
