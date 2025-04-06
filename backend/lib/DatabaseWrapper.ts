import pkg from 'pg';
import fs from 'fs';
const { Pool } = pkg;
import Logging from "./Logging.js";
import { randomUUID } from 'crypto';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function waitForDatabase(retries = 4, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            client.release();
            Logging.logInfo("Database is ready.");
            return;
        } catch (error) {
            Logging.logWarning(`Database is still starting up, retrying... (${i + 1}/${retries})`);
            if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
            else Logging.logCritical("Database failed to start after maximum retries.");
        }
    }
}

await waitForDatabase();

async function runInitScript() {
    const client = await pool.connect();
    try {
        const initSQL = fs.readFileSync("./init.sql", "utf8");
        await client.query(initSQL);
        Logging.logInfo("Init script executed successfully.");
    } catch (error) {
        Logging.logError("Failed to execute init script: " + error.message);
    } finally {
        client.release();
    }
}

await runInitScript();

(async () => {
    const client = await pool.connect();
    const testId = randomUUID();
    try {
        const lastKillers = JSON.stringify([
            { displayname: "max.bambus", avatarmedium: "https://avatars.fastly.steamstatic.com/96b9b714ea5f18400b2afdfcbf4f75bb83c99109_full.jpg" },
            { displayname: "Fear", avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg" },
            { displayname: "Waldbin", avatarmedium: "https://avatars.fastly.steamstatic.com/7c9f2c3c58df7e6c05a16ae03aa3344666c5f077_full.jpg" }
        ]);

        const lastKills = JSON.stringify([
            { displayname: "max.bambus", avatarmedium: "https://avatars.fastly.steamstatic.com/96b9b714ea5f18400b2afdfcbf4f75bb83c99109_full.jpg" },
            { displayname: "Fear", avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg" },
            { displayname: "Waldbin", avatarmedium: "https://avatars.fastly.steamstatic.com/7c9f2c3c58df7e6c05a16ae03aa3344666c5f077_full.jpg" }
        ]);

        await client.query(
            `INSERT INTO playerStatistics (id, kills, deaths, experience, playtime, roundsplayed, level, usedmedkits, usedcolas, pocketescapes, usedadrenaline, fakerank, lastkillers, lastkills)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb);`,
            [testId, 10, 5, 200, 300, 20, 3, 2, 1, 4, 0, 'TestRank', lastKillers, lastKills]
        );
        Logging.logInfo("Test row inserted successfully.");

        await client.query("DELETE FROM playerStatistics WHERE id = $1;", [testId]);
        Logging.logInfo("Test row deleted successfully.");
    } catch (error) {
        Logging.logCritical("Database test setup failed: " + error.message);
    } finally {
        client.release();
    }
})();

/**
 * Retrieves player statistics by player ID from the database.
 * 
 * @param {string} id - The ID of the player whose statistics are to be retrieved.
 * @returns {Promise<object | null>} A promise that resolves to an object containing the player's statistics, or null if not found.
 */
export async function getPlayerStatisticsById(id: string) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM playerStatistics WHERE id = $1',
            [id]
        );
        return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'kills' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} kills - Number of kills to set.
 */
export async function updateKillsById(id: string, kills: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, kills)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET kills = EXCLUDED.kills;`,
            [id, kills]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'deaths' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} deaths - Number of deaths to set.
 */
export async function updateDeathsById(id: string, deaths: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, deaths)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET deaths = EXCLUDED.deaths;`,
            [id, deaths]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'experience' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} experience - Experience points to set.
 */
export async function updateExperienceById(id: string, experience: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, experience)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET experience = EXCLUDED.experience;`,
            [id, experience]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'playtime' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} playtime - Playtime to set (in seconds or minutes depending on schema).
 */
export async function updatePlaytimeById(id: string, playtime: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, playtime)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET playtime = EXCLUDED.playtime;`,
            [id, playtime]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'roundsplayed' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} rounds - Rounds played to set.
 */
export async function updateRoundsPlayedById(id: string, rounds: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, roundsplayed)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET roundsplayed = EXCLUDED.roundsplayed;`,
            [id, rounds]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'level' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} level - Player level to set.
 */
export async function updateLevelById(id: string, level: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, level)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET level = EXCLUDED.level;`,
            [id, level]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'usedmedkits' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} value - Number of used medkits to set.
 */
export async function updateUsedMedkitsById(id: string, value: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, usedmedkits)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET usedmedkits = EXCLUDED.usedmedkits;`,
            [id, value]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'usedcolas' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} value - Number of used colas to set.
 */
export async function updateUsedColasById(id: string, value: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, usedcolas)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET usedcolas = EXCLUDED.usedcolas;`,
            [id, value]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'pocketescapes' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} value - Number of pocket escapes to set.
 */
export async function updatePocketEscapesById(id: string, value: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, pocketescapes)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET pocketescapes = EXCLUDED.pocketescapes;`,
            [id, value]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'usedadrenaline' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {number} value - Number of used adrenaline to set.
 */
export async function updateUsedAdrenalineById(id: string, value: number) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, usedadrenaline)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET usedadrenaline = EXCLUDED.usedadrenaline;`,
            [id, value]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'fakerank' value for a specific player ID.
 * @param {string} id - Player ID.
 * @param {string} rank - Fake rank string to set.
 */
export async function updateFakeRankById(id: string, rank: string) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, fakerank)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET fakerank = EXCLUDED.fakerank;`,
            [id, rank]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'lastkillers' JSON array for a specific player ID.
 * @param {string} id - Player ID.
 * @param {object[]} jsonArray - Array of killer data objects to set.
 */
export async function updateLastKillersById(id: string, jsonArray: object[]) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, lastkillers)
             VALUES ($1, $2::jsonb)
             ON CONFLICT (id) DO UPDATE SET lastkillers = EXCLUDED.lastkillers;`,
            [id, JSON.stringify(jsonArray)]
        );
    } finally {
        client.release();
    }
}

/**
 * Updates or inserts the 'lastkills' JSON array for a specific player ID.
 * @param {string} id - Player ID.
 * @param {object[]} jsonArray - Array of kill data objects to set.
 */
export async function updateLastKillsById(id: string, jsonArray: object[]) {
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO playerStatistics (id, lastkills)
             VALUES ($1, $2::jsonb)
             ON CONFLICT (id) DO UPDATE SET lastkills = EXCLUDED.lastkills;`,
            [id, JSON.stringify(jsonArray)]
        );
    } finally {
        client.release();
    }
}



export default { getPlayerStatisticsById };
