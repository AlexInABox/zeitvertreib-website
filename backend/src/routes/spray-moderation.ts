import { createResponse } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { EmbedBuilder } from '@discordjs/builders';

// Generate SHA-256 hash of image buffer for caching moderation results
export async function generateImageHash(imageBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', imageBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Discord Webhook Setup Instructions:
 *
 * 1. Create a Discord webhook URL in your channel and add it to SPRAY_MOD_WEBHOOK environment variable
 * 2. Set the BACKEND_URL environment variable to your backend URL (e.g., https://your-worker.workers.dev)
 * 3. The webhook will send accepted sprays with spoiler tags and clickable moderation buttons
 * 4. Moderators can click the "DELETE" or "DELETE & BAN" buttons to make direct HTTP requests to the backend
 * 5. Buttons are formatted as raw JSON components for Discord webhook compatibility
 */

// Send accepted spray to Discord webhook for moderation tracking
export async function sendSprayToDiscord(
  originalImage: File,
  steamId: string,
  env: Env,
  isFromCache: boolean = false,
): Promise<void> {
  try {
    if (!env.SPRAY_MOD_WEBHOOK) {
      console.log('No Discord webhook URL configured, skipping Discord notification');
      return;
    }

    // Generate image hash for the custom_id
    const imageBuffer = await originalImage.arrayBuffer();
    const imageHash = await generateImageHash(imageBuffer);

    // Get Steam user data for nickname from our KV store
    let steamNickname = 'Unknown User';
    try {
      const userCacheKey = `steam_user:${steamId}`;
      const cachedUserData = await env.SESSIONS.get(userCacheKey);
      if (cachedUserData) {
        const userData = JSON.parse(cachedUserData);
        steamNickname = userData?.userData?.personaname || 'Unknown User';
      }
    } catch (error) {
      console.error('Error fetching cached Steam user data:', error);
    }

    // Create form data for Discord webhook
    const formData = new FormData();

    // Create the embed using EmbedBuilder
    const embed = new EmbedBuilder()
      .setTitle('✅ Spray Accepted')
      .setColor(0x00ff00) // Green color
      .addFields(
        {
          name: 'Steam ID',
          value: steamId,
          inline: true,
        },
        {
          name: 'Steam Nickname',
          value: steamNickname,
          inline: true,
        },
        {
          name: 'Moderation Source',
          value: isFromCache ? 'Cached Result' : 'Fresh AI Check',
          inline: true,
        },
        {
          name: 'File Size',
          value: `${(originalImage.size / 1024).toFixed(2)} KB`,
          inline: true,
        },
        {
          name: 'File Type',
          value: originalImage.type,
          inline: true,
        },
        {
          name: 'Image Hash',
          value: `\`${imageHash.substring(0, 16)}...\``,
          inline: true,
        },
        {
          name: 'Timestamp',
          value: new Date().toISOString(),
          inline: false,
        },
      )
      .setTimestamp();

    // Store message ID mapping for later updates
    const messageIdKey = `webhook_message_${steamId}_${imageHash}`;

    // Discord webhooks support link buttons in raw JSON format - include ALL moderation buttons from the start
    const deleteUrl = `${env.BACKEND_URL}/spray/moderate/delete?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const banUrl = `${env.BACKEND_URL}/spray/moderate/ban?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const unbanUrl = `${env.BACKEND_URL}/spray/moderate/unban?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const undeleteUrl = `${env.BACKEND_URL}/spray/moderate/undelete?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;

    // Create components with ALL moderation buttons
    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 5, // Link style
            label: '❌ DELETE',
            url: deleteUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '🔨 DELETE & BAN',
            url: banUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '🔓 UNBAN',
            url: unbanUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '↩️ UNDELETE',
            url: undeleteUrl,
          },
        ],
      },
    ];

    const payload = {
      content: `🎨 New spray accepted and uploaded`,
      embeds: [embed.toJSON()],
      username: 'Spray Moderation System',
      components: components,
    };

    // Add the image file with spoiler tag (SPOILER_ prefix)
    formData.append(
      'file',
      originalImage,
      `SPOILER_spray_${steamId}_${Date.now()}.${originalImage.type.split('/')[1]}`,
    );
    formData.append('payload_json', JSON.stringify(payload));

    // Add with_components=true query parameter to enable components for non-application-owned webhooks
    const webhookUrl = new URL(env.SPRAY_MOD_WEBHOOK);
    webhookUrl.searchParams.set('with_components', 'true');
    webhookUrl.searchParams.set('wait', 'true'); // Get message ID in response

    const response = await proxyFetch(
      webhookUrl.toString(),
      {
        method: 'POST',
        body: formData,
      },
      env,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Failed to send spray to Discord webhook:',
        response.status,
        response.statusText,
        'Response body:',
        errorText,
      );
      console.error('Payload sent:', JSON.stringify(payload, null, 2));
    } else {
      const responseData = (await response.json()) as { id?: string };
      const messageId = responseData.id;

      // Store the message ID for later updates
      if (messageId) {
        await env.SESSIONS.put(messageIdKey, messageId);
      }

      console.log(`Successfully sent accepted spray to Discord for Steam ID: ${steamId}, Message ID: ${messageId}`);
    }
  } catch (error) {
    console.error('Error sending spray to Discord webhook:', error);
  }
}

