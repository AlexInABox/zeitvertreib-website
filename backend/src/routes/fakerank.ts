import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray } from 'drizzle-orm';
import { fakeranks, fakerankBans, deletedFakeranks, playerdata } from '../db/schema.js';
import { proxyFetch } from '../proxy.js';
import type {
  FakerankGetRequest,
  FakerankGetResponse,
  FakerankColor,
  FakerankPostRequest,
  FakerankDeleteRequest,
} from '@zeitvertreib/types';

// TODO: Consider implementing a Levenshtein distance check to catch slight variations of banned words. Or a vectorization approach since we store this in a database anyway.

const MODERATION_CHANNEL_ID = '1401609093633933324';

/**
 * Normalizes fakerank text by converting to lowercase and removing spaces
 * This helps catch variations like "fuck u" and "fUcKu" as the same text
 *
 * "Größe, naïve!"
 * -> "größenaïve"
 */
function normalizeFakerankText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Send fakerank moderation notification to Discord
 */
async function sendFakerankModerationNotification(
  env: Env,
  fakerankId: number,
  userid: string,
  fakerankText: string,
  fakerankColor: string,
  normalizedText: string,
): Promise<void> {
  try {
    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Get user data from playerdata
    const userData = await db
      .select({
        discordId: playerdata.discordId,
        username: playerdata.username,
      })
      .from(playerdata)
      .where(eq(playerdata.id, userid))
      .limit(1);

    const user = userData[0];
    const discordId = user?.discordId || 'Not linked';
    const steamUsername = user?.username || 'Unknown';

    // Get Discord username if available
    let discordName = 'Unknown';
    if (user?.discordId) {
      try {
        const discordUserResponse = await proxyFetch(
          `https://discord.com/api/v10/users/${user.discordId}`,
          {
            headers: {
              Authorization: `Bot ${env.DISCORD_TOKEN}`,
            },
          },
          env,
        );
        if (discordUserResponse.ok) {
          const discordUser: any = await discordUserResponse.json();
          discordName = discordUser.global_name || discordUser.username || 'Unknown';
        }
      } catch (error) {
        console.error('Failed to fetch Discord username:', error);
      }
    }

    // Create Discord message payload
    const payload = {
      embeds: [
        {
          title: 'Fakerank uploaded!',
          description: `Discord: ${discordName} (\`${discordId}\`)\nSteam: ${steamUsername} (\`${userid}\`)\nFakerank Text: **${fakerankText}**\nColor: ${fakerankColor}\nNormalized: \`${normalizedText}\``,
          color: 0x10b981,
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: 'Delete Fakerank',
              custom_id: `fakerank_delete:${normalizedText}:${userid}`,
            },
            {
              type: 2,
              style: 4,
              label: 'Ban User',
              custom_id: `fakerank_ban:${normalizedText}:${userid}`,
            },
          ],
        },
      ],
    };

    // Send message to Discord
    const response = await proxyFetch(
      `https://discord.com/api/v10/channels/${MODERATION_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    if (response.ok) {
      console.log(`✅ Discord notification sent successfully for fakerank ${fakerankId}`);
    } else {
      const errorText = await response.text();
      console.error(`❌ Discord API error (${response.status}):`, errorText);
    }
  } catch (error) {
    console.error('❌ Failed to send Discord moderation notification:', error);
    // Don't throw - we don't want to fail the fakerank upload if Discord notification fails
  }
}

// GET: Retrieve fakerank(s)
export async function getFakerank(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const useridsParam = url.searchParams.get('userids');

    // Check if request has API key
    const authHeader = request.headers.get('Authorization');
    const hasValidApiKey = authHeader === `Bearer ${env.FAKERANK_API_KEY}`;

    // Case 1: API key provided with userids array
    if (hasValidApiKey && useridsParam) {
      let userids: string[];
      try {
        userids = JSON.parse(useridsParam);
        if (!Array.isArray(userids)) {
          return createResponse({ error: 'userids must be an array' }, 400, origin);
        }
      } catch {
        return createResponse({ error: 'Invalid userids parameter' }, 400, origin);
      }

      // Query all fakeranks for the provided userids
      const fakerankResults = await db.select().from(fakeranks).where(inArray(fakeranks.userid, userids));

      const response: FakerankGetResponse = {
        fakeranks: fakerankResults.map((fr) => ({
          userid: fr.userid,
          id: fr.id,
          text: fr.text,
          color: fr.color as FakerankColor,
        })),
      };

      return createResponse(response, 200, origin);
    }

    // Case 2: User requesting their own fakerank
    const { status, steamId } = await validateSession(request, env);
    if (status !== 'valid' || !steamId) {
      return createResponse({ error: status === 'expired' ? 'Session expired' : 'Not authenticated' }, 401, origin);
    }

    const userid = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;
    const result = await db.select().from(fakeranks).where(eq(fakeranks.userid, userid));

    const response: FakerankGetResponse = {
      fakeranks: result.map((fr) => ({
        userid: fr.userid,
        id: fr.id,
        text: fr.text,
        color: fr.color as FakerankColor,
      })),
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Error fetching fakerank:', error);
    return createResponse({ error: 'Failed to fetch fakerank' }, 500, origin);
  }
}

// POST: Create or update user's fakerank
export async function updateFakerank(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session first
  const { status, steamId } = await validateSession(request, env);
  if (status !== 'valid' || !steamId) {
    return createResponse({ error: status === 'expired' ? 'Session expired' : 'Not authenticated' }, 401, origin);
  }

  const userid = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  try {
    // Parse request body
    const body = (await request.json()) as FakerankPostRequest;

    if (!body.text) {
      return createResponse({ error: 'Fakerank text is required' }, 400, origin);
    }

    // Validate text length
    if (body.text.length > 50) {
      return createResponse({ error: 'Fakerank darf maximal 50 Zeichen lang sein' }, 400, origin);
    }

    // Check if user is banned
    const ban = await db.select().from(fakerankBans).where(eq(fakerankBans.userid, userid));
    if (ban.length > 0) {
      return createResponse({ error: 'Du wurdest vom Setzen von Fakeranks gesperrt' }, 403, origin);
    }

    // Normalize the text
    const normalizedText = normalizeFakerankText(body.text);

    // Check if normalized text is in deletedFakeranks
    const deleted = await db.select().from(deletedFakeranks).where(eq(deletedFakeranks.normalizedText, normalizedText));

    if (deleted.length > 0) {
      return createResponse({ error: 'Dieser Fakerank wurde von der Moderation gesperrt' }, 403, origin);
    }

    // Delete existing fakerank if user already has one
    await db.delete(fakeranks).where(eq(fakeranks.userid, userid));

    // Insert new fakerank
    const result = await db
      .insert(fakeranks)
      .values({
        userid: userid,
        text: body.text,
        normalizedText: normalizedText,
        color: body.color,
        uploadedAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    const newFakerank = result[0];
    if (!newFakerank) {
      return createResponse({ error: 'Failed to create fakerank' }, 500, origin);
    }

    // Send Discord moderation notification (non-blocking)
    ctx.waitUntil(
      sendFakerankModerationNotification(env, newFakerank.id, userid, body.text, body.color, normalizedText).catch(
        (error) => console.error('❌ Failed to send Discord notification:', error),
      ),
    );

    return createResponse(
      {
        success: true,
        message: 'Fakerank erfolgreich gesetzt',
        fakerank: {
          id: newFakerank.id,
          text: newFakerank.text,
          color: newFakerank.color,
        },
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error updating fakerank:', error);
    return createResponse({ error: 'Fakerank konnte nicht gesetzt werden' }, 500, origin);
  }
}

// DELETE: Remove user's fakerank
export async function deleteFakerank(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session first
  const { status, steamId } = await validateSession(request, env);
  if (status !== 'valid' || !steamId) {
    return createResponse({ error: status === 'expired' ? 'Session expired' : 'Not authenticated' }, 401, origin);
  }

  const userid = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

  try {
    // Parse request body
    const body = (await request.json()) as FakerankDeleteRequest;

    if (!body.id) {
      return createResponse({ error: 'Fakerank ID is required' }, 400, origin);
    }

    // Check if the fakerank exists and belongs to the user
    const existingFakerank = await db.select().from(fakeranks).where(eq(fakeranks.id, body.id));

    if (existingFakerank.length === 0) {
      return createResponse({ error: 'Fakerank nicht gefunden' }, 404, origin);
    }

    const fakerank = existingFakerank[0];
    if (!fakerank) {
      return createResponse({ error: 'Fakerank nicht gefunden' }, 404, origin);
    }

    if (fakerank.userid !== userid) {
      return createResponse({ error: 'Du darfst nur deine eigenen Fakeranks löschen' }, 403, origin);
    }

    // Delete the fakerank
    await db.delete(fakeranks).where(eq(fakeranks.id, body.id));

    return createResponse(
      {
        success: true,
        message: 'Fakerank erfolgreich gelöscht',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error deleting fakerank:', error);
    return createResponse({ error: 'Fakerank konnte nicht gelöscht werden' }, 500, origin);
  }
}
