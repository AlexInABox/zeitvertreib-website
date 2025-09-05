import {
  validateSession,
  createResponse,
  fetchDiscordWithProxy,
} from '../utils.js';
import { EmbedBuilder } from '@discordjs/builders';
import OpenAI from 'openai';

// Upload limits configuration - images only (no GIFs)
const UPLOAD_LIMITS = {
  MAX_ORIGINAL_SIZE: 10 * 1024 * 1024, // 10MB for original images
  MAX_THUMBNAIL_SIZE: 10 * 1024, // 10KB for thumbnails
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

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
async function sendSprayToDiscord(
  originalImage: File,
  steamId: string,
  env: Env,
  isFromCache: boolean = false,
): Promise<void> {
  try {
    if (!env.SPRAY_MOD_WEBHOOK) {
      console.log(
        'No Discord webhook URL configured, skipping Discord notification',
      );
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

    const response = await fetchDiscordWithProxy(
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
      const responseData = await response.json() as { id?: string };
      const messageId = responseData.id;

      // Store the message ID for later updates
      if (messageId) {
        await env.SESSIONS.put(messageIdKey, messageId);
      }

      console.log(
        `Successfully sent accepted spray to Discord for Steam ID: ${steamId}, Message ID: ${messageId}`,
      );
    }
  } catch (error) {
    console.error('Error sending spray to Discord webhook:', error);
  }
}

// Update Discord webhook message to show moderation action taken
async function updateDiscordWebhookMessage(
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
    const embed = new EmbedBuilder()
      .setTimestamp();

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
            label: '� UNBAN',
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

    const response = await fetchDiscordWithProxy(
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
      console.log(
        `Successfully updated Discord message for Steam ID: ${steamId}, action: ${action}`,
      );
    }
  } catch (error) {
    console.error('Error updating Discord webhook message:', error);
  }
}

// Generate SHA-256 hash of image buffer for caching moderation results
async function generateImageHash(imageBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', imageBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

// Convert image buffer to data URL for storage
async function convertImageToDataURL(
  imageBuffer: ArrayBuffer,
): Promise<string> {
  try {
    const uint8Array = new Uint8Array(imageBuffer);

    // Detect image format
    const isJPEG = uint8Array[0] === 0xff && uint8Array[1] === 0xd8;
    const isPNG =
      uint8Array[0] === 0x89 &&
      uint8Array[1] === 0x50 &&
      uint8Array[2] === 0x4e &&
      uint8Array[3] === 0x47;
    const isWebP =
      uint8Array[8] === 0x57 &&
      uint8Array[9] === 0x45 &&
      uint8Array[10] === 0x42 &&
      uint8Array[11] === 0x50;

    // Determine MIME type
    let mimeType = 'image/png'; // Default
    if (isJPEG) mimeType = 'image/jpeg';
    else if (isPNG) mimeType = 'image/png';
    else if (isWebP) mimeType = 'image/webp';

    // Convert to base64
    let binaryString = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }

    const base64 = btoa(binaryString);
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error converting image to data URL:', error);
    return createMinimalValidJPEG();
  }
}

// Create a minimal valid JPEG image as fallback
function createMinimalValidJPEG(): string {
  // This is a minimal 1x1 pixel JPEG image
  const minimalJPEG =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
  return `data:image/jpeg;base64,${minimalJPEG}`;
}

// Check image safety using OpenAI Moderation API with hash-based caching
async function checkImageSafety(
  imageFile: File,
  env: Env,
  steamId: string,
): Promise<boolean> {
  try {
    // Check if user is banned from uploading sprays
    const banKey = `spray_ban_${steamId}`;
    const banData = await env.SESSIONS.get(banKey);
    if (banData) {
      const ban = JSON.parse(banData);
      console.log(
        `Steam ID ${steamId} is banned from uploading sprays`,
      );
      return false;
    }

    // Generate hash of the image for caching
    const imageBuffer = await imageFile.arrayBuffer();
    const imageHash = await generateImageHash(imageBuffer);
    const cacheKey = `moderation_${imageHash}`;

    // Check if we already have a cached result for this image hash
    const cachedResult = await env.SESSIONS.get(cacheKey);
    if (cachedResult !== null) {
      const { isSafe, cachedAt, blocked } = JSON.parse(cachedResult);
      const cacheAge = Date.now() - cachedAt;
      const cacheValidityPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      // If image is blocked by moderator, always reject regardless of cache age
      if (blocked) {
        console.log(`Image hash ${imageHash} is blocked by moderator`);
        return false;
      }

      // Use cached result if it's still valid
      if (cacheAge < cacheValidityPeriod) {
        console.log(
          `Using cached moderation result for image hash ${imageHash}: ${isSafe ? 'safe' : 'unsafe'}`,
        );

        // Send to Discord webhook if image is safe and we have steamId
        if (isSafe) {
          await sendSprayToDiscord(imageFile, steamId, env, true);
        }

        return isSafe;
      }
    }

    // No valid cache found, perform actual moderation check (OpenAI)
    console.log(`Performing new moderation check for image hash ${imageHash}`);

    if (!env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return false; // conservative
    }

    // Convert original image to data URL for OpenAI moderation input
    const dataUrl = await convertImageToDataURL(imageBuffer);

    // Initialize OpenAI client with Workers-compatible fetch
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    let isSafe = true;
    try {
      const moderation = await openai.moderations.create({
        model: 'omni-moderation-latest',
        input: [
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      } as any);

      // Evaluate moderation response
      const results: any[] = (moderation as any)?.results || [];
      if (Array.isArray(results) && results.length > 0) {
        for (const r of results) {
          if (typeof r.flagged === 'boolean' && r.flagged) {
            isSafe = false;
            break;
          }
          // Fallback: if any category is true, consider unsafe
          if (r.categories && typeof r.categories === 'object') {
            for (const val of Object.values(r.categories)) {
              if (val === true) {
                isSafe = false;
                break;
              }
            }
            if (!isSafe) break;
          }
        }
      } else {
        // If response is unexpected, reject conservatively
        console.warn('OpenAI moderation returned no results; rejecting image');
        isSafe = false;
      }
    } catch (e) {
      console.error('OpenAI Moderation API error:', e);
      return false; // conservative, do not cache
    }

    // Cache the moderation result for future use
    const cacheData = {
      isSafe,
      cachedAt: Date.now(),
      imageHash,
    };

    // Store the result in KV cache for 7 days (TTL handled by expiration check above)
    await env.SESSIONS.put(cacheKey, JSON.stringify(cacheData));
    console.log(
      `Cached moderation result for image hash ${imageHash}: ${isSafe ? 'safe' : 'unsafe'}`,
    );

    // Send to Discord webhook if image is safe and we have steamId
    if (isSafe && steamId) {
      await sendSprayToDiscord(imageFile, steamId, env, false);
    }

    return isSafe;
  } catch (error) {
    console.error('Error checking image safety:', error);
    // If there's an error with the safety check, be conservative and reject
    // Don't cache errors to allow retry
    return false;
  }
}

export async function handleUploadSpray(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (!sessionValidation.isValid || !sessionValidation.session) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation.session;

  try {
    // Check if request contains multipart form data
    const contentType = request.headers.get('Content-Type');
    if (!contentType?.includes('multipart/form-data')) {
      return createResponse(
        { error: 'Multipart form data required' },
        400,
        origin,
      );
    }

    const formData = await request.formData();
    const smallImage = formData.get('smallImage') as File; // Thumbnail for storage
    const originalImage = formData.get('originalImage') as File; // Original file for moderation
    const pixelData = formData.get('pixelData') as string; // Pre-computed pixel art

    if (!smallImage || !originalImage || !pixelData) {
      return createResponse(
        {
          error: 'smallImage, originalImage und pixelData sind erforderlich',
        },
        400,
        origin,
      );
    }

    // Validate file types - only images, no GIFs
    if (
      !smallImage.type.startsWith('image/') ||
      !originalImage.type.startsWith('image/') ||
      !UPLOAD_LIMITS.SUPPORTED_MIME_TYPES.includes(smallImage.type as any) ||
      !UPLOAD_LIMITS.SUPPORTED_MIME_TYPES.includes(originalImage.type as any)
    ) {
      return createResponse(
        { error: 'Ungültiger Dateityp. Nur PNG, JPG und WEBP sind erlaubt.' },
        400,
        origin,
      );
    }

    // Validate file sizes using defined limits
    if (smallImage.size > UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE) {
      return createResponse(
        {
          error: `Thumbnail zu groß. Maximale Größe sind ${UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE / 1024}KB.`,
        },
        400,
        origin,
      );
    }

    if (originalImage.size > UPLOAD_LIMITS.MAX_ORIGINAL_SIZE) {
      return createResponse(
        {
          error: `Datei zu groß. Maximale Größe sind ${UPLOAD_LIMITS.MAX_ORIGINAL_SIZE / (1024 * 1024)}MB.`,
        },
        400,
        origin,
      );
    }

    // Check image content safety with OpenAI using the original image
    const isSafe = await checkImageSafety(originalImage, env, steamId);
    if (!isSafe) {
      return createResponse(
        { error: 'Bildinhalt nicht erlaubt. Bitte wähle ein anderes Bild.' },
        400,
        origin,
      );
    }

    // Process the pre-resized thumbnail and use pre-computed pixel data
    const smallImageBuffer = await smallImage.arrayBuffer();
    const processedImageData = await convertImageToDataURL(smallImageBuffer);

    // Store the pixel string and processed image data in KV
    const sprayKey = `spray_${steamId}`;
    const sprayData = {
      pixelString: pixelData,
      processedImageData,
      uploadedAt: Date.now(),
      originalFileName: smallImage.name,
      isGif: false, // Always false since we only support images
    };

    await env.SESSIONS.put(sprayKey, JSON.stringify(sprayData));

    return createResponse(
      {
        success: true,
        message: 'Spray erfolgreich hochgeladen und verarbeitet',
        isGif: false,
        pixelString: sprayData.pixelString.substring(0, 200) + '...', // Preview only
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error processing spray upload:', error);
    return createResponse({ error: 'Failed to process image' }, 500, origin);
  }
}

export async function handleGetSpray(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (!sessionValidation.isValid || !sessionValidation.session) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation.session;

  try {
    const sprayKey = `spray_${steamId}`;
    const sprayDataString = await env.SESSIONS.get(sprayKey);

    if (!sprayDataString) {
      return createResponse(
        { error: 'Kein Spray für diesen Benutzer gefunden' },
        404,
        origin,
      );
    }

    const sprayData = JSON.parse(sprayDataString);

    // Return the processed image data
    const imageData = sprayData.processedImageData;
    if (!imageData) {
      return createResponse({ error: 'Keine Bilddaten gefunden' }, 404, origin);
    }

    // Extract base64 data and convert to blob
    const base64Data = imageData.split(',')[1];
    const mimeType = imageData.split(',')[0].split(':')[1].split(';')[0]; // Extract MIME type from data URL
    const binaryData = atob(base64Data);
    const bytes = new Uint8Array(binaryData.length);

    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData.charCodeAt(i);
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': mimeType, // Use the actual MIME type from the stored image
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error retrieving spray:', error);
    return createResponse({ error: 'Failed to retrieve spray' }, 500, origin);
  }
}

export async function handleGetSprayString(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (!sessionValidation.isValid || !sessionValidation.session) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation.session;

  try {
    const sprayKey = `spray_${steamId}`;
    const sprayDataString = await env.SESSIONS.get(sprayKey);

    if (!sprayDataString) {
      return createResponse(
        { error: 'Kein Spray für diesen Benutzer gefunden' },
        404,
        origin,
      );
    }

    const sprayData = JSON.parse(sprayDataString);

    // Return image data (no more GIF support)
    return createResponse(
      {
        pixelString: sprayData.pixelString,
        uploadedAt: sprayData.uploadedAt,
        originalFileName: sprayData.originalFileName,
        isGif: false, // Always false since we only support images
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error retrieving spray string:', error);
    return createResponse(
      { error: 'Failed to retrieve spray string' },
      500,
      origin,
    );
  }
}

export async function handleDeleteSpray(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (!sessionValidation.isValid || !sessionValidation.session) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation.session;

  try {
    const sprayKey = `spray_${steamId}`;

    // Check if spray exists
    const existingSpray = await env.SESSIONS.get(sprayKey);
    if (!existingSpray) {
      return createResponse(
        { error: 'Kein Spray zum Löschen gefunden' },
        404,
        origin,
      );
    }

    // Delete the spray from KV storage
    await env.SESSIONS.delete(sprayKey);

    return createResponse(
      {
        success: true,
        message: 'Spray erfolgreich gelöscht',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error deleting spray:', error);
    return createResponse({ error: 'Failed to delete spray' }, 500, origin);
  }
}

// Handle Discord moderation action - delete spray
export async function handleModerationDelete(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse(
        { error: 'steamId und imageHash sind erforderlich' },
        400,
        origin,
      );
    }

    // Check if spray exists before deleting
    const sprayKey = `spray_${steamId}`;
    const existingSpray = await env.SESSIONS.get(sprayKey);
    if (!existingSpray) {
      console.log(`No spray found for Steam ID: ${steamId}, skipping delete action`);
      return createResponse(
        { success: true, message: 'No spray found to delete' },
        200,
        origin,
      );
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

    console.log(
      `Moderator deleted spray for Steam ID: ${steamId}, hash: ${imageHash}`,
    );

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
    return createResponse(
      { error: 'Failed to process moderation action' },
      500,
      origin,
    );
  }
}

// Handle Discord moderation action - delete spray and ban user
export async function handleModerationBan(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse(
        { error: 'steamId und imageHash sind erforderlich' },
        400,
        origin,
      );
    }

    // Check if user is already banned
    const banKey = `spray_ban_${steamId}`;
    const existingBan = await env.SESSIONS.get(banKey);
    if (existingBan) {
      console.log(`User ${steamId} is already banned, skipping ban action`);
      return createResponse(
        { success: true, message: 'User is already banned' },
        200,
        origin,
      );
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

    console.log(
      `Moderator banned Steam ID: ${steamId} and deleted spray with hash: ${imageHash}`,
    );

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
    return createResponse(
      { error: 'Failed to process moderation action' },
      500,
      origin,
    );
  }
}

// Check if user is banned from spray uploads
export async function handleGetSprayBanStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (!sessionValidation.isValid || !sessionValidation.session) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation.session;

  try {
    // Check if user is banned from uploading sprays
    const banKey = `spray_ban_${steamId}`;
    const banData = await env.SESSIONS.get(banKey);

    if (banData) {
      const ban = JSON.parse(banData);
      return createResponse(
        {
          isBanned: true,
          bannedAt: ban.bannedAt,
        },
        200,
        origin,
      );
    }

    return createResponse(
      {
        isBanned: false,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error checking spray ban status:', error);
    return createResponse(
      { error: 'Failed to check ban status' },
      500,
      origin,
    );
  }
}

// Get upload limits for images
export async function handleGetUploadLimits(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    return createResponse(
      {
        maxOriginalSize: UPLOAD_LIMITS.MAX_ORIGINAL_SIZE,
        maxThumbnailSize: UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE,
        maxOriginalSizeMB: UPLOAD_LIMITS.MAX_ORIGINAL_SIZE / (1024 * 1024),
        maxThumbnailSizeKB: UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE / 1024,
        supportedFormats: UPLOAD_LIMITS.SUPPORTED_FORMATS,
        message: `Maximale Bildgröße: ${UPLOAD_LIMITS.MAX_ORIGINAL_SIZE / (1024 * 1024)}MB`
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting upload limits:', error);
    return createResponse(
      { error: 'Failed to get upload limits' },
      500,
      origin,
    );
  }
}

// Handle Discord moderation action - unban user
export async function handleModerationUnban(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse(
        { error: 'steamId und imageHash sind erforderlich' },
        400,
        origin,
      );
    }

    // Check if user is actually banned before unbanning
    const banKey = `spray_ban_${steamId}`;
    const banData = await env.SESSIONS.get(banKey);
    if (!banData) {
      console.log(`User ${steamId} is not banned, skipping unban action`);
      return createResponse(
        { success: true, message: 'User is not banned' },
        200,
        origin,
      );
    }

    // Remove the ban from KV storage
    await env.SESSIONS.delete(banKey);

    // Update Discord webhook message to show action taken
    await updateDiscordWebhookMessage(steamId, imageHash, 'unbanned', env);

    console.log(
      `Moderator unbanned Steam ID: ${steamId}`,
    );

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
    return createResponse(
      { error: 'Failed to process moderation action' },
      500,
      origin,
    );
  }
}

// Handle Discord moderation action - undelete spray (remove block flag)
export async function handleModerationUndelete(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');
    const imageHash = url.searchParams.get('imageHash');

    if (!steamId || !imageHash) {
      return createResponse(
        { error: 'steamId und imageHash sind erforderlich' },
        400,
        origin,
      );
    }

    // Check if image is actually blocked before undeleting
    const cacheKey = `moderation_${imageHash}`;
    const cachedResult = await env.SESSIONS.get(cacheKey);
    if (!cachedResult) {
      console.log(`Image hash ${imageHash} is not blocked, skipping undelete action`);
      return createResponse(
        { success: true, message: 'Image is not blocked' },
        200,
        origin,
      );
    }

    const cached = JSON.parse(cachedResult);
    if (!cached.blocked) {
      console.log(`Image hash ${imageHash} is not blocked, skipping undelete action`);
      return createResponse(
        { success: true, message: 'Image is not blocked' },
        200,
        origin,
      );
    }

    // Remove the block flag from the image hash cache
    await env.SESSIONS.delete(cacheKey);

    // Update Discord webhook message to show action taken
    await updateDiscordWebhookMessage(steamId, imageHash, 'undeleted', env);

    console.log(
      `Moderator undeleted/unblocked image hash: ${imageHash}`,
    );

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
    return createResponse(
      { error: 'Failed to process moderation action' },
      500,
      origin,
    );
  }
}
