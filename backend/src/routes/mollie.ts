import { createMollieClient, Locale } from '@mollie/api-client';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';
import { validateSession, createResponse, fetchDiscordUserData } from '../utils.js';
import { proxyFetch } from '../proxy.js';

/**
 * Calculate the allowed word limit for the greeting message based on donation amount
 */
function getWordLimit(amount: number): number {
  if (amount < 5) return 0;
  if (amount >= 15) return 50;
  if (amount >= 10) {
    return 10 + Math.floor(((amount - 10) / 5) * 40);
  }
  return 3 + Math.floor(((amount - 5) / 5) * 7);
}

/**
 * POST /mollie/checkout
 * Create a payment on Mollie and return the checkout URL
 */
export async function handleMollieCheckout(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate session
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Ungültige oder abgelaufene Sitzung' }, 401, origin);
    }

    const userId = sessionValidation.steamId;

    // Parse amount from body
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return createResponse({ error: 'Ungültiger Request-Body' }, 400, origin);
    }

    const amount = Number(body.amount);
    if (isNaN(amount) || amount < 5) {
      return createResponse({ error: 'Der Mindestbetrag beträgt 5€' }, 400, origin);
    }

    const greeting = body.greeting && typeof body.greeting === 'string' ? body.greeting.trim() : '';
    if (greeting) {
      const wordCount = greeting
        .split(/\s+/)
        .filter(Boolean)
        .reduce((sum: number, word: string) => sum + Math.ceil(word.length / 10), 0);
      const limit = getWordLimit(amount);
      if (wordCount > limit) {
        return createResponse(
          { error: `Deine Grußbotschaft überschreitet das Limit von ${limit} Wörtern.` },
          400,
          origin,
        );
      }
    }

    // Initialize Mollie client
    const mollieClient = createMollieClient({ apiKey: env.MOLLIE_API_KEY });

    // Format amount to string with 2 decimal places as required by Mollie
    const amountString = amount.toFixed(2);

    // Create payment in Mollie
    const payment = await mollieClient.payments.create({
      amount: {
        currency: 'EUR',
        value: amountString,
      },
      description: 'Support / Spende für Zeitvertreib',
      redirectUrl: `${env.FRONTEND_URL}/support?status=returned`,
      cancelUrl: `${env.FRONTEND_URL}/support?status=cancelled`,
      locale: Locale.de_DE,
      // Mollie webhooks must be publicly accessible.
      webhookUrl: `${env.BACKEND_URL}/mollie/webhook`,
      metadata: {
        userId: userId,
        greeting: greeting,
      },
    });

    const checkoutUrl = payment.getCheckoutUrl();
    if (!checkoutUrl) {
      return createResponse({ error: 'Checkout-URL konnte nicht generiert werden' }, 500, origin);
    }

    return createResponse({ success: true, checkoutUrl }, 200, origin);
  } catch (error: any) {
    console.error('Error in handleMollieCheckout:', error);
    return createResponse({ error: error.message || 'Fehler beim Erstellen der Zahlung' }, 500, origin);
  }
}

/**
 * POST /mollie/webhook
 * Handle webhook callback from Mollie
 */
export async function handleMollieWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    let paymentId: string | null = null;

    // Mollie webhook payload is sent as form-encoded (id=tr_xxx) or potentially JSON (e.g. { id: "tr_xxx" })
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as any;
      paymentId = body.id || null;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      paymentId = params.get('id');
    }

    if (!paymentId || !paymentId.startsWith('tr_')) {
      console.error('Mollie Webhook: Invalid or missing payment ID');
      return createResponse({ error: 'Missing or invalid payment ID' }, 400, origin);
    }

    console.log(`📦 Received Mollie webhook for payment ID: ${paymentId}`);

    // Initialize Mollie client and fetch payment details
    const mollieClient = createMollieClient({ apiKey: env.MOLLIE_API_KEY });
    const payment = await mollieClient.payments.get(paymentId);

    if (payment.status !== 'paid') {
      console.log(`Mollie Webhook: Payment ${paymentId} has status ${payment.status}, ignoring`);
      return createResponse({ success: true, message: `Status is ${payment.status}` }, 200, origin);
    }

    // Extract user ID from metadata
    const userId = (payment.metadata as any)?.userId;
    if (!userId) {
      console.error(`Mollie Webhook: Payment ${paymentId} is paid, but contains no userId in metadata`);
      return createResponse({ success: true, message: 'No userId in metadata' }, 200, origin);
    }

    // Fetch player data to mention user and potentially get their username
    const db = drizzle(env.ZEITVERTREIB_DATA);
    const player = await db.select().from(playerdata).where(eq(playerdata.id, userId)).get();

    let username = player?.username || 'Unbekannter Spieler';
    const discordId = player?.discordId;

    const amountValue = (payment.amount?.value || '0.00').replaceAll('.', ','); // Ensure comma as decimal separator for display, as common in German locale
    const amountCurrency = payment.amount?.currency || 'EUR';

    console.log(`❤️ Processing donation from ${username} (${userId}) of ${amountValue} ${amountCurrency}`);

    // Post message to donations channel
    const donationsChannelId = '888946307346100247';
    const botToken = env.DISCORD_TOKEN;

    const greeting = (payment.metadata as any)?.greeting;

    // Fetch Discord avatar if available
    let avatarUrl: string | undefined;
    if (discordId) {
      try {
        const discordUser = await fetchDiscordUserData(discordId, env, ctx);
        if (discordUser) {
          avatarUrl = discordUser.avatarUrl;
          username = discordUser.displayName || username; // Use Discord display name if available
        }
      } catch (e) {
        console.error('Failed to fetch Discord user avatar:', e);
      }
    }

    let description = '';
    if (greeting) {
      description += `# _"${greeting}"_`;
    } else {
      description += `## ${username} spendet großzügige **${amountValue}€ 💖**`;
    }

    let embed: any = {
      description,
      color: 0xffc0cb, // Warm coral/salmon color
      timestamp: new Date().toISOString(),
    };
    if (greeting) {
      embed.footer = {
        text: `${username} spendet großzügige ${amountValue}€ 💖`,
      };
      if (avatarUrl) {
        embed.thumbnail = { url: avatarUrl };
      }
    }

    // Determine ping: >= 15€ is @everyone, otherwise @here
    const parsedAmount = parseFloat(payment.amount?.value || '0.00');
    const ping = parsedAmount >= 15.0 ? '@everyone' : '@here';
    //const ping = '@nobody'; //TESTING
    const payload: any = {
      content: ping,
      embeds: [embed],
      allowedMentions: { parse: ['everyone', 'users'] },
    };

    const discordResponse = await proxyFetch(
      `https://discord.com/api/v10/channels/${donationsChannelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    if (!discordResponse.ok) {
      console.error(`Failed to send Discord message: ${discordResponse.status} ${discordResponse.statusText}`);
      const responseText = await discordResponse.text();
      console.error('Response:', responseText);
    } else {
      console.log('Mollie donation Discord notification sent successfully');
    }

    return createResponse({ success: true }, 200, origin);
  } catch (error: any) {
    console.error('Error in handleMollieWebhook:', error);
    return createResponse({ error: error.message || 'Internal server error' }, 500, origin);
  }
}
