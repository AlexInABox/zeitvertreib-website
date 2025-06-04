/**
 * Response utility functions
 */

export function createSuccessResponse(data: any, origin?: string | null): Response {
    return new Response(JSON.stringify(data), {
        headers: {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Content-Type': 'application/json'
        }
    });
}

export function createErrorResponse(
    message: string,
    status: number = 400,
    origin?: string | null
): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Credentials': 'true',
            'Content-Type': 'application/json'
        }
    });
}

export function createRedirectResponse(url: string): Response {
    return new Response(null, {
        status: 302,
        headers: {
            'Location': url
        }
    });
}
