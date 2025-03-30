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

export default { getPlayerStatisticsById };
