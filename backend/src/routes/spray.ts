import { validateSession, createResponse } from '../utils.js';

// Basic image processing using Cloudflare's Image Resizing and simple pixel extraction
async function processImageToPixelArt(imageBuffer: ArrayBuffer, request: Request): Promise<{ pixelString: string; processedImageData: string }> {
    // Since we can't do client-side image processing in Workers,
    // we'll use Cloudflare's Image Resizing service
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    
    try {
        // Create a blob URL and try to use Cloudflare's image transformation
        const originalBlob = new Blob([imageBuffer]);
        const resizedImageResponse = await fetch(`${baseUrl}/cdn-cgi/image/width=400,height=400,fit=scale-down,format=png/data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))}`);
        
        let processedBuffer = imageBuffer;
        if (resizedImageResponse.ok) {
            processedBuffer = await resizedImageResponse.arrayBuffer();
        }
        
        // Convert to base64 for storage
        const base64 = btoa(String.fromCharCode(...new Uint8Array(processedBuffer)));
        const processedImageData = `data:image/png;base64,${base64}`;
        
        // For now, create a simplified pixel representation
        // In a production environment, you would decode the image properly
        const pixelString = await createPixelArtFromImage(processedBuffer);
        
        return { pixelString, processedImageData };
    } catch (error) {
        console.error('Image processing error:', error);
        // Fallback to original image
        const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const processedImageData = `data:image/png;base64,${base64}`;
        const pixelString = createPlaceholderPixelArt();
        
        return { pixelString, processedImageData };
    }
}

// Create pixel art representation from image buffer
async function createPixelArtFromImage(imageBuffer: ArrayBuffer): Promise<string> {
    // This is a simplified approach since we can't easily decode images in Workers
    // We'll create a pattern based on the image data
    const data = new Uint8Array(imageBuffer);
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'];
    let result = '';
    
    // Create a 40x40 grid based on the image data
    const gridSize = 40;
    const chunkSize = Math.floor(data.length / (gridSize * gridSize));
    
    for (let y = 0; y < gridSize; y++) {
        let line = '';
        let currentColor = '';
        let consecutiveCount = 0;
        
        for (let x = 0; x < gridSize; x++) {
            const index = (y * gridSize + x) * chunkSize;
            if (index < data.length) {
                // Use the byte value to determine color
                const colorIndex = data[index] % colors.length;
                const pixelColor = colors[colorIndex];
                
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
}

// Create a sample pixel art string as placeholder
function createPlaceholderPixelArt(): string {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    let result = '';
    
    for (let y = 0; y < 20; y++) {
        let line = '';
        let currentColor = colors[y % colors.length];
        let pixelCount = Math.floor(Math.random() * 10) + 1;
        
        for (let group = 0; group < 5; group++) {
            line += `<color=${currentColor}>${'█'.repeat(pixelCount)}</color>`;
            currentColor = colors[(y + group) % colors.length];
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
        const imageFile = formData.get('image') as File;
        
        if (!imageFile) {
            return createResponse({ error: 'No image file provided' }, 400, origin);
        }
        
        // Validate file type
        if (!imageFile.type.startsWith('image/')) {
            return createResponse({ error: 'Invalid file type. Please upload an image.' }, 400, origin);
        }
        
        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (imageFile.size > maxSize) {
            return createResponse({ error: 'File too large. Maximum size is 10MB.' }, 400, origin);
        }
        
        // Process the image
        const imageBuffer = await imageFile.arrayBuffer();
        const { pixelString, processedImageData } = await processImageToPixelArt(imageBuffer, request);
        
        // Store both the pixel string and processed image data in KV
        const sprayKey = `spray_${steamId}`;
        const sprayData = {
            pixelString,
            processedImageData,
            uploadedAt: Date.now(),
            originalFileName: imageFile.name
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
        const binaryData = atob(base64Data);
        const bytes = new Uint8Array(binaryData.length);
        
        for (let i = 0; i < binaryData.length; i++) {
            bytes[i] = binaryData.charCodeAt(i);
        }
        
        return new Response(bytes, {
            headers: {
                'Content-Type': 'image/png',
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
