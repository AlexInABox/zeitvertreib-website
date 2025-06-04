import { routes } from './routes/index.js';
import { createOptionsResponse } from './utils/cors.js';
import { createErrorResponse } from './utils/response.js';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const origin = request.headers.get('Origin');

		// Handle preflight OPTIONS requests
		if (request.method === 'OPTIONS') {
			return createOptionsResponse(origin);
		}

		try {
			// Find matching route handler
			const handler = routes[path as keyof typeof routes];

			if (handler) {
				return await handler(request, env);
			}

			// Route not found
			return createErrorResponse('Not Found', 404, origin);

		} catch (error) {
			console.error('Request error:', error);
			return createErrorResponse('Internal Server Error', 500, origin);
		}
	},
} satisfies ExportedHandler<Env>;
