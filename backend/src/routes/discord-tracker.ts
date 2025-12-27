import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { discordInfo } from '../db/schema.js';
import { createResponse, checkApiKey } from '../utils.js';
import type { TrackedMember, MemberUpdatePayload, MemberDeletePayload } from '@zeitvertreib/types/discord-tracker';

/**
 * POST /discord-tracker
 * Receives a single member update from the Overwatch bot and upserts to discord_info table.
 */
export async function handleDiscordTrackerUpdate(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate API key
  if (!checkApiKey(request, env.OVERWATCH_API_KEY)) {
    return createResponse({ error: 'Unauthorized' }, 401, origin);
  }

  try {
    const payload: MemberUpdatePayload = await request.json();
    const { member } = payload;

    if (!member || !member.id) {
      return createResponse({ error: 'Invalid payload: missing member data' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Convert timestamps: null means no role, use 0 as default in DB
    // Non-null values are timestamps in milliseconds
    const boosterSince = member.roles.boosterSince ?? 0;
    const donatorSince = member.roles.donatorSince ?? 0;
    const vipSince = member.roles.vipSince ?? 0;
    const teamSince = member.roles.teamSince ?? 0;

    // Upsert the member data
    await db
      .insert(discordInfo)
      .values({
        discordId: member.id,
        username: member.username,
        displayName: member.displayName,
        boosterSince,
        donatorSince,
        vipSince,
        teamSince,
      })
      .onConflictDoUpdate({
        target: discordInfo.discordId,
        set: {
          username: member.username,
          displayName: member.displayName,
          boosterSince,
          donatorSince,
          vipSince,
          teamSince,
        },
      });

    return createResponse({ success: true, memberId: member.id }, 200, origin);
  } catch (error) {
    console.error('[Discord Tracker] Error processing update:', error);
    return createResponse(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      500,
      origin,
    );
  }
}

/**
 * DELETE /discord-tracker
 * Removes a member from the discord_info table when they leave the server.
 */
export async function handleDiscordTrackerDelete(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate API key
  if (!checkApiKey(request, env.OVERWATCH_API_KEY)) {
    return createResponse({ error: 'Unauthorized' }, 401, origin);
  }

  try {
    const payload: MemberDeletePayload = await request.json();
    const { memberId } = payload;

    if (!memberId) {
      return createResponse({ error: 'Invalid payload: missing memberId' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    await db.delete(discordInfo).where(eq(discordInfo.discordId, memberId));

    return createResponse({ success: true, memberId }, 200, origin);
  } catch (error) {
    console.error('[Discord Tracker] Error processing delete:', error);
    return createResponse(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      500,
      origin,
    );
  }
}
