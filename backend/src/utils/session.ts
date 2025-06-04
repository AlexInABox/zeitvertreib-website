import { SessionData } from '../types/index.js';
import { SESSION_CONFIG } from '../config/constants.js';

/**
 * Extract session ID from request headers or cookies
 */
export function getSessionId(request: Request): string | null {
    // First, try to get from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Fallback to cookie for backward compatibility
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);

    return cookies.session || null;
}

/**
 * Validate session and return session data
 */
export async function validateSession(
    request: Request,
    env: Env
): Promise<{ isValid: boolean; session?: SessionData; error?: string }> {
    const sessionId = getSessionId(request);

    if (!sessionId) {
        return { isValid: false, error: 'No session found' };
    }

    const sessionData = await env.SESSIONS.get(sessionId);
    if (!sessionData) {
        return { isValid: false, error: 'Invalid session' };
    }

    const session: SessionData = JSON.parse(sessionData);

    // Check if session is expired
    if (Date.now() > session.expiresAt) {
        await env.SESSIONS.delete(sessionId);
        return { isValid: false, error: 'Session expired' };
    }

    return { isValid: true, session };
}

/**
 * Create a new session
 */
export async function createSession(
    steamId: string,
    steamUser: any,
    env: Env,
    duration: number = SESSION_CONFIG.DURATION
): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const sessionData: SessionData = {
        steamId,
        steamUser,
        createdAt: now,
        expiresAt: now + duration,
    };

    await env.SESSIONS.put(sessionId, JSON.stringify(sessionData), {
        expirationTtl: Math.floor(duration / 1000),
    });

    return sessionId;
}

/**
 * Delete a session
 */
export async function deleteSession(request: Request, env: Env): Promise<void> {
    const sessionId = getSessionId(request);
    if (sessionId) {
        await env.SESSIONS.delete(sessionId);
    }
}