// Update Discord webhook message to show moderation action taken
export async function updateDiscordWebhookMessage(
  steamId: string,
  imageHash: string,
  action: 'deleted' | 'banned' | 'unbanned' | 'undeleted',
  env: Env,
  messageId?: string | null,
): Promise<void> {
  try {
    if (!env.SPRAY_MOD_WEBHOOK) {
      console.log('No Discord webhook URL configured, skipping message update');
      return;
    }

    // Try to get message ID from storage if not provided
    if (!messageId) {
      const messageIdKey = `webhook_message_${steamId}_${imageHash}`;
      messageId = await env.SESSIONS.get(messageIdKey);
    }

    if (!messageId) {
      console.log('No message ID found, cannot update Discord message');
      return;
    }

    // Get Steam user data for nickname
    let steamNickname = 'Unknown User';
    try {
      const userCacheKey = `steam_user:${steamId}`;
      const cachedUserData = await env.SESSIONS.get(userCacheKey);
      if (cachedUserData) {
        const userData = JSON.parse(cachedUserData);
        steamNickname = userData?.userData?.personaname || 'Unknown User';
      }
    } catch (error) {
      console.error('Error fetching cached Steam user data:', error);
    }

    // Create updated embed based on action
    const embed = new EmbedBuilder().setTimestamp();

    // Always keep ALL buttons regardless of action
    const deleteUrl = `${env.BACKEND_URL}/spray/moderate/delete?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const banUrl = `${env.BACKEND_URL}/spray/moderate/ban?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const unbanUrl = `${env.BACKEND_URL}/spray/moderate/unban?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const undeleteUrl = `${env.BACKEND_URL}/spray/moderate/undelete?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;

    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 5, // Link style
            label: '❌ DELETE',
            url: deleteUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '🔨 DELETE & BAN',
            url: banUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '🔓 UNBAN',
            url: unbanUrl,
          },
          {
            type: 2, // Button
            style: 5, // Link style
            label: '↩️ UNDELETE',
            url: undeleteUrl,
          },
        ],
      },
    ];

    // Set embed content based on action
    let title = '✅ Spray Accepted';
    let color = 0x00ff00; // Green
    let actionField = 'No action taken';

    if (action === 'deleted') {
      title = '🗑️ Spray Deleted';
      color = 0xffa500; // Orange
      actionField = '🗑️ Spray Deleted';
    } else if (action === 'banned') {
      title = '🔨 User Banned & Spray Deleted';
      color = 0xff0000; // Red
      actionField = '🔨 User Banned & Spray Deleted';
    } else if (action === 'unbanned') {
      title = '🔓 User Unbanned';
      color = 0x00ff00; // Green
      actionField = '🔓 User Unbanned';
    } else if (action === 'undeleted') {
      title = '↩️ Spray Undeleted';
      color = 0x00ff00; // Green
      actionField = '↩️ Spray Undeleted';
    }

    embed
      .setTitle(title)
      .setColor(color)
      .addFields(
        {
          name: 'Steam ID',
          value: steamId,
          inline: true,
        },
        {
          name: 'Steam Nickname',
          value: steamNickname,
          inline: true,
        },
        {
          name: 'Action Taken',
          value: actionField,
          inline: true,
        },
        {
          name: 'Image Hash',
          value: `\`${imageHash.substring(0, 16)}...\``,
          inline: true,
        },
        {
          name: 'Action Timestamp',
          value: new Date().toISOString(),
          inline: false,
        },
      );

    const payload = {
      content: `🎨 Spray moderation - ${actionField}`,
      embeds: [embed.toJSON()],
      components: components,
    };

    // Update the message using PATCH
    const webhookUrl = new URL(env.SPRAY_MOD_WEBHOOK);
    const updateUrl = `${webhookUrl.origin}${webhookUrl.pathname}/messages/${messageId}`;

    const response = await proxyFetch(
      updateUrl,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Failed to update Discord webhook message:',
        response.status,
        response.statusText,
        'Response body:',
        errorText,
      );
    } else {
      console.log(`Successfully updated Discord message for Steam ID: ${steamId}, action: ${action}`);
    }
  } catch (error) {
    console.error('Error updating Discord webhook message:', error);
  }
}

