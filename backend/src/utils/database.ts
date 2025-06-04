import { Statistics, PlayerData } from '../types/index.js';

/**
 * Fetch player data from database
 */
export async function getPlayerData(steamId: string, env: Env): Promise<PlayerData | null> {
    try {
        const playerDataQuery = `SELECT * FROM playerdata WHERE id = ?`;
        const result = await env['zeitvertreib-data']
            .prepare(playerDataQuery)
            .bind(`${steamId}@steam`)
            .first();

        return result as PlayerData | null;
    } catch (error) {
        console.error('Database error:', error);
        throw new Error('Failed to fetch player data');
    }
}

/**
 * Convert player data to Statistics interface
 */
export function mapPlayerDataToStats(
    playerData: PlayerData | null,
    username: string,
    avatarFull: string
): Statistics {
    if (!playerData) {
        return createDefaultStats(username, avatarFull);
    }

    return {
        username,
        kills: Number(playerData.kills) || 0,
        deaths: Number(playerData.deaths) || 0,
        experience: Number(playerData.experience) || 0,
        playtime: Number(playerData.playtime) || 0,
        avatarFull,
        roundsplayed: Number(playerData.roundsplayed) || 0,
        level: Number(playerData.level) || 0,
        leaderboardposition: 0, // Not available in database schema
        usedmedkits: Number(playerData.usedmedkits) || 0,
        usedcolas: Number(playerData.usedcolas) || 0,
        pocketescapes: Number(playerData.pocketescapes) || 0,
        usedadrenaline: Number(playerData.usedadrenaline) || 0,
        lastkillers: parseJsonArray(playerData.lastkillers),
        lastkills: parseJsonArray(playerData.lastkills)
    };
}

/**
 * Create default statistics for new players
 */
function createDefaultStats(username: string, avatarFull: string): Statistics {
    return {
        username,
        kills: 0,
        deaths: 0,
        experience: 0,
        playtime: 0,
        avatarFull,
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
}

/**
 * Safely parse JSON array from database field
 */
function parseJsonArray(jsonString?: string): Array<{ displayname: string; avatarmedium: string }> {
    if (!jsonString) return [];

    try {
        return JSON.parse(String(jsonString));
    } catch (error) {
        console.error('Error parsing JSON array:', error);
        return [];
    }
}
