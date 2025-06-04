import { handleSteamLogin, handleSteamCallback, handleGetUser, handleLogout } from './auth.js';
import { handleGetStats } from './stats.js';

export const routes = {
    '/auth/steam': handleSteamLogin,
    '/auth/steam/callback': handleSteamCallback,
    '/auth/me': handleGetUser,
    '/auth/logout': handleLogout,
    '/stats': handleGetStats,
} as const;

export type RouteHandler = (request: Request, env: Env) => Promise<Response>;