// Handle Discord moderation action - delete spray
export async function handleModerationDelete(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse({ error: 'steamId und imageHash sind erforderlich' }, 400, origin);
    }

    // Check if spray exists before deleting
    const sprayKey = `spray_${steamId}`;
    const existingSpray = await env.SESSIONS.get(sprayKey);
    if (!existingSpray) {
      console.log(`No spray found for Steam ID: ${steamId}, skipping delete action`);
      return createResponse({ success: true, message: 'No spray found to delete' }, 200, origin);
    }

    // Delete the spray from KV storage
    await env.SESSIONS.delete(sprayKey);

    // Flag the image hash as blocked in cache
    const cacheKey = `moderation_${imageHash}`;
    const blockedData = {
      isSafe: false,
      cachedAt: Date.now(),
      imageHash,
      blocked: true,
      blockedBy: 'moderator',
      blockedReason: 'Deleted by Discord moderation',
    };
    await env.SESSIONS.put(cacheKey, JSON.stringify(blockedData));

    // Update Discord webhook message to show action taken
    await updateDiscordWebhookMessage(steamId, imageHash, 'deleted', env);

    console.log(`Moderator deleted spray for Steam ID: ${steamId}, hash: ${imageHash}`);

    return createResponse(
      {
        success: true,
        message: 'Spray deleted and flagged as blocked',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling moderation delete:', error);
    return createResponse({ error: 'Failed to process moderation action' }, 500, origin);
  }
}

// Handle Discord moderation action - delete spray and ban user
export async function handleModerationBan(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse({ error: 'steamId und imageHash sind erforderlich' }, 400, origin);
    }

    // Check if user is already banned
    const banKey = `spray_ban_${steamId}`;
    const existingBan = await env.SESSIONS.get(banKey);
    if (existingBan) {
      console.log(`User ${steamId} is already banned, skipping ban action`);
      return createResponse({ success: true, message: 'User is already banned' }, 200, origin);
    }

    // Delete the spray from KV storage (if it exists)
    const sprayKey = `spray_${steamId}`;
    await env.SESSIONS.delete(sprayKey);

    // Flag the image hash as blocked in cache
    const cacheKey = `moderation_${imageHash}`;
    const blockedData = {
      isSafe: false,
      cachedAt: Date.now(),
      imageHash,
      blocked: true,
      blockedBy: 'moderator',
      blockedReason: 'Deleted and banned by Discord moderation',
    };
    await env.SESSIONS.put(cacheKey, JSON.stringify(blockedData));

    // Ban the user from uploading sprays
    const banData = {
      steamId,
      bannedAt: Date.now(),
    };
    await env.SESSIONS.put(banKey, JSON.stringify(banData));

    // Update Discord webhook message to show action taken
    await updateDiscordWebhookMessage(steamId, imageHash, 'banned', env);

    console.log(`Moderator banned Steam ID: ${steamId} and deleted spray with hash: ${imageHash}`);

    return createResponse(
      {
        success: true,
        message: 'Spray deleted, flagged as blocked, and user banned',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling moderation ban:', error);
    return createResponse({ error: 'Failed to process moderation action' }, 500, origin);
  }
}

// Handle Discord moderation action - unban user
export async function handleModerationUnban(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse({ error: 'steamId und imageHash sind erforderlich' }, 400, origin);
    }

    // Check if user is actually banned before unbanning
    const banKey = `spray_ban_${steamId}`;
    const banData = await env.SESSIONS.get(banKey);
    if (!banData) {
      console.log(`User ${steamId} is not banned, skipping unban action`);
      return createResponse({ success: true, message: 'User is not banned' }, 200, origin);
    }

    // Remove the ban from KV storage
    await env.SESSIONS.delete(banKey);

    // Update Discord webhook message to show action taken
    await updateDiscordWebhookMessage(steamId, imageHash, 'unbanned', env);

    console.log(`Moderator unbanned Steam ID: ${steamId}`);

    return createResponse(
      {
        success: true,
        message: 'User unbanned successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling moderation unban:', error);
    return createResponse({ error: 'Failed to process moderation action' }, 500, origin);
  }
}

// Handle Discord moderation action - undelete spray (remove block flag)
export async function handleModerationUndelete(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse({ error: 'steamId und imageHash sind erforderlich' }, 400, origin);
    }

    // Check if image is actually blocked before undeleting
    const cacheKey = `moderation_${imageHash}`;
    const cachedResult = await env.SESSIONS.get(cacheKey);
    if (!cachedResult) {
      console.log(`Image hash ${imageHash} is not blocked, skipping undelete action`);
      return createResponse({ success: true, message: 'Image is not blocked' }, 200, origin);
    }

    const cached = JSON.parse(cachedResult);
    if (!cached.blocked) {
      console.log(`Image hash ${imageHash} is not blocked, skipping undelete action`);
      return createResponse({ success: true, message: 'Image is not blocked' }, 200, origin);
    }

    // Remove the block flag from the image hash cache
    await env.SESSIONS.delete(cacheKey);

    // Update Discord webhook message to show action taken
    await updateDiscordWebhookMessage(steamId, imageHash, 'undeleted', env);

    console.log(`Moderator undeleted/unblocked image hash: ${imageHash}`);

    return createResponse(
      {
        success: true,
        message: 'Image unblocked successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling moderation undelete:', error);
    return createResponse({ error: 'Failed to process moderation action' }, 500, origin);
  }
}
