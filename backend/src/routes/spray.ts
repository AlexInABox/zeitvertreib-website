import { validateSession, createResponse } from '../utils.js';
import { EmbedBuilder } from '@discordjs/builders';

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

    // Discord webhooks support link buttons in raw JSON format
    const deleteUrl = `${env.BACKEND_URL}/spray/moderate/delete?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;
    const banUrl = `${env.BACKEND_URL}/spray/moderate/ban?steamId=${encodeURIComponent(steamId)}&imageHash=${encodeURIComponent(imageHash)}`;

    // Create components in Discord webhook format
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

    const response = await fetch(webhookUrl.toString(), {
      method: 'POST',
      body: formData,
    });

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
      console.log(
        `Successfully sent accepted spray to Discord for Steam ID: ${steamId}`,
      );
    }
  } catch (error) {
    console.error('Error sending spray to Discord webhook:', error);
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

// Check image safety using SightEngine API with hash-based caching
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
        `Steam ID ${steamId} is banned from uploading sprays: ${ban.reason}`,
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

    // No valid cache found, perform actual moderation check
    console.log(`Performing new moderation check for image hash ${imageHash}`);

    const formData = new FormData();
    formData.append('media', imageFile);
    formData.append('workflow', env.SIGHTENGINE_WORKFLOW_ID);
    formData.append('api_user', env.SIGHTENGINE_API_USER);
    formData.append('api_secret', env.SIGHTENGINE_API_SECRET);

    const response = await fetch(
      'https://api.sightengine.com/1.0/check-workflow.json',
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      console.error(
        'SightEngine API error:',
        response.status,
        response.statusText,
      );
      // If API fails, be conservative and reject the image
      // Don't cache API failures to allow retry
      return false;
    }

    const result = (await response.json()) as any;
    let isSafe = true;

    // Check workflow summary - if any issues detected, reject
    if (result.summary?.action === 'reject') {
      console.log(
        'Image rejected by SightEngine workflow:',
        result.summary?.reject_reason || 'Workflow determined content unsafe',
      );
      isSafe = false;
    }

    // Additional checks based on workflow response structure
    // Reject if nudity probability is high
    if (
      result.nudity?.sexual_activity > 0.5 ||
      result.nudity?.sexual_display > 0.5 ||
      result.nudity?.erotica > 0.5
    ) {
      console.log('Image rejected: nudity detected');
      isSafe = false;
    }

    // Reject if weapons detected
    if (result.weapon > 0.5) {
      console.log('Image rejected: weapon detected');
      isSafe = false;
    }

    // Reject if drugs detected
    if (result.recreational_drug > 0.5) {
      console.log('Image rejected: recreational drug detected');
      isSafe = false;
    }

    // Reject if offensive content detected
    if (result.offensive?.prob > 0.7) {
      console.log('Image rejected: offensive content detected');
      isSafe = false;
    }

    // Reject if gore detected
    if (result.gore?.prob > 0.5) {
      console.log('Image rejected: gore detected');
      isSafe = false;
    }

    // Reject if violence detected
    if (result.violence > 0.5) {
      console.log('Image rejected: violence detected');
      isSafe = false;
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
    const smallImage = formData.get('smallImage') as File; // 50x50 thumbnail for storage
    const originalImage = formData.get('originalImage') as File; // Original uncompressed image for moderation
    const pixelData = formData.get('pixelData') as string; // Pre-computed pixel art

    if (!smallImage || !originalImage || !pixelData) {
      return createResponse(
        { error: 'smallImage, originalImage and pixelData are required' },
        400,
        origin,
      );
    }

    // Validate file type
    if (
      !smallImage.type.startsWith('image/') ||
      !originalImage.type.startsWith('image/')
    ) {
      return createResponse(
        { error: 'Invalid file type. Please upload images.' },
        400,
        origin,
      );
    } // Validate file size
    const maxSmallSize = 10 * 1024; // 10KB for 50x50 thumbnail
    const maxOriginalSize = 5 * 1024 * 1024; // 5MB for original image

    if (smallImage.size > maxSmallSize) {
      return createResponse(
        { error: 'Thumbnail too big. A 50x50 thumbnail should be under 10KB.' },
        400,
        origin,
      );
    }

    if (originalImage.size > maxOriginalSize) {
      return createResponse(
        { error: 'Original image too big. Please upload an image under 5MB.' },
        400,
        origin,
      );
    }

    // Check image content safety with SightEngine using the original uncompressed image
    const isSafe = await checkImageSafety(originalImage, env, steamId);
    if (!isSafe) {
      return createResponse(
        { error: 'Bildinhalt nicht erlaubt. Bitte wähle ein anderes Bild.' },
        400,
        origin,
      );
    }

    // Process the pre-resized images and use pre-computed pixel data:
    // 1. Use the high-quality pre-computed pixel art string from frontend
    // 2. Store the 50x50 thumbnail directly
    const smallImageBuffer = await smallImage.arrayBuffer();
    const processedImageData = await convertImageToDataURL(smallImageBuffer);

    // Use the pixel data sent from frontend (computed from actual canvas pixels)
    const pixelString = pixelData;

    // Store both the pixel string and processed image data in KV
    const sprayKey = `spray_${steamId}`;
    const sprayData = {
      pixelString,
      processedImageData,
      uploadedAt: Date.now(),
      originalFileName: smallImage.name,
    };

    await env.SESSIONS.put(sprayKey, JSON.stringify(sprayData));

    return createResponse(
      {
        success: true,
        message: 'Spray uploaded and processed successfully',
        pixelString: pixelString.substring(0, 200) + '...', // Preview only
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
        { error: 'No spray found for this user' },
        404,
        origin,
      );
    }

    const sprayData = JSON.parse(sprayDataString);

    // Return the processed image data
    const imageData = sprayData.processedImageData;
    if (!imageData) {
      return createResponse({ error: 'No image data found' }, 404, origin);
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
        { error: 'No spray found for this user' },
        404,
        origin,
      );
    }

    const sprayData = JSON.parse(sprayDataString);

    return createResponse(
      {
        pixelString: sprayData.pixelString,
        uploadedAt: sprayData.uploadedAt,
        originalFileName: sprayData.originalFileName,
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
      return createResponse({ error: 'No spray found to delete' }, 404, origin);
    }

    // Delete the spray from KV storage
    await env.SESSIONS.delete(sprayKey);

    return createResponse(
      {
        success: true,
        message: 'Spray deleted successfully',
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
        { error: 'steamId and imageHash are required' },
        400,
        origin,
      );
    }

    // Delete the spray from KV storage
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
      blockedReason: 'Deleted by Discord moderation',
    };
    await env.SESSIONS.put(cacheKey, JSON.stringify(blockedData));

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
        { error: 'steamId and imageHash are required' },
        400,
        origin,
      );
    }

    // Delete the spray from KV storage
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
    const banKey = `spray_ban_${steamId}`;
    const banData = {
      steamId,
      bannedAt: Date.now(),
      bannedBy: 'moderator',
      reason: 'Banned via Discord moderation',
      permanent: true,
    };
    await env.SESSIONS.put(banKey, JSON.stringify(banData));

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
