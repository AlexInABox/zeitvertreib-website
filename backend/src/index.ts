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

interface Statistics {
	username: string;
	kills: number;
	deaths: number;
	experience: number;
	playtime: number;
	avatarFull: string;
	roundsplayed: number;
	level: number;
	leaderboardposition: number;
	usedmedkits: number;
	usedcolas: number;
	pocketescapes: number;
	usedadrenaline: number;
	lastkillers: Array<{ displayname: string; avatarmedium: string }>;
	lastkills: Array<{ displayname: string; avatarmedium: string }>;
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
			'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Access-Control-Allow-Credentials': 'true',
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
				case '/stats':
					return handleGetStats(request, env);
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

	// Redirect back to frontend with session token as URL parameter
	const frontendUrl = env.FRONTEND_URL || 'http://localhost:4200';
	const redirectUrl = new URL(frontendUrl);
	redirectUrl.searchParams.set('token', sessionId);

	// Create redirect response
	const response = new Response(null, {
		status: 302,
		headers: {
			'Location': redirectUrl.toString()
		}
	});

	return response;
}

async function handleGetUser(request: Request, env: Env): Promise<Response> {
	const corsHeaders = {
		'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
		'Access-Control-Allow-Credentials': 'true',
		'Content-Type': 'application/json'
	};

	const sessionId = getSessionId(request);
	if (!sessionId) {
		return new Response(JSON.stringify({ error: 'No session found' }), {
			status: 401,
			headers: corsHeaders
		});
	}

	const sessionData = await env.SESSIONS.get(sessionId);
	if (!sessionData) {
		return new Response(JSON.stringify({ error: 'Invalid session' }), {
			status: 401,
			headers: corsHeaders
		});
	}

	const session: SessionData = JSON.parse(sessionData);

	// Check if session is expired
	if (Date.now() > session.expiresAt) {
		await env.SESSIONS.delete(sessionId);
		return new Response(JSON.stringify({ error: 'Session expired' }), {
			status: 401,
			headers: corsHeaders
		});
	}

	return new Response(JSON.stringify({ user: session.steamUser }), {
		headers: corsHeaders
	});
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
	const corsHeaders = {
		'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
		'Access-Control-Allow-Credentials': 'true',
		'Content-Type': 'application/json'
	};

	const sessionId = getSessionId(request);
	if (sessionId) {
		await env.SESSIONS.delete(sessionId);
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: corsHeaders
	});
}

function getSessionId(request: Request): string | null {
	// First, try to get from Authorization header
	const authHeader = request.headers.get('Authorization');
	if (authHeader && authHeader.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}

	// Fallback to cookie for backward compatibility
	const cookieHeader = request.headers.get('Cookie');
	console.log('Cookie header:', cookieHeader); // Debug log
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
		const [key, value] = cookie.trim().split('=');
		acc[key] = value;
		return acc;
	}, {} as Record<string, string>);

	console.log('Parsed cookies:', cookies); // Debug log
	return cookies.session || null;
}

async function handleGetStats(request: Request, env: Env): Promise<Response> {
	const corsHeaders = {
		'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
		'Access-Control-Allow-Credentials': 'true',
		'Content-Type': 'application/json'
	};

	// Get session to verify user is authenticated
	const sessionId = getSessionId(request);
	if (!sessionId) {
		return new Response(JSON.stringify({ error: 'No session found' }), {
			status: 401,
			headers: corsHeaders
		});
	}

	const sessionData = await env.SESSIONS.get(sessionId);
	if (!sessionData) {
		return new Response(JSON.stringify({ error: 'Invalid session' }), {
			status: 401,
			headers: corsHeaders
		});
	}

	const session: SessionData = JSON.parse(sessionData);

	// Check if session is expired
	if (Date.now() > session.expiresAt) {
		await env.SESSIONS.delete(sessionId);
		return new Response(JSON.stringify({ error: 'Session expired' }), {
			status: 401,
			headers: corsHeaders
		});
	}

	try {
		// Query the database for player statistics using the Steam ID
		const steamId = session.steamId;
		const playerDataQuery = `SELECT * FROM playerdata WHERE id = ?`;
		const result = await env['zeitvertreib-data'].prepare(playerDataQuery)
			.bind(`${steamId}@steam`)
			.first();

		if (!result) {
			// Return default stats with user info if no player data found
			const defaultStats: Statistics = {
				username: session.steamUser.personaname,
				kills: 0,
				deaths: 0,
				experience: 0,
				playtime: 0,
				avatarFull: session.steamUser.avatarfull,
				roundsplayed: 0,
				level: 0,
				leaderboardposition: 0,
				usedmedkits: 0,
				usedcolas: 0,
				pocketescapes: 0,
				usedadrenaline: 0,
				lastkillers: [],
				lastkills: []
			};

			return new Response(JSON.stringify({ stats: defaultStats }), {
				headers: corsHeaders
			});
		}

		// Map database result to Statistics interface
		const playerData = result as any; // Type assertion for database result
		const stats: Statistics = {
			username: session.steamUser.personaname,
			kills: Number(playerData.kills) || 0,
			deaths: Number(playerData.deaths) || 0,
			experience: Number(playerData.experience) || 0,
			playtime: Number(playerData.playtime) || 0,
			avatarFull: session.steamUser.avatarfull,
			roundsplayed: Number(playerData.roundsplayed) || 0,
			level: Number(playerData.level) || 0,
			leaderboardposition: 0, // Not available in database schema, set to default
			usedmedkits: Number(playerData.usedmedkits) || 0,
			usedcolas: Number(playerData.usedcolas) || 0,
			pocketescapes: Number(playerData.pocketescapes) || 0,
			usedadrenaline: Number(playerData.usedadrenaline) || 0,
			lastkillers: playerData.lastkillers ? JSON.parse(String(playerData.lastkillers)) : [],
			lastkills: playerData.lastkills ? JSON.parse(String(playerData.lastkills)) : []
		};

		return new Response(JSON.stringify({ stats }), {
			headers: corsHeaders
		});

	} catch (error) {
		console.error('Database error:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch player statistics' }), {
			status: 500,
			headers: corsHeaders
		});
	}
}
