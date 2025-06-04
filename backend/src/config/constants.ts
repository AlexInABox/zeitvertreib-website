/**
 * Application constants and configuration
 */

export const STEAM_CONFIG = {
    OPENID_URL: 'https://steamcommunity.com/openid/login',
    API_URL: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
} as const;

export const SESSION_CONFIG = {
    DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
} as const;

export const DEFAULT_FRONTEND_URL = 'http://localhost:4200';
