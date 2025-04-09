import Cloudflare from 'cloudflare';

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
    return response.result || [];
}

export async function getPlayerStatisticsById(id) {
    const rows = await query('SELECT * FROM playerdata WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
}

function buildUpdateQuery(column) {
    return `INSERT INTO playerdata (id, ${column}) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET ${column} = ?;`;
}

export async function updateKillsById(id, kills) {
    await query(buildUpdateQuery('kills'), [id, kills, kills]);
}

export async function updateDeathsById(id, deaths) {
    await query(buildUpdateQuery('deaths'), [id, deaths, deaths]);
}

export async function updateExperienceById(id, experience) {
    await query(buildUpdateQuery('experience'), [id, experience, experience]);
}

export async function updatePlaytimeById(id, playtime) {
    await query(buildUpdateQuery('playtime'), [id, playtime, playtime]);
}

export async function updateRoundsPlayedById(id, rounds) {
    await query(buildUpdateQuery('roundsplayed'), [id, rounds, rounds]);
}

export async function updateLevelById(id, level) {
    await query(buildUpdateQuery('level'), [id, level, level]);
}

export async function updateUsedMedkitsById(id, value) {
    await query(buildUpdateQuery('usedmedkits'), [id, value, value]);
}

export async function updateUsedColasById(id, value) {
    await query(buildUpdateQuery('usedcolas'), [id, value, value]);
}

export async function updatePocketEscapesById(id, value) {
    await query(buildUpdateQuery('pocketescapes'), [id, value, value]);
}

export async function updateUsedAdrenalineById(id, value) {
    await query(buildUpdateQuery('usedadrenaline'), [id, value, value]);
}

export async function updateFakeRankById(id, rank) {
    await query(buildUpdateQuery('fakerank'), [id, rank, rank]);
}

export async function updateLastKillersById(id, jsonArray) {
    const json = JSON.stringify(jsonArray);
    await query(buildUpdateQuery('lastkillers'), [id, json, json]);
}

export async function updateLastKillsById(id, jsonArray) {
    const json = JSON.stringify(jsonArray);
    await query(buildUpdateQuery('lastkills'), [id, json, json]);
}

export default {};
