import { drizzle } from 'drizzle-orm/d1';
import { eq, desc } from 'drizzle-orm';
import { paysafeCardSubmissions, playerdata } from '../db/schema.js';
import { validateSession, createResponse } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import type { PaysafeCardPostRequest, PaysafeCardGetResponse, PaysafeCardSubmissionStatus } from '@zeitvertreib/types';

/**
 * POST /paysafe
 * Submit a paysafe card code for processing
 */
export async function handlePostPaysafe(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate session
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const steamId = sessionValidation.steamId;
    const playerId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

    // Get player data to check for linked Discord ID
    const playerDataResult = await db
      .select({
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(eq(playerdata.id, playerId))
      .get();

    if (!playerDataResult || !playerDataResult.discordId) {
      return createResponse(
        { error: 'Discord account not linked. Please link your Discord account first.' },
        403,
        origin,
      );
    }

    const discordId = playerDataResult.discordId;

    // Parse request body
    const body = (await request.json()) as PaysafeCardPostRequest;
    const cardCode = body.cardCode;

    if (!cardCode || typeof cardCode !== 'string') {
      return createResponse({ error: 'Invalid card code' }, 400, origin);
    }

    // Validate card code format (basic validation)
    if (cardCode.length < 8 || cardCode.length > 30) {
      return createResponse({ error: 'Invalid card code format' }, 400, origin);
    }

    // Insert submission into database
    const now = Math.floor(Date.now() / 1000);
    const submissionResult = await db
      .insert(paysafeCardSubmissions)
      .values({
        discordId: discordId,
        cardCode: cardCode,
        submittedAt: now,
        processedAt: now,
        status: 'pending',
        amount: '0',
      })
      .returning({
        id: paysafeCardSubmissions.id,
      });

    if (!submissionResult[0]) {
      return createResponse({ error: 'Failed to create submission' }, 500, origin);
    }

    const submissionId = submissionResult[0].id;

    // Send Discord DM to the receiver
    try {
      // Create DM channel with receiver
      const createDmResponse = await proxyFetch(
        'https://discord.com/api/v10/users/@me/channels',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${env.DISCORD_TOKEN}`,
          },
          body: JSON.stringify({
            recipient_id: env.PAYSAFE_RECEIVER_USER_ID,
          }),
        },
        env,
      );

      if (!createDmResponse.ok) {
        console.error('Failed to create DM channel:', await createDmResponse.text());
        throw new Error('Failed to create DM channel');
      }

      const dmChannel = (await createDmResponse.json()) as any;
      const channelId = dmChannel.id;

      // Truncate card code for display
      const cardCodeTruncated =
        cardCode.length > 10 ? `${cardCode.substring(0, 4)}...${cardCode.substring(cardCode.length - 4)}` : cardCode;

      // Send message with interactive button
      const sendMessageResponse = await proxyFetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${env.DISCORD_TOKEN}`,
          },
          body: JSON.stringify({
            embeds: [
              {
                title: '💳 Neue Paysafecard-Einreichung',
                color: 0x5865f2,
                fields: [
                  {
                    name: '🆔 Submission ID',
                    value: `#${submissionId}`,
                    inline: true,
                  },
                  {
                    name: '👤 Discord User',
                    value: `<@${discordId}>`,
                    inline: true,
                  },
                  {
                    name: '🎫 Card Code',
                    value: `\`${cardCode}\``,
                    inline: false,
                  },
                  {
                    name: '🔒 Card Code (Truncated)',
                    value: `\`${cardCodeTruncated}\``,
                    inline: true,
                  },
                  {
                    name: '📅 Submitted At',
                    value: `<t:${now}:F>`,
                    inline: true,
                  },
                ],
                footer: {
                  text: 'Private DM für John Zeitvertreib (Owner)',
                },
                timestamp: new Date(now * 1000).toISOString(),
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3, // Green button
                    label: 'Approve',
                    custom_id: `paysafe_approve:${submissionId}:${discordId}`,
                    emoji: {
                      name: '✅',
                    },
                  },
                  {
                    type: 2,
                    style: 4, // Red button
                    label: 'Reject',
                    custom_id: `paysafe_reject:${submissionId}:${discordId}`,
                    emoji: {
                      name: '❌',
                    },
                  },
                ],
              },
            ],
          }),
        },
        env,
      );

      if (!sendMessageResponse.ok) {
        console.error('Failed to send DM:', await sendMessageResponse.text());
        throw new Error('Failed to send DM');
      }
    } catch (error) {
      console.error('Error sending Discord notification:', error);
      // Don't fail the submission if Discord notification fails
    }

    return createResponse(
      {
        success: true,
        message: 'Paysafecard submission received successfully',
        submissionId: submissionId,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error submitting paysafe card:', error);
    return createResponse({ error: 'Failed to submit paysafe card' }, 500, origin);
  }
}

/**
 * GET /paysafe
 * Get all paysafe card submissions for the authenticated user's linked Discord ID
 */
export async function handleGetPaysafe(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate session
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Invalid or expired session' }, 401, origin);
    }

    const steamId = sessionValidation.steamId;
    const playerId = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;

    // Get player data to check for linked Discord ID
    const playerDataResult = await db
      .select({
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(eq(playerdata.id, playerId))
      .get();

    if (!playerDataResult || !playerDataResult.discordId) {
      return createResponse(
        { error: 'Discord account not linked. Please link your Discord account first.' },
        403,
        origin,
      );
    }

    const discordId = playerDataResult.discordId;

    // Fetch submissions for this Discord ID
    const submissions = await db
      .select()
      .from(paysafeCardSubmissions)
      .where(eq(paysafeCardSubmissions.discordId, discordId))
      .orderBy(desc(paysafeCardSubmissions.submittedAt));

    // Map to response format
    const response: PaysafeCardGetResponse = {
      submissions: submissions.map((sub) => {
        const cardCode = sub.cardCode;
        const cardCodeTruncated =
          cardCode.length > 10 ? `${cardCode.substring(0, 4)}...${cardCode.substring(cardCode.length - 4)}` : cardCode;

        return {
          id: sub.id,
          cardCodeTruncated: cardCodeTruncated,
          submittedAt: sub.submittedAt,
          processedAt: sub.processedAt,
          status: sub.status as PaysafeCardSubmissionStatus,
          amount: Number(sub.amount),
        };
      }),
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Error fetching paysafe submissions:', error);
    return createResponse({ error: 'Failed to fetch paysafe submissions' }, 500, origin);
  }
}
