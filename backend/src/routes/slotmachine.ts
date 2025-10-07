import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';

/**
 * POST /slotmachine
 * Play the slot machine game - costs 10 ZVC, chance to win 100 ZVC
 */
export async function handleSlotMachine(
    request: Request,
    _db: ReturnType<typeof drizzle>,
    env: Env,
): Promise<Response> {
    const origin = request.headers.get('Origin');

    // Validate session
    const validation = await validateSession(request, env);
    if (!validation.isValid) {
        return createResponse({ error: validation.error }, 401, origin);
    }

    const playerId = `${validation.session!.steamId}@steam`;
    const SLOT_COST = 10;
    const SLOT_WIN = 100;
    const SLOT_EMOJIS = ['🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑'];

    try {
        // Get current balance
        const balanceResult = (await env['zeitvertreib-data']
            .prepare('SELECT experience FROM playerdata WHERE id = ?')
            .bind(playerId)
            .first()) as { experience: number } | null;

        const currentBalance = balanceResult?.experience || 0;

        // Check if player has enough ZVC (using experience as ZVC)
        if (currentBalance < SLOT_COST) {
            return createResponse(
                {
                    error: 'Nicht genügend ZVC',
                    required: SLOT_COST,
                    current: currentBalance,
                },
                400,
                origin,
            );
        }

        // Generate three random emojis
        const slot1 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];
        const slot2 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];
        const slot3 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)];

        const isWin = slot1 === slot2 && slot2 === slot3;
        const netChange = isWin ? SLOT_WIN - SLOT_COST : -SLOT_COST;
        const newBalance = currentBalance + netChange;

        // Update player balance (using experience field as ZVC)
        await env['zeitvertreib-data']
            .prepare('UPDATE playerdata SET experience = ? WHERE id = ?')
            .bind(newBalance, playerId)
            .run();

        console.log(
            `🎰 Slot machine: ${validation.session!.steamId} ${isWin ? 'WON' : 'lost'} with ${slot1}${slot2}${slot3}. Balance: ${currentBalance} → ${newBalance}`,
        );

        return createResponse(
            {
                result: [slot1, slot2, slot3],
                emojis: SLOT_EMOJIS,
            },
            200,
            origin,
        );
    } catch (error) {
        console.error('Error in slot machine:', error);
        return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
    }
}
