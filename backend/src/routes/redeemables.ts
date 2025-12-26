import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';

export interface Redeemable {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  redeemableuntil?: string; // ISO date string, optional for limited time items
  isExpired?: boolean; // Indicates if the item is no longer available
  availabilityStatus?: 'available' | 'expired' | 'sold_out';
}

// Predefined redeemables list - in production this could come from database
const ZEITVERTREIB_REDEEMABLES: Redeemable[] = [
  {
    id: 'fakerank_14d',
    name: 'Fakerank (14 Tage)',
    description: 'Zugang zum Fakerank-System für zwei Wochen. Danach verfällt der Rang.',
    emoji: '✨',
    price: 300,
    availabilityStatus: 'expired',
  },
  {
    id: 'custom_spray_2x',
    name: '2x Custom Sprays',
    description: 'Erlaubt dir das Hochladen von 2 weiteren Custom-Sprays!',
    emoji: '🎨',
    price: 200,
    availabilityStatus: 'sold_out',
  },
  {
    id: 'vip_status_30d',
    name: 'VIP Status (30 Tage)',
    description: 'VIP für einen Monat: unbegrenzte Sprays & Fakerank-Zugang.',
    emoji: '👑',
    price: 2000,
    availabilityStatus: 'sold_out',
  },
  {
    id: 'cosmetic_access_30d',
    name: 'Kosmetik-System Zugriff (30 Tage)',
    description: 'Schalte das Kosmetik-System für 1 Monat frei.',
    emoji: '🎩',
    price: 800,
    availabilityStatus: 'sold_out',
  },
  {
    id: 'steam_giftcard_5',
    name: '5€ Steam',
    description: 'Erhalte einen 5€ Steam-Geschenkgutschein.',
    emoji: '🎁',
    price: 3000,
    availabilityStatus: 'sold_out',
  },
  {
    id: 'discord_nitro',
    name: 'Discord Nitro',
    description: 'Erhalte ein Discord Nitro Geschenk (1 Monat).',
    emoji: '💎',
    price: 4000,
    availabilityStatus: 'sold_out',
  },
];

/**
 * GET /redeemables
 * Returns all available zeitvertreib coin redeemables
 */
