import { validateSession, createResponse } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import OpenAI from 'openai';
import {
  generateImageHash,
  sendSprayToDiscord,
  handleModerationDelete,
  handleModerationBan,
  handleModerationUnban,
  handleModerationUndelete,
} from './spray-moderation.js';

// Upload limits configuration - images only (no GIFs)
const UPLOAD_LIMITS = {
  MAX_ORIGINAL_SIZE: 10 * 1024 * 1024, // 10MB for original images
  MAX_THUMBNAIL_SIZE: 10 * 1024, // 10KB for thumbnails
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

// Convert image buffer to data URL for storage
async function convertImageToDataURL(imageBuffer: ArrayBuffer): Promise<string> {
  try {
    const uint8Array = new Uint8Array(imageBuffer);

    // Detect image format
    const isJPEG = uint8Array[0] === 0xff && uint8Array[1] === 0xd8;
    const isPNG = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4e && uint8Array[3] === 0x47;
    const isWebP =
      uint8Array[8] === 0x57 && uint8Array[9] === 0x45 && uint8Array[10] === 0x42 && uint8Array[11] === 0x50;

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
async function checkImageSafety(imageFile: File, env: Env, steamId: string): Promise<boolean> {
  try {
    // Check if user is banned from uploading sprays
    const banKey = `spray_ban_${steamId}`;
    const banData = await env.SESSIONS.get(banKey);
    if (banData) {
      // Parse ban data for potential future use
      // const ban = JSON.parse(banData);
      console.log(`Steam ID ${steamId} is banned from uploading sprays`);
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
        console.log(`Using cached moderation result for image hash ${imageHash}: ${isSafe ? 'safe' : 'unsafe'}`);

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
    console.log(`Cached moderation result for image hash ${imageHash}: ${isSafe ? 'safe' : 'unsafe'}`);

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

export async function handleUploadSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation;

  try {
    // Check if request contains multipart form data
    const contentType = request.headers.get('Content-Type');
    if (!contentType?.includes('multipart/form-data')) {
      return createResponse({ error: 'Multipart form data required' }, 400, origin);
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
      return createResponse({ error: 'Ungültiger Dateityp. Nur PNG, JPG und WEBP sind erlaubt.' }, 400, origin);
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
      return createResponse({ error: 'Bildinhalt nicht erlaubt. Bitte wähle ein anderes Bild.' }, 400, origin);
    }

    // Process the pre-resized thumbnail and use pre-computed pixel data
    const smallImageBuffer = await smallImage.arrayBuffer();
    const processedImageData = await convertImageToDataURL(smallImageBuffer);

    // Generate hash for the original image (already computed during safety check)
    const originalImageBuffer = await originalImage.arrayBuffer();
    const imageHash = await generateImageHash(originalImageBuffer);

    // Store the pixel string and processed image data in KV
    const sprayKey = `spray_${steamId}`;
    const sprayData = {
      pixelString: pixelData,
      processedImageData,
      uploadedAt: Date.now(),
      originalFileName: smallImage.name,
      imageHash: imageHash,
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

export async function handleGetSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation;

  try {
    const sprayKey = `spray_${steamId}`;
    const sprayDataString = await env.SESSIONS.get(sprayKey);

    if (!sprayDataString) {
      return createResponse({ error: 'Kein Spray für diesen Benutzer gefunden' }, 404, origin);
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

export async function handleGetSprayString(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation;

  try {
    const sprayKey = `spray_${steamId}`;
    const sprayDataString = await env.SESSIONS.get(sprayKey);

    if (!sprayDataString) {
      return createResponse({ error: 'Kein Spray für diesen Benutzer gefunden' }, 404, origin);
    }

    const sprayData = JSON.parse(sprayDataString);

    // Return image data (no more GIF support)
    return createResponse(
      {
        pixelString: sprayData.pixelString,
        uploadedAt: sprayData.uploadedAt,
        originalFileName: sprayData.originalFileName,
        imageHash: sprayData.imageHash,
        isGif: false, // Always false since we only support images
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error retrieving spray string:', error);
    return createResponse({ error: 'Failed to retrieve spray string' }, 500, origin);
  }
}

export async function handleDeleteSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation;

  try {
    const sprayKey = `spray_${steamId}`;

    // Check if spray exists
    const existingSpray = await env.SESSIONS.get(sprayKey);
    if (!existingSpray) {
      return createResponse({ error: 'Kein Spray zum Löschen gefunden' }, 404, origin);
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

// Check if user is banned from spray uploads
export async function handleGetSprayBanStatus(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse({ error: 'Authentication required' }, 401, origin);
  }

  const { steamId } = sessionValidation;

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
    return createResponse({ error: 'Failed to check ban status' }, 500, origin);
  }
}

// Get upload limits for images
export async function handleGetUploadLimits(request: Request, _env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    return createResponse(
      {
        maxOriginalSize: UPLOAD_LIMITS.MAX_ORIGINAL_SIZE,
        maxThumbnailSize: UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE,
        maxOriginalSizeMB: UPLOAD_LIMITS.MAX_ORIGINAL_SIZE / (1024 * 1024),
        maxThumbnailSizeKB: UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE / 1024,
        supportedFormats: UPLOAD_LIMITS.SUPPORTED_FORMATS,
        message: `Maximale Bildgröße: ${UPLOAD_LIMITS.MAX_ORIGINAL_SIZE / (1024 * 1024)}MB`,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting upload limits:', error);
    return createResponse({ error: 'Failed to get upload limits' }, 500, origin);
  }
}

// Re-export moderation route handlers from spray-moderation.ts
export { handleModerationDelete, handleModerationBan, handleModerationUnban, handleModerationUndelete } from './spray-moderation.js';

// Handle background removal via Replicate API
export async function handleBackgroundRemoval(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Validate session
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // const steamId = sessionValidation.session.steamId;

    // Check request method
    if (request.method !== 'POST') {
      return createResponse({ error: 'Method Not Allowed' }, 405, origin);
    }

    // Get form data with the image
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      return createResponse({ error: 'No image provided' }, 400, origin);
    }

    // Validate file type
    if (!UPLOAD_LIMITS.SUPPORTED_FORMATS.includes(imageFile.type as any)) {
      return createResponse({ error: 'Unsupported file format' }, 400, origin);
    }

    // Convert image to base64 data URL for Replicate
    const imageBuffer = await imageFile.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const mimeType = imageFile.type;
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Call Replicate API
    const replicateResponse = await proxyFetch(
      'https://api.replicate.com/v1/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify({
          version: 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
          input: {
            image: dataUrl,
          },
        }),
      },
      env,
    );

    if (!replicateResponse.ok) {
      const errorText = await replicateResponse.text();
      console.error('Replicate API error:', replicateResponse.status, errorText);
      return createResponse({ error: 'Background removal service failed' }, 500, origin);
    }

    const result = (await replicateResponse.json()) as {
      output?: string;
      error?: string;
    };

    // Check if the result has the output URL
    if (!result.output) {
      console.error('Replicate API did not return output:', result);
      return createResponse({ error: 'Background removal processing failed' }, 500, origin);
    }

    // Return the URL of the processed image
    return createResponse(
      {
        success: true,
        processedImageUrl: result.output,
        message: 'Background removed successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error handling background removal:', error);
    return createResponse({ error: 'Failed to process background removal' }, 500, origin);
  }
}
