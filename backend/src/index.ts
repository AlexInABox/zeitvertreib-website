import { handleSteamLogin, handleSteamCallback, handleGetUser, handleLogout } from './routes/auth.js';
import { handleGetStats } from './routes/stats.js';
import { handleUploadSpray, handleGetSpray, handleGetSprayString } from './routes/spray.js';

// Simple response helper for internal use
function createResponse(data: any, status = 200, origin?: string | null): Response {
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': origin || '*',
		'Access-Control-Allow-Credentials': 'true',
		'Content-Type': 'application/json'
	};

	return new Response(JSON.stringify(data), { status, headers });
}

// Route handlers
const routes: Record<string, (request: Request, env: Env) => Promise<Response>> = {
	'/auth/steam': handleSteamLogin,
	'/auth/steam/callback': handleSteamCallback,
	'/auth/me': handleGetUser,
	'/auth/logout': handleLogout,
	'/stats': handleGetStats,
	'/spray/upload': handleUploadSpray,
	'/spray/image': handleGetSpray,
	'/spray/string': handleGetSprayString,
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');

		// Handle preflight OPTIONS requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': origin || '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
					'Access-Control-Allow-Credentials': 'true',
				}
			});
		}

		try {
			const handler = routes[url.pathname];
			if (handler) {
				// Handle method-specific routing for spray upload
				if (url.pathname === '/spray/upload' && request.method !== 'POST') {
					return createResponse({ error: 'Method Not Allowed' }, 405, origin);
				}
				if ((url.pathname === '/spray/image' || url.pathname === '/spray/string') && request.method !== 'GET') {
					return createResponse({ error: 'Method Not Allowed' }, 405, origin);
				}
				
				return await handler(request, env);
			}
			return createResponse({ error: 'Not Found' }, 404, origin);
		} catch (error) {
			console.error('Request error:', error);
			return createResponse({ error: 'Internal Server Error' }, 500, origin);
		}
	},
} satisfies ExportedHandler<Env>;
