import { createResponse, validateSession } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { playerdata, sprays, sprayBans, caseLinks, caseUserLinks, coinSendingRestrictions } from '../db/schema.js';
import { eq, and, or } from 'drizzle-orm';

// List of admin Steam IDs allowed to access profile details
const PROFILE_ADMINS = ['76561198834070725@steam', '76561198354414854@steam'];

/**
 * GET /profile-details?steamId={steamId}
 * Fetch enriched profile data for viewing another user (admin only)
 */
export async function getProfileDetails(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Verify admin
    const session = await validateSession(request, env);
    if (session.status !== 'valid' || !session.steamId || !PROFILE_ADMINS.includes(session.steamId)) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');

    if (!steamId) {
      return createResponse({ error: 'Missing required parameter: steamId' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Fetch player data
    const player = await db
      .select({
        discordId: playerdata.discordId,
        username: playerdata.username,
        firstSeen: playerdata.firstSeen,
        lastSeen: playerdata.lastSeen,
      })
      .from(playerdata)
      .where(eq(playerdata.id, steamId))
      .get();

    if (!player) {
      return createResponse({ error: 'Player not found' }, 404, origin);
    }

    // Fetch sprays
    const playerSprays = await db
      .select({
        id: sprays.id,
        name: sprays.name,
        sha256: sprays.sha256,
        uploadedAt: sprays.uploadedAt,
      })
      .from(sprays)
      .where(eq(sprays.userid, steamId))
      .all();

    // Check if user is spray-banned
    const sprayBan = await db
      .select({
        reason: sprayBans.reason,
      })
      .from(sprayBans)
      .where(eq(sprayBans.userid, steamId))
      .get();

    // Fetch case links (using caseLinks table for linked cases)
    const cases = await db
      .select({
        caseId: caseLinks.caseId,
        linkedAt: caseLinks.linkedAt,
      })
      .from(caseLinks)
      .where(eq(caseLinks.steamId, steamId))
      .all();

    // Fetch coin sending restriction
    const coinRestriction = await db
      .select({
        restrictedUntil: coinSendingRestrictions.restrictedUntil,
        reason: coinSendingRestrictions.reason,
      })
      .from(coinSendingRestrictions)
      .where(eq(coinSendingRestrictions.steamId, steamId))
      .get();

    // Format response
    const response = {
      steamId,
      discordId: player.discordId,
      username: player.username,
      firstSeen: player.firstSeen,
      lastSeen: player.lastSeen,
      sprays: playerSprays,
      sprayBanned: !!sprayBan,
      sprayBanReason: sprayBan?.reason,
      cases: cases.map((c: { caseId: number; linkedAt: string }) => ({
        caseId: c.caseId,
        createdAt: c.linkedAt,
      })),
      coinRestriction: coinRestriction
        ? {
            restrictedUntil: coinRestriction.restrictedUntil,
            reason: coinRestriction.reason,
            isPermanent: coinRestriction.restrictedUntil === 0,
          }
        : null,
      // Placeholder for cedmod API
      moderation: {
        warns: [],
        bans: [],
        mutes: [],
        source: 'cedmod-api-not-implemented',
      },
    };

    return createResponse(response, 200, origin);
  } catch (err) {
    console.error('Error fetching profile details:', err);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

/**
 * DELETE /profile-details/spray?steamId={steamId}&sprayId={sprayId}
 * Delete a user's spray (team member only)
 */
export async function deleteUserSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const session = await validateSession(request, env);
    if (session.status !== 'valid' || !session.steamId || !PROFILE_ADMINS.includes(session.steamId)) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const sprayId = url.searchParams.get('sprayId');

    if (!steamId || !sprayId) {
      return createResponse({ error: 'Missing required parameters' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Delete the spray (D1 doesn't return affected rows, so we just attempt the delete)
    await db.delete(sprays).where(and(eq(sprays.id, Number(sprayId)), eq(sprays.userid, steamId)));

    return createResponse({ success: true, message: 'Spray deleted' }, 200, origin);
  } catch (err) {
    console.error('Error deleting spray:', err);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

/**
 * PATCH /profile-details/spray
 * Update spray metadata (name) — admin only
 */
export async function updateUserSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const session = await validateSession(request, env);
    if (session.status !== 'valid' || !session.steamId || !PROFILE_ADMINS.includes(session.steamId)) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    const body: { steamId: string; sprayId: number; name: string } = await request.json();
    if (!body?.steamId || !body?.sprayId || typeof body?.name !== 'string') {
      return createResponse({ error: 'Missing required parameters' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Verify spray exists and belongs to the target user (just check existence)
    const spray = await db
      .select({ id: sprays.id })
      .from(sprays)
      .where(and(eq(sprays.id, body.sprayId), eq(sprays.userid, body.steamId)))
      .get();

    if (!spray) {
      return createResponse({ error: 'Spray not found' }, 404, origin);
    }

    // Update name
    await db.update(sprays).set({ name: body.name }).where(eq(sprays.id, body.sprayId));

    return createResponse({ success: true, sprayId: body.sprayId, name: body.name }, 200, origin);
  } catch (err) {
    console.error('Error updating spray:', err);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

/**
 * POST /profile-details/coin-restriction
 * Set or update coin sending restriction
 */
export async function setCoinRestriction(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const session = await validateSession(request, env);
    if (session.status !== 'valid' || !session.steamId || !PROFILE_ADMINS.includes(session.steamId)) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    const body: {
      steamId: string;
      restrictedUntil: number;
      reason: string;
    } = await request.json();

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Get the user's Discord ID for the audit trail
    const player = await db
      .select({ discordId: playerdata.discordId })
      .from(playerdata)
      .where(eq(playerdata.id, body.steamId))
      .get();

    // Delete existing restriction if any
    await db.delete(coinSendingRestrictions).where(eq(coinSendingRestrictions.steamId, body.steamId));

    // Create new restriction
    if (body.restrictedUntil > 0 || body.restrictedUntil === 0) {
      await db.insert(coinSendingRestrictions).values({
        steamId: body.steamId,
        restrictedUntil: body.restrictedUntil,
        reason: body.reason,
        restrictedByDiscordId: player?.discordId || 'unknown',
        restrictedAt: Date.now(),
      });
    }

    return createResponse({ success: true, message: 'Coin restriction updated' }, 200, origin);
  } catch (err) {
    console.error('Error setting coin restriction:', err);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}

/**
 * POST /profile-details/case-link
 * Link a case to a user
 */
export async function linkCase(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const session = await validateSession(request, env);
    if (session.status !== 'valid' || !session.steamId || !PROFILE_ADMINS.includes(session.steamId)) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    const body: {
      caseId: string;
      steamId?: string;
      discordId?: string;
    } = await request.json();

    if (!body.caseId) {
      return createResponse({ error: 'Missing required parameter: caseId' }, 400, origin);
    }

    if (!body.steamId && !body.discordId) {
      return createResponse({ error: 'Must provide either steamId or discordId' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Get admin's Discord ID for audit trail
    const adminPlayer = await db
      .select({ discordId: playerdata.discordId })
      .from(playerdata)
      .where(eq(playerdata.id, session.steamId))
      .get();

    if (!adminPlayer || !adminPlayer.discordId) {
      return createResponse({ error: 'Admin account is not linked to a Discord ID' }, 400, origin);
    }

    await db.insert(caseLinks).values({
      caseId: body.caseId,
      steamId: body.steamId,
      discordId: body.discordId,
      createdAt: Date.now(),
      createdByDiscordId: adminPlayer.discordId,
    });

    return createResponse({ success: true, message: 'Case linked' }, 200, origin);
  } catch (err) {
    console.error('Error linking case:', err);
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}
