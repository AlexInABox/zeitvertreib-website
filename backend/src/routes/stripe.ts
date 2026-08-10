import Stripe from 'stripe';
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
 * Helper to initialize Stripe client for Cloudflare Workers
 */
function getStripeClient(apiKey: string): Stripe {
  return new Stripe(apiKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * POST /stripe/checkout
 * Create a Stripe Checkout Session and return the checkout URL
 */
export async function handleStripeCheckout(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    if (!env.STRIPE_SECRET_KEY) {
      console.error('Stripe Checkout Error: STRIPE_SECRET_KEY is not configured.');
      return createResponse({ error: 'Stripe ist serverseitig nicht konfiguriert.' }, 500, origin);
    }

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

    // Initialize Stripe client
    const stripe = getStripeClient(env.STRIPE_SECRET_KEY);

    // Convert amount from EUR to cents for Stripe
    const unitAmountCents = Math.round(amount * 100);

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Support / Spende für Zeitvertreib',
            },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${env.FRONTEND_URL}/support?status=returned&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/support?status=cancelled`,
      locale: 'de',
      metadata: {
        userId: userId,
        greeting: greeting,
      },
    });

    if (!session.url) {
      return createResponse({ error: 'Checkout-URL konnte nicht generiert werden' }, 500, origin);
    }

    return createResponse({ success: true, checkoutUrl: session.url }, 200, origin);
  } catch (error: any) {
    console.error('Error in handleStripeCheckout:', error);
    return createResponse({ error: error.message || 'Fehler beim Erstellen der Zahlung' }, 500, origin);
  }
}

/**
 * POST /stripe/webhook
 * Handle webhook callback from Stripe
 */
export async function handleStripeWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      console.error('Stripe Webhook Error: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing');
      return createResponse({ error: 'Stripe webhook configuration missing' }, 500, origin);
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      console.error('Stripe Webhook Error: Missing stripe-signature header');
      return createResponse({ error: 'Missing stripe-signature header' }, 400, origin);
    }

    const rawBody = await request.text();
    const stripe = getStripeClient(env.STRIPE_SECRET_KEY);
    const webCrypto = Stripe.createSubtleCryptoProvider();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
        undefined,
        webCrypto,
      );
    } catch (err: any) {
      console.error(`Stripe Webhook Signature Verification Error: ${err.message}`);
      return createResponse({ error: `Webhook Signature Verification Error: ${err.message}` }, 400, origin);
    }

    console.log(`📦 Received Stripe webhook event: ${event.type} [${event.id}]`);

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== 'paid') {
        console.log(`Stripe Webhook: Session ${session.id} payment_status is ${session.payment_status}, ignoring`);
        return createResponse({ success: true, message: `Payment status is ${session.payment_status}` }, 200, origin);
      }

      // Extract metadata
      const userId = session.metadata?.['userId'];
      if (!userId) {
        console.error(`Stripe Webhook: Session ${session.id} is paid, but contains no userId in metadata`);
        return createResponse({ success: true, message: 'No userId in metadata' }, 200, origin);
      }

      // Fetch player data to mention user and potentially get their username
      const db = drizzle(env.ZEITVERTREIB_DATA);
      const player = await db.select().from(playerdata).where(eq(playerdata.id, userId)).get();

      let username = player?.username || 'Unbekannter Spieler';
      const discordId = player?.discordId;

      const totalCents = session.amount_total ?? 0;
      const amountValue = (totalCents / 100).toFixed(2).replaceAll('.', ','); // German locale decimal format
      const parsedAmount = totalCents / 100;

      console.log(`❤️ Processing Stripe donation from ${username} (${userId}) of ${amountValue} EUR`);

      // Post message to donations channel
      const donationsChannelId = '888946307346100247';
      const botToken = env.DISCORD_TOKEN;

      const greeting = session.metadata?.['greeting'];

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
      const ping = parsedAmount >= 15.0 ? '@everyone' : '@here';
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
        console.log('Stripe donation Discord notification sent successfully');
      }
    }

    return createResponse({ success: true }, 200, origin);
  } catch (error: any) {
    console.error('Error in handleStripeWebhook:', error);
    return createResponse({ error: error.message || 'Internal server error' }, 500, origin);
  }
}
