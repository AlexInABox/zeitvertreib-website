import { createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';
import type { SwappedRequest, SwappedResponse } from '@zeitvertreib/types';

/**
 * Validates the API key from the Authorization header
 */
function validateApiKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);
  return token === env.SWAPPED_API_KEY;
}

/**
 * POST /swapped/
 * Handles role swap requests from the plugin
 * Requires valid API key authentication
 * Body: { userid: string, price: number }
 */
export async function handleSwapped(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate API key
  if (!validateApiKey(request, env)) {
    return createResponse({ error: 'Unauthorized: Invalid or missing API key' }, 401, origin);
  }

  try {
    // Parse request body
    const body = await request.json() as SwappedRequest;
    const userid = body.userid;
    const price = body.price;

    // Validate required parameters
    if (!userid) {
      return createResponse({ error: 'Bad Request: Missing userid field' }, 400, origin);
    }

    if (price === undefined || price === null) {
      return createResponse({ error: 'Bad Request: Missing price field' }, 400, origin);
    }

    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      return createResponse({ error: 'Bad Request: Invalid price value' }, 400, origin);
    }

    // Query the player's current experience (ZVC)
    const player = await db.select().from(playerdata).where(eq(playerdata.id, userid)).limit(1);

    if (player.length === 0 || !player[0]) {
      return createResponse({ error: 'Bad Request: Player not found' }, 400, origin);
    }

    const currentExp = player[0].experience || 0;

    // Check if player has enough ZVC
    if (currentExp < price) {
      return createResponse(
        {
          error: 'Bad Request: Insufficient ZVC balance',
          current: currentExp,
          required: price,
        },
        400,
        origin,
      );
    }

    // Subtract the price from player's experience
    const newExp = currentExp - price;
    await db.update(playerdata).set({ experience: newExp }).where(eq(playerdata.id, userid));

    // Return success response
    const response: SwappedResponse = {
      success: true,
    };
    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Error in handleSwapped:', error);
    return createResponse({ error: 'Internal Server Error' }, 500, origin);
  }
}
