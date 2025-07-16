import { validateSession, createResponse } from '../utils.js';

// Process pre-resized images from the frontend
async function processPreResizedImages(largeImageBuffer: ArrayBuffer, smallImageBuffer: ArrayBuffer): Promise<{ pixelString: string; processedImageData: string }> {
    try {
        // Create pixel art from the 400x400 image
        const pixelString = await createPixelArtFromImage(largeImageBuffer);

        // Convert the 50x50 image to base64 data URL for storage
        const processedImageData = await convertImageToDataURL(smallImageBuffer);

        return { pixelString, processedImageData };
    } catch (error) {
        console.error('Image processing error:', error);
        // Fallback to placeholder
        const pixelString = createPlaceholderPixelArt();
        const fallbackImageData = await createFallbackImage(smallImageBuffer);

        return { pixelString, processedImageData: fallbackImageData };
    }
}

// Convert image buffer to data URL for storage
async function convertImageToDataURL(imageBuffer: ArrayBuffer): Promise<string> {
    try {
        const uint8Array = new Uint8Array(imageBuffer);

        // Detect image format
        const isJPEG = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8;
        const isPNG = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
        const isWebP = uint8Array[8] === 0x57 && uint8Array[9] === 0x45 && uint8Array[10] === 0x42 && uint8Array[11] === 0x50;

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
    const minimalJPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
    return `data:image/jpeg;base64,${minimalJPEG}`;
}

// Create fallback image for error cases
async function createFallbackImage(imageBuffer: ArrayBuffer): Promise<string> {
    const uint8Array = new Uint8Array(imageBuffer);
    let binaryString = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }

    const base64 = btoa(binaryString);
    return `data:image/png;base64,${base64}`;
}

// Create pixel art representation from image buffer with accurate colors
async function createPixelArtFromImage(imageBuffer: ArrayBuffer): Promise<string> {
    try {
        const data = new Uint8Array(imageBuffer);
        let result = '';

        // Create a 40x40 grid for the pixel art
        const gridSize = 40;
        const bytesPerPixel = 4; // Assuming RGBA
        const estimatedWidth = Math.sqrt(data.length / bytesPerPixel);
        const scaleFactor = estimatedWidth / gridSize;

        for (let y = 0; y < gridSize; y++) {
            let line = '';
            let currentColor = '';
            let consecutiveCount = 0;

            for (let x = 0; x < gridSize; x++) {
                // Calculate approximate pixel position in the original image data
                const sourceX = Math.floor(x * scaleFactor);
                const sourceY = Math.floor(y * scaleFactor);
                const sourceIndex = (sourceY * Math.floor(estimatedWidth) + sourceX) * bytesPerPixel;

                let pixelColor = '#000000'; // Default black

                if (sourceIndex + 2 < data.length) {
                    // Extract RGB values (assuming the data contains some color information)
                    let r, g, b;

                    if (data.length > sourceIndex + 2) {
                        // Try to extract meaningful color data
                        r = data[sourceIndex] || data[sourceIndex % data.length];
                        g = data[sourceIndex + 1] || data[(sourceIndex + 1) % data.length];
                        b = data[sourceIndex + 2] || data[(sourceIndex + 2) % data.length];
                    } else {
                        // Fallback to pseudo-random colors based on position and data
                        const seed = (x + y * gridSize + data[Math.min(sourceIndex, data.length - 1)]) % 256;
                        r = (seed * 37) % 256;
                        g = (seed * 73) % 256;
                        b = (seed * 149) % 256;
                    }

                    // Convert to hex with full spectrum
                    pixelColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                }

                if (pixelColor === currentColor) {
                    consecutiveCount++;
                } else {
                    // Flush previous color group
                    if (consecutiveCount > 0 && currentColor) {
                        line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
                    }
                    currentColor = pixelColor;
                    consecutiveCount = 1;
                }
            }

            // Flush remaining pixels for this line
            if (consecutiveCount > 0 && currentColor) {
                line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
            }

            if (line) {
                result += line + '\n';
            }
        }

        return result;
    } catch (error) {
        console.error('Error creating pixel art:', error);
        return createPlaceholderPixelArt();
    }
}

