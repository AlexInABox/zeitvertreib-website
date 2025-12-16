import { createResponse } from '../utils.js';
import { proxyFetch } from '../proxy.js';

// Ko-fi webhook data types
interface KofiShopItem {
  direct_link_code: string;
}

interface KofiShipping {
  full_name: string;
  street_address: string;
  city: string;
  state_or_province: string;
  postal_code: string;
  country: string;
  country_code: string;
  telephone: string;
}

interface KofiWebhookData {
  verification_token: string;
  message_id: string;
  timestamp: string;
  type: 'Donation' | 'Subscription' | 'Commission' | 'Shop Order';
  is_public: boolean;
  from_name: string;
  message: string | null;
  amount: string;
  url: string;
  email: string;
  currency: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  shop_items: KofiShopItem[] | null;
  tier_name: string | null;
  shipping: KofiShipping | null;
  discord_username: string;
  discord_userid: string;
}

/**
 * Get embed color based on donation type
 */
function getEmbedColor(data: KofiWebhookData): number {
  if (data.type === 'Subscription') {
    if (data.is_first_subscription_payment) {
      return 0xff00ff; // Magenta for first subscription
    }
    return 0x9b59b6; // Purple for recurring subscription
  }
  if (data.type === 'Commission') {
    return 0xe67e22; // Orange for commission
  }
  if (data.type === 'Shop Order') {
    return 0x3498db; // Blue for shop order
  }
  return 0xff5e5b; // Warm coral/salmon for regular donation ☕
}

/**
 * Get title emoji and text based on donation type
 */
function getTitle(data: KofiWebhookData): string {
  if (data.type === 'Subscription') {
    if (data.is_first_subscription_payment) {
      return '🎉 Neuer Supporter!';
    }
    return '💜 Abo-Zahlung';
  }
  if (data.type === 'Commission') {
    return '🎨 Neue Commission';
  }
  if (data.type === 'Shop Order') {
    return '🛒 Shop Bestellung';
  }
  return '☕ Neue Spende!';
}

/**
 * Build Discord embed for Ko-fi notification
 */
function buildDiscordEmbed(data: KofiWebhookData): object {
  const fields: { name: string; value: string; inline: boolean }[] = [];

  // Supporter name (respect is_public)
  const displayName = data.is_public ? data.from_name : 'Anonymer Supporter';
  fields.push({
    name: 'Von',
    value: displayName,
    inline: true,
  });

  // Amount
  fields.push({
    name: 'Betrag',
    value: `${data.amount} ${data.currency}`,
    inline: true,
  });

  // Type info
  let typeInfo: string = data.type;
  if (data.type === 'Subscription' && data.tier_name) {
    typeInfo = `${data.type} (${data.tier_name})`;
  }
  fields.push({
    name: 'Typ',
    value: typeInfo,
    inline: true,
  });

  // Discord user if available and public
  if (data.is_public && data.discord_userid) {
    fields.push({
      name: 'Discord',
      value: `<@${data.discord_userid}>`,
      inline: true,
    });
  }

  // Message if provided and public
  if (data.is_public && data.message) {
    fields.push({
      name: 'Nachricht',
      value: data.message,
      inline: false,
    });
  }

  const embed = {
    title: getTitle(data),
    color: getEmbedColor(data),
    fields,
    timestamp: data.timestamp,
    footer: {
      text: 'Ko-fi',
      icon_url: 'https://storage.ko-fi.com/cdn/nav-logo-stroke.png',
    },
  };

  return embed;
}

/**
 * Send Ko-fi notification to Discord webhook
 */
async function sendToDiscord(data: KofiWebhookData, env: Env): Promise<void> {
  try {
    const embed = buildDiscordEmbed(data);

    const payload = {
      embeds: [embed],
    };

    await proxyFetch(
      env['KO-FI_DISCORD_WEBHOOK'],
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    console.log(`✅ Sent Ko-fi ${data.type} notification to Discord (message_id: ${data.message_id})`);
  } catch (error) {
    console.error('Error sending Ko-fi notification to Discord webhook:', error);
    throw error;
  }
}

/**
 * POST /kofi/webhook
 * Handle Ko-fi webhook notifications for donations, subscriptions, etc.
 */
export async function handleKofiWebhook(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Ko-fi sends data as application/x-www-form-urlencoded with a 'data' field containing JSON
    const formData = await request.formData();
    const dataField = formData.get('data');

    if (!dataField || typeof dataField !== 'string') {
      console.error('Ko-fi webhook: Missing or invalid data field');
      return createResponse({ error: 'Missing data field' }, 400, origin);
    }

    let webhookData: KofiWebhookData;
    try {
      webhookData = JSON.parse(dataField);
    } catch (parseError) {
      console.error('Ko-fi webhook: Failed to parse JSON data', parseError);
      return createResponse({ error: 'Invalid JSON data' }, 400, origin);
    }

    // Verify the token
    if (webhookData.verification_token !== env['KO-FI_VERIFICATION_TOKEN']) {
      console.error('Ko-fi webhook: Invalid verification token');
      return createResponse({ error: 'Invalid verification token' }, 401, origin);
    }

    console.log(
      `📦 Received Ko-fi ${webhookData.type} from ${webhookData.from_name} (${webhookData.amount} ${webhookData.currency})`,
    );

    // Send notification to Discord
    await sendToDiscord(webhookData, env);

    // Return 200 to acknowledge receipt
    return createResponse({ success: true, message_id: webhookData.message_id }, 200, origin);
  } catch (error) {
    console.error('Ko-fi webhook error:', error);
    // Still return 200 to prevent Ko-fi from retrying if we've already processed
    // In case of actual errors, we log them for debugging
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
}
