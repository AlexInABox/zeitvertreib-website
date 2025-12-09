import { drizzle } from 'drizzle-orm/d1';
import { inArray, eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse, validateSession } from '../utils.js';

interface ZvcResponse {
  userId: string;
  zvc: number;
}

export async function handleGetZeitvertreibCoins(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const userIds = new URL(request.url).searchParams.getAll('userId');

  if (userIds.length === 0) {
    return createResponse([], 200, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const steamIdsToQuery: string[] = [];
  const discordIdsToQuery: string[] = [];
  const idMap: { [dbId: string]: string } = {};

  // Parse and categorize user IDs
  for (const id of userIds) {
    const [value, type] = id.split('@');
    if (!value || !type) continue;

    if (type === 'steam') {
      steamIdsToQuery.push(id);
      idMap[id] = id;
    } else if (type === 'discord') {
      discordIdsToQuery.push(value);
      idMap[value] = id;
    }
  }

  // Look up Discord users to get their Steam IDs
  if (discordIdsToQuery.length > 0) {
    const discordUsers = await db
      .select({
        steamid: schema.playerdata.id,
        discordid: schema.playerdata.discordId,
      })
      .from(schema.playerdata)
      .where(inArray(schema.playerdata.discordId, discordIdsToQuery));

    for (const user of discordUsers) {
      const originalId = user.discordid && idMap[user.discordid];
      if (user.steamid && originalId) {
        steamIdsToQuery.push(user.steamid);
        idMap[user.steamid] = originalId;
      }
    }
  }

  if (steamIdsToQuery.length === 0) {
    return createResponse([], 200, origin);
  }

  // Query ZVC for all Steam IDs
  const zvcResult = await db
    .select({
      steamid: schema.playerdata.id,
      zvc: schema.playerdata.experience,
    })
    .from(schema.playerdata)
    .where(inArray(schema.playerdata.id, [...new Set(steamIdsToQuery)]));

  const response: ZvcResponse[] = zvcResult
    .map((row) => ({
      userId: idMap[row.steamid],
      zvc: row.zvc ?? 0,
    }))
    .filter((item) => item.userId) as ZvcResponse[];

  return createResponse(response, 200, origin);
}

/**
 * POST /transfer-zvc
 * Transfer ZV Coins (experience) from one user to another with 10% tax
 */
export async function handleTransferZVC(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session for the sender
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' }, 401, origin);
  }

  try {
    const body = (await request.json()) as {
      recipient?: string;
      amount?: number;
    };
    const { recipient, amount } = body;

    // Validate input
    if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
      return createResponse({ error: 'Empfänger ist erforderlich' }, 400, origin);
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return createResponse({ error: 'Gültiger Betrag ist erforderlich' }, 400, origin);
    }

    if (!Number.isInteger(amount)) {
      return createResponse({ error: 'Betrag muss eine ganze Zahl sein' }, 400, origin);
    }

    // Validate minimum transfer amount
    if (amount < 100) {
      return createResponse({ error: 'Mindestbetrag für Transfers: 100 ZVC' }, 400, origin);
    }

    // Validate maximum transfer amount
    if (amount > 50000) {
      return createResponse({ error: 'Maximaler Transferbetrag: 50.000 ZVC' }, 400, origin);
    }

    const senderSteamId = validation.steamId! + '@steam';
    const cleanRecipient = recipient.trim();

    // Prevent self-transfer
    if (senderSteamId === cleanRecipient) {
      return createResponse({ error: 'Du kannst nicht an dich selbst senden' }, 400, origin);
    }

    // Calculate tax (10%)
    const taxRate = 0.1;
    const taxAmount = Math.floor(amount * taxRate);
    const totalCost = amount + taxAmount; // Total amount to deduct from sender

    // Check if sender has enough ZVC (needs 110% of transfer amount)
    const senderResult = await db
      .select({ experience: schema.playerdata.experience })
      .from(schema.playerdata)
      .where(eq(schema.playerdata.id, senderSteamId));

    if (senderResult.length === 0) {
      return createResponse(
        {
          error: 'Sender ' + senderSteamId + ' nicht in der Datenbank gefunden',
        },
        404,
        origin,
      );
    }

    const senderBalance = senderResult[0]?.experience || 0;
    if (senderBalance < totalCost) {
      return createResponse(
        {
          error: `Nicht genügend ZVC. Benötigt: ${totalCost} ZVC (${amount} + ${taxAmount} Steuer), Verfügbar: ${senderBalance} ZVC`,
        },
        400,
        origin,
      );
    }

    // Determine if input is Steam ID or username
    let recipientData: { id: string; experience: number | null } | null = null;

    // First, try to parse as Steam ID
    let recipientSteamId = cleanRecipient;
    if (recipientSteamId.endsWith('@steam')) {
      recipientSteamId = recipientSteamId.slice(0, -6); // Remove "@steam"
    }

    // Check if it's a valid Steam ID format (17 digits)
    if (/^\d{17}$/.test(recipientSteamId)) {
      // It's a Steam ID - query by id column with @steam suffix
      const result = await db
        .select({ id: schema.playerdata.id, experience: schema.playerdata.experience })
        .from(schema.playerdata)
        .where(eq(schema.playerdata.id, recipientSteamId + '@steam'));
      recipientData = result.length > 0 && result[0] ? result[0] : null;
    } else {
      // It's not a Steam ID - treat as username and query by username column
      const result = await db
        .select({ id: schema.playerdata.id, experience: schema.playerdata.experience })
        .from(schema.playerdata)
        .where(eq(schema.playerdata.username, cleanRecipient));
      recipientData = result.length > 0 && result[0] ? result[0] : null;
    }

    if (!recipientData) {
      return createResponse(
        {
          error: `Empfänger "${cleanRecipient}" nicht in der Datenbank gefunden. Bitte gib eine gültige Steam ID (17 Ziffern) oder einen Benutzernamen ein.`,
        },
        400,
        origin,
      );
    }

    const recipientBalance = recipientData.experience || 0;
    const finalRecipientId = recipientData.id;

    // Perform the transfer in a transaction
    try {
      // Deduct total cost from sender (amount + tax)
      await db
        .update(schema.playerdata)
        .set({ experience: senderBalance - totalCost })
        .where(eq(schema.playerdata.id, senderSteamId));

      // Add only the transfer amount to recipient (not including tax)
      await db
        .update(schema.playerdata)
        .set({ experience: recipientBalance + amount })
        .where(eq(schema.playerdata.id, finalRecipientId));

      // Calculate new balances
      const newSenderBalance = senderBalance - totalCost;
      const newRecipientBalance = recipientBalance + amount;

      return createResponse(
        {
          success: true,
          message: `${amount} ZVC erfolgreich an ${finalRecipientId} gesendet!`,
          transfer: {
            amount,
            tax: taxAmount,
            totalCost,
            recipient: finalRecipientId,
            senderNewBalance: newSenderBalance,
            recipientNewBalance: newRecipientBalance,
          },
        },
        200,
        origin,
      );
    } catch (dbError) {
      console.error('Database error during transfer:', dbError);
      return createResponse({ error: 'Transfer fehlgeschlagen - Datenbankfehler' }, 500, origin);
    }
  } catch (error) {
    console.error('Error in ZVC transfer:', error);
    if (error instanceof SyntaxError) {
      return createResponse({ error: 'Ungültiges JSON' }, 400, origin);
    }
    return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
  }
}