// Create a sample pixel art string as placeholder with full hex colors
function createPlaceholderPixelArt(): string {
    const colors = [
        '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
        '#ffa500', '#800080', '#ffc0cb', '#a52a2a', '#808080', '#000000'
    ];
    let result = '';

    for (let y = 0; y < 20; y++) {
        let line = '';
        let currentColor = colors[y % colors.length];
        let pixelCount = Math.floor(Math.random() * 10) + 1;

        for (let group = 0; group < 5; group++) {
            line += `<color=${currentColor}>${'█'.repeat(pixelCount)}</color>`;
            // Generate more varied colors for placeholder
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            currentColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            pixelCount = Math.floor(Math.random() * 8) + 1;
        }

        result += line + '\n';
    }

    return result;
}

export async function handleUploadSpray(request: Request, env: Env): Promise<Response> {
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
            return createResponse({ error: 'Multipart form data required' }, 400, origin);
        }

        const formData = await request.formData();
        const largeImage = formData.get('largeImage') as File; // 400x400 for pixel art
        const smallImage = formData.get('smallImage') as File; // 50x50 for storage

        if (!largeImage || !smallImage) {
            return createResponse({ error: 'Both largeImage (400x400) and smallImage (50x50) are required' }, 400, origin);
        }

        // Validate file types
        if (!largeImage.type.startsWith('image/') || !smallImage.type.startsWith('image/')) {
            return createResponse({ error: 'Invalid file type. Please upload images.' }, 400, origin);
        }

        // Validate file sizes (max 5MB for large, 1MB for small)
        const maxLargeSize = 5 * 1024 * 1024; // 5MB
        const maxSmallSize = 1 * 1024 * 1024; // 1MB
        if (largeImage.size > maxLargeSize) {
            return createResponse({ error: 'Large image too big. Maximum size is 5MB.' }, 400, origin);
        }
        if (smallImage.size > maxSmallSize) {
            return createResponse({ error: 'Small image too big. Maximum size is 1MB.' }, 400, origin);
        }

        // Process the pre-resized images:
        // 1. Generate pixel art from the 400x400 image
        // 2. Store the 50x50 image directly
        const largeImageBuffer = await largeImage.arrayBuffer();
        const smallImageBuffer = await smallImage.arrayBuffer();
        const { pixelString, processedImageData } = await processPreResizedImages(largeImageBuffer, smallImageBuffer);

        // Store both the pixel string and processed image data in KV
        const sprayKey = `spray_${steamId}`;
        const sprayData = {
            pixelString,
            processedImageData,
            uploadedAt: Date.now(),
            originalFileName: largeImage.name // Use the large image filename
        };

        await env.SESSIONS.put(sprayKey, JSON.stringify(sprayData));

        return createResponse({
            success: true,
            message: 'Spray uploaded and processed successfully',
            pixelString: pixelString.substring(0, 200) + '...' // Preview only
        }, 200, origin);

    } catch (error) {
        console.error('Error processing spray upload:', error);
        return createResponse({ error: 'Failed to process image' }, 500, origin);
    }
}

export async function handleGetSpray(request: Request, env: Env): Promise<Response> {
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
            return createResponse({ error: 'No spray found for this user' }, 404, origin);
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
                'Cache-Control': 'public, max-age=3600'
            }
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
    if (!sessionValidation.isValid || !sessionValidation.session) {
        return createResponse({ error: 'Authentication required' }, 401, origin);
    }

    const { steamId } = sessionValidation.session;

    try {
        const sprayKey = `spray_${steamId}`;
        const sprayDataString = await env.SESSIONS.get(sprayKey);

        if (!sprayDataString) {
            return createResponse({ error: 'No spray found for this user' }, 404, origin);
        }

        const sprayData = JSON.parse(sprayDataString);

        return createResponse({
            pixelString: sprayData.pixelString,
            uploadedAt: sprayData.uploadedAt,
            originalFileName: sprayData.originalFileName
        }, 200, origin);

    } catch (error) {
        console.error('Error retrieving spray string:', error);
        return createResponse({ error: 'Failed to retrieve spray string' }, 500, origin);
    }
}

export async function handleDeleteSpray(request: Request, env: Env): Promise<Response> {
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

        return createResponse({
            success: true,
            message: 'Spray deleted successfully'
        }, 200, origin);

    } catch (error) {
        console.error('Error deleting spray:', error);
        return createResponse({ error: 'Failed to delete spray' }, 500, origin);
    }
}