export async function handleGetRedeemables(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session (any valid Steam user can read)
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  try {
    // Mark expired limited-time items but keep them in the list
    const currentDate = new Date().toISOString();
    const processedRedeemables = ZEITVERTREIB_REDEEMABLES.map((item) => {
      const isExpired = item.redeemableuntil && item.redeemableuntil < currentDate;

      // Use manually set availabilityStatus if it exists, otherwise calculate based on expiration
      const availabilityStatus = item.availabilityStatus || (isExpired ? ('expired' as const) : ('available' as const));

      return {
        ...item,
        isExpired: isExpired || false,
        availabilityStatus: availabilityStatus,
      };
    });

    return createResponse(
      {
        redeemables: processedRedeemables,
        total: processedRedeemables.length,
        available: processedRedeemables.filter((item) => !item.isExpired).length,
        expired: processedRedeemables.filter((item) => item.isExpired).length,
        timestamp: currentDate,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting redeemables:', error);
    return createResponse({ error: 'Failed to fetch redeemables' }, 500, origin);
  }
}

/**
 * POST /redeemables/redeem
 * Redeems a zeitvertreib coin item for the authenticated user
 */
export async function handleRedeemItem(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  try {
    const requestBody: any = await request.json();
    const itemId = requestBody?.itemId;

    if (!itemId || typeof itemId !== 'string') {
      return createResponse({ error: 'Item ID is required' }, 400, origin);
    }

    // Find the redeemable item
    const redeemable = ZEITVERTREIB_REDEEMABLES.find((item) => item.id === itemId);
    if (!redeemable) {
      return createResponse({ error: 'Redeemable item not found' }, 404, origin);
    }

    // Check if item is still available (for limited time items)
    if (redeemable.redeemableuntil) {
      const currentDate = new Date().toISOString();
      if (redeemable.redeemableuntil < currentDate) {
        return createResponse(
          {
            error: 'This item has expired and is no longer available for redemption',
          },
          410, // Gone
          origin,
        );
      }
    }

    const playerId = validation.steamId!.endsWith('@steam') ? validation.steamId! : `${validation.steamId}@steam`;

    // Get current player data to check ZV Coins balance
    const playerData = await db
      .select({ experience: playerdata.experience })
      .from(playerdata)
      .where(eq(playerdata.id, playerId))
      .get();

    if (!playerData) {
      return createResponse({ error: 'Player data not found' }, 404, origin);
    }

    // Check if player has enough ZV Coins
    const currentBalance = playerData.experience || 0;
    if (currentBalance < redeemable.price) {
      return createResponse(
        {
          error: 'Insufficient ZV Coins',
          required: redeemable.price,
          current: currentBalance,
          missing: redeemable.price - currentBalance,
        },
        402, // Payment Required
        origin,
      );
    }

    // Deduct ZV Coins from player balance
    const newBalance = currentBalance - redeemable.price;
    const updateResult = await db
      .update(playerdata)
      .set({ experience: newBalance })
      .where(eq(playerdata.id, playerId))
      .returning({ updatedId: playerdata.id });

    if (updateResult.length === 0) {
      return createResponse({ error: 'Failed to process redemption' }, 500, origin);
    }

    // Log the redemption
    console.log(`Player ${playerId} is redeeming ${redeemable.id} for ${redeemable.price} ZV Coins`);

    // Apply the redeemed item effects
    await applyRedeemableEffects(redeemable, playerId, env);

    return createResponse(
      {
        success: true,
        message: `Successfully redeemed ${redeemable.name}`,
        item: redeemable,
        newBalance: newBalance,
        transactionId: `redeem_${Date.now()}_${itemId}`,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error redeeming item:', error);
    return createResponse({ error: 'Failed to redeem item' }, 500, origin);
  }
}

/**
 * Apply the effects of a redeemed item to the player
 */
async function applyRedeemableEffects(redeemable: Redeemable, playerId: string, env: Env): Promise<void> {
  switch (redeemable.id) {
    case 'fakerank_14d':
      // Add 14 days if still active, otherwise reset to 14 days from now
      const now = Math.floor(Date.now() / 1000);
      await env.ZEITVERTREIB_DATA.prepare(
        `
      UPDATE playerdata
      SET fakerank_until = CASE
        WHEN fakerank_until > ? THEN fakerank_until + (14 * 24 * 60 * 60)
        ELSE ? + (14 * 24 * 60 * 60)
      END
      WHERE id = ?
    `,
      )
        .bind(now, now, playerId)
        .run();
      break;

    case 'vip_status_30d':
      // VIP status includes fakerank access for 30 days
      const thirtyDaysTimestamp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
      await env.ZEITVERTREIB_DATA.prepare('UPDATE playerdata SET fakerank_until = ? WHERE id = ?')
        .bind(thirtyDaysTimestamp, playerId)
        .run();
      break;

    case 'custom_spray':
      // Custom spray is typically enabled when fakerank is enabled
      // This could unlock spray upload permissions or extend spray features
      console.log(`Applied custom spray permissions to ${playerId}`);
      break;

    default:
      console.warn(`Unknown redeemable effect for ${redeemable.id}`);
  }
}

/**
 * POST /redeem-code
 * Redeems a promotional code for ZV Coins
 */
export async function handleRedeemCode(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  try {
    const requestBody: any = await request.json();
    const code = requestBody?.code?.toUpperCase()?.trim();

    if (!code || typeof code !== 'string') {
      return createResponse({ error: 'Code ist erforderlich' }, 400, origin);
    }

    // Get code data from database
    const codeData = (await env.ZEITVERTREIB_DATA.prepare(
      'SELECT code, credits, remaining_uses FROM redemption_codes WHERE code = ?',
    )
      .bind(code)
      .first()) as {
      code: string;
      credits: number;
      remaining_uses: number;
    } | null;

    if (!codeData) {
      return createResponse({ error: 'Ungültiger Code' }, 404, origin);
    }

    // Check if code has remaining uses
    if (codeData.remaining_uses <= 0) {
      return createResponse(
        { error: 'Dieser Code wurde bereits vollständig eingelöst' },
        410, // Gone
        origin,
      );
    }

    const playerId = validation.steamId!.endsWith('@steam') ? validation.steamId! : `${validation.steamId}@steam`;

    // Get current player data including redeemed codes
    const playerData = (await env.ZEITVERTREIB_DATA.prepare(
      'SELECT experience, redeemed_codes FROM playerdata WHERE id = ?',
    )
      .bind(playerId)
      .first()) as { experience: number; redeemed_codes: string | null } | null;

    if (!playerData) {
      return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
    }

    // Check if player has already redeemed this code
    const redeemedCodes = playerData.redeemed_codes ? playerData.redeemed_codes.split(',') : [];
    if (redeemedCodes.includes(code)) {
      return createResponse(
        { error: 'Du hast diesen Code bereits eingelöst' },
        409, // Conflict
        origin,
      );
    }

    // Start transaction to ensure data consistency
    const currentBalance = playerData.experience || 0;
    const newBalance = currentBalance + codeData.credits;

    // Add code to player's redeemed codes list
    const updatedRedeemedCodes = redeemedCodes.length > 0 ? `${playerData.redeemed_codes},${code}` : code;

    // Update player balance and redeemed codes
    const updatePlayerResult = await env.ZEITVERTREIB_DATA.prepare(
      'UPDATE playerdata SET experience = ?, redeemed_codes = ? WHERE id = ?',
    )
      .bind(newBalance, updatedRedeemedCodes, playerId)
      .run();

    if (!updatePlayerResult.success) {
      return createResponse({ error: 'Fehler beim Gutschreiben der Credits' }, 500, origin);
    }

    // Decrease remaining uses for the code
    const updateCodeResult = await env.ZEITVERTREIB_DATA.prepare(
      'UPDATE redemption_codes SET remaining_uses = remaining_uses - 1 WHERE code = ?',
    )
      .bind(code)
      .run();

    if (!updateCodeResult.success) {
      // If code update fails, we should ideally rollback the player balance update
      // For now, just log the error but still return success since player got the credits
      console.error(`Failed to update code usage for ${code}, player ${playerId} received credits anyway`);
    }

    // Log the redemption
    console.log(
      `Player ${playerId} redeemed code ${code} for ${codeData.credits} ZV Coins. Remaining uses: ${codeData.remaining_uses - 1}`,
    );

    return createResponse(
      {
        success: true,
        message: `Code eingelöst! +${codeData.credits} ZV Coins erhalten`,
        credits: codeData.credits,
        newBalance: newBalance,
        code: code,
        remainingUses: codeData.remaining_uses - 1,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error redeeming code:', error);
    return createResponse({ error: 'Fehler beim Einlösen des Codes' }, 500, origin);
  }
}
