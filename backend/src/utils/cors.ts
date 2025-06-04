/**
 * CORS utility functions
 */

export function getCorsHeaders(origin?: string | null): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
    };
}

export function createCorsResponse(data: any, status = 200, origin?: string | null): Response {
    const headers = {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json'
    };

    return new Response(JSON.stringify(data), {
        status,
        headers
    });
}

export function createOptionsResponse(origin?: string | null): Response {
    return new Response(null, {
        headers: getCorsHeaders(origin)
    });
}
