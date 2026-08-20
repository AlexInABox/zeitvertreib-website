import typia from 'typia';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { birthdayMessages, playerdata } from '../db/schema.js';
import { createResponse, checkApiKey, increment } from '../utils.js';
import type { BirthdayRewardRequest, BirthdayRewardResponse } from '@zeitvertreib/types';

const BIRTHDAY_REWARD_AMOUNT = 250;

/**
 * POST /birthday/reward
 * Called by the Overwatch bot when a user replies to a birthday message.
 * Awards ZVC to the replying user (once per birthday message per user).
 */
export async function handleBirthdayReward(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  if (!checkApiKey(request, env.OVERWATCH_API_KEY)) {
    return createResponse({ error: 'Unauthorized' }, 401, origin);
  }

  try {
    const body = await request.json();
    if (!typia.is<BirthdayRewardRequest>(body)) {
      return createResponse({ error: 'Invalid payload' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // The replied-to message must be a known birthday message
    const birthdayMessage = await db
      .select()
      .from(birthdayMessages)
      .where(eq(birthdayMessages.messageId, body.messageId))
      .get();

    if (!birthdayMessage) {
      const response: BirthdayRewardResponse = { status: 'not_found' };
      return createResponse(response, 200, origin);
    }

    // Dedupe: no birthday wish can be awarded twice for a user (per birthday message)
    const dedupeKey = `birthday-reward:${body.messageId}:${body.discordId}`;
    const alreadyAwarded = await env.SCRATCH.get(dedupeKey);
    if (alreadyAwarded !== null) {
      const response: BirthdayRewardResponse = { status: 'already_awarded' };
      return createResponse(response, 200, origin);
    }

    // Award ZVC to the replying user
    const updated = await db
      .update(playerdata)
      .set({ experience: increment(playerdata.experience, BIRTHDAY_REWARD_AMOUNT) })
      .where(eq(playerdata.discordId, body.discordId))
      .returning({ experience: playerdata.experience });

    if (updated.length === 0 || !updated[0]) {
      const response: BirthdayRewardResponse = { status: 'no_account' };
      return createResponse(response, 200, origin);
    }

    // Remember the award so the user cannot be awarded twice
    await env.SCRATCH.put(dedupeKey, String(Date.now()));

    const response: BirthdayRewardResponse = {
      status: 'awarded',
      amount: BIRTHDAY_REWARD_AMOUNT,
      newBalance: updated[0].experience ?? BIRTHDAY_REWARD_AMOUNT,
    };
    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('[Birthday Reward] Error processing reward:', error);
    return createResponse(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      500,
      origin,
    );
  }
}
