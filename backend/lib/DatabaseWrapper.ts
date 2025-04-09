import Cloudflare from 'cloudflare';
import Logging from './Logging.js';

const client = new Cloudflare({
    apiToken: process.env['CLOUDFLARE_API_TOKEN'],
});

const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
const databaseId = process.env['CLOUDFLARE_DATABASE_ID'];

async function query(sql, params = []) {
    const response = await client.d1.database.query(databaseId, {
        account_id: accountId,
        sql,
        params,
    });
    return response.result[0].results || [];
}

export async function getPlayerStatisticsById(id) {
    const rows = await query('SELECT * FROM playerdata WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
}

export async function updateKillsById(id, kills) {
    await query(
        `INSERT INTO playerdata (id, kills)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET kills = excluded.kills;`,
        [id, kills]
    );
}

export async function updateDeathsById(id, deaths) {
    await query(
        `INSERT INTO playerdata (id, deaths)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET deaths = excluded.deaths;`,
        [id, deaths]
    );
}

export async function updateExperienceById(id, experience) {
    await query(
        `INSERT INTO playerdata (id, experience)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET experience = excluded.experience;`,
        [id, experience]
    );
}

export async function updatePlaytimeById(id, playtime) {
    await query(
        `INSERT INTO playerdata (id, playtime)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET playtime = excluded.playtime;`,
        [id, playtime]
    );
}

export async function updateRoundsPlayedById(id, rounds) {
    await query(
        `INSERT INTO playerdata (id, roundsplayed)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET roundsplayed = excluded.roundsplayed;`,
        [id, rounds]
    );
}

export async function updateLevelById(id, level) {
    await query(
        `INSERT INTO playerdata (id, level)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET level = excluded.level;`,
        [id, level]
    );
}

export async function updateUsedMedkitsById(id, value) {
    await query(
        `INSERT INTO playerdata (id, usedmedkits)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET usedmedkits = excluded.usedmedkits;`,
        [id, value]
    );
}

export async function updateUsedColasById(id, value) {
    await query(
        `INSERT INTO playerdata (id, usedcolas)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET usedcolas = excluded.usedcolas;`,
        [id, value]
    );
}

export async function updatePocketEscapesById(id, value) {
    await query(
        `INSERT INTO playerdata (id, pocketescapes)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET pocketescapes = excluded.pocketescapes;`,
        [id, value]
    );
}

export async function updateUsedAdrenalineById(id, value) {
    await query(
        `INSERT INTO playerdata (id, usedadrenaline)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET usedadrenaline = excluded.usedadrenaline;`,
        [id, value]
    );
}

export async function updateFakeRankById(id, rank) {
    await query(
        `INSERT INTO playerdata (id, fakerank)
         VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET fakerank = excluded.fakerank;`,
        [id, rank]
    );
}

export async function updateLastKillersById(id, jsonArray) {
    await query(
        `INSERT INTO playerdata (id, lastkillers)
         VALUES (?, ?::json)
         ON CONFLICT (id) DO UPDATE SET lastkillers = excluded.lastkillers;`,
        [id, JSON.stringify(jsonArray)]
    );
}

export async function updateLastKillsById(id, jsonArray) {
    await query(
        `INSERT INTO playerdata (id, lastkills)
         VALUES (?, ?::json)
         ON CONFLICT (id) DO UPDATE SET lastkills = excluded.lastkills;`,
        [id, JSON.stringify(jsonArray)]
    );
}

export default {};
