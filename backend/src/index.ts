interface SteamUser {
	steamid: string;
	personaname: string;
	profileurl: string;
	avatar: string;
	avatarmedium: string;
	avatarfull: string;
}

interface SessionData {
	steamId: string;
	steamUser: SteamUser;
	createdAt: number;
	expiresAt: number;
}

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAM_API_URL = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			switch (path) {
				case '/auth/steam':
					return handleSteamLogin(request, env);
				case '/auth/steam/callback':
					return handleSteamCallback(request, env);
				case '/auth/me':
					return handleGetUser(request, env);
				case '/auth/logout':
					return handleLogout(request, env);
				default:
					return new Response('Not Found', { status: 404, headers: corsHeaders });
			}
		} catch (error) {
			return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}
	},
} satisfies ExportedHandler<Env>;

async function handleSteamLogin(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const returnUrl = url.searchParams.get('return_url') || `${url.origin}/auth/steam/callback`;

	const params = new URLSearchParams({
		'openid.ns': 'http://specs.openid.net/auth/2.0',
		'openid.mode': 'checkid_setup',
		'openid.return_to': returnUrl,
		'openid.realm': url.origin,
		'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
		'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
	});

	return Response.redirect(`${STEAM_OPENID_URL}?${params.toString()}`);
}

async function handleSteamCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const params = Object.fromEntries(url.searchParams.entries());

	// Verify the OpenID response
	if (!params['openid.mode'] || params['openid.mode'] !== 'id_res') {
		return new Response(JSON.stringify({ error: 'Invalid OpenID response' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Validate with Steam
	const verifyParams = new URLSearchParams(params);
	verifyParams.set('openid.mode', 'check_authentication');

	const verifyResponse = await fetch(STEAM_OPENID_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: verifyParams.toString(),
	});

	const verifyText = await verifyResponse.text();
	if (!verifyText.includes('is_valid:true')) {
		return new Response(JSON.stringify({ error: 'Steam authentication failed' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Extract Steam ID
	const steamId = params['openid.identity']?.replace('https://steamcommunity.com/openid/id/', '');
	if (!steamId) {
		return new Response(JSON.stringify({ error: 'Could not extract Steam ID' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Get Steam user info (requires STEAM_API_KEY environment variable)
	const steamApiKey = env.STEAM_API_KEY;
	if (!steamApiKey) {
		return new Response(JSON.stringify({ error: 'Steam API key not configured' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const userResponse = await fetch(`${STEAM_API_URL}?key=${steamApiKey}&steamids=${steamId}`);
	const userData = await userResponse.json() as { response: { players: SteamUser[] } };

	if (!userData.response?.players?.length) {
		return new Response(JSON.stringify({ error: 'Could not fetch user data' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const steamUser = userData.response.players[0];

	// Create session
	const sessionId = crypto.randomUUID();
	const now = Date.now();
	const sessionData: SessionData = {
		steamId,
		steamUser,
		createdAt: now,
		expiresAt: now + SESSION_DURATION,
	};

	await env.SESSIONS.put(sessionId, JSON.stringify(sessionData), {
		expirationTtl: Math.floor(SESSION_DURATION / 1000),
	});

	// Return success with session cookie
	const response = new Response(JSON.stringify({
		success: true,
		user: steamUser,
		sessionId
	}), {
		headers: { 'Content-Type': 'application/json' }
	});

	// Set secure HTTP-only cookie
	response.headers.set('Set-Cookie',
		`session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_DURATION / 1000)}; Path=/`
	);

	return response;
}

async function handleGetUser(request: Request, env: Env): Promise<Response> {
	const sessionId = getSessionId(request);
	if (!sessionId) {
		return new Response(JSON.stringify({ error: 'No session found' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const sessionData = await env.SESSIONS.get(sessionId);
	if (!sessionData) {
		return new Response(JSON.stringify({ error: 'Invalid session' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const session: SessionData = JSON.parse(sessionData);

	// Check if session is expired
	if (Date.now() > session.expiresAt) {
		await env.SESSIONS.delete(sessionId);
		return new Response(JSON.stringify({ error: 'Session expired' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify({ user: session.steamUser }), {
		headers: { 'Content-Type': 'application/json' }
	});
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
	const sessionId = getSessionId(request);
	if (sessionId) {
		await env.SESSIONS.delete(sessionId);
	}

	const response = new Response(JSON.stringify({ success: true }), {
		headers: { 'Content-Type': 'application/json' }
	});

	// Clear the session cookie
	response.headers.set('Set-Cookie',
		'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
	);

	return response;
}

function getSessionId(request: Request): string | null {
	const cookieHeader = request.headers.get('Cookie');
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
		const [key, value] = cookie.trim().split('=');
		acc[key] = value;
		return acc;
	}, {} as Record<string, string>);

	return cookies.session || null;
}
