import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata, redemptionCodes } from '../db/schema.js';
import { validateSession, createResponse } from '../utils.js';

/**
 * POST /redeem-code
 * Redeems a promotional code for ZV Coins
 */
export async function handleRedeemCode(request: Request, env: Env): Promise<Response> {
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

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Get code data from database
    const codeData = await db
      .select()
      .from(redemptionCodes)
      .where(eq(redemptionCodes.code, code))
      .get();

    if (!codeData) {
      return createResponse({ error: 'Ungültiger Code' }, 404, origin);
    }

    // Check if code has remaining uses
    if (codeData.remainingUses <= 0) {
      return createResponse(
        { error: 'Dieser Code wurde bereits vollständig eingelöst' },
        410, // Gone
        origin,
      );
    }

    const playerId = validation.steamId!.endsWith('@steam') ? validation.steamId! : `${validation.steamId}@steam`;

    // Get current player data including redeemed codes
    const playerDataResult = await db
      .select()
      .from(playerdata)
      .where(eq(playerdata.id, playerId))
      .get();

    if (!playerDataResult) {
      return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
    }

    // Check if player has already redeemed this code
    const redeemedCodes = playerDataResult.redeemedCodes
      ? playerDataResult.redeemedCodes.split(',')
      : [];
    if (redeemedCodes.includes(code)) {
      return createResponse(
        { error: 'Du hast diesen Code bereits eingelöst' },
        409, // Conflict
        origin,
      );
    }

    // Calculate new balance
    const currentBalance = playerDataResult.experience || 0;
    const newBalance = currentBalance + codeData.credits;

    // Add code to player's redeemed codes list
    const updatedRedeemedCodes = redeemedCodes.length > 0
      ? `${playerDataResult.redeemedCodes},${code}`
      : code;

    // Update player balance and redeemed codes
    await db
      .update(playerdata)
      .set({
        experience: newBalance,
        redeemedCodes: updatedRedeemedCodes,
      })
      .where(eq(playerdata.id, playerId));

    // Decrease remaining uses for the code
    await db
      .update(redemptionCodes)
      .set({
        remainingUses: codeData.remainingUses - 1,
      })
      .where(eq(redemptionCodes.code, code));

    // Log the redemption
    console.log(
      `Player ${playerId} redeemed code ${code} for ${codeData.credits} ZV Coins. Remaining uses: ${codeData.remainingUses - 1}`,
    );

    return createResponse(
      {
        success: true,
        message: `Code eingelöst! +${codeData.credits} ZV Coins erhalten`,
        credits: codeData.credits,
        newBalance: newBalance,
        code: code,
        remainingUses: codeData.remainingUses - 1,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error redeeming code:', error);
    return createResponse({ error: 'Fehler beim Einlösen des Codes' }, 500, origin);
  }
}
