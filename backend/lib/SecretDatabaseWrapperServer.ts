/// Only ever expose this file's server to your local system. 
/// The endpoints here can be used to modify and READ the DATABASE without any authentication. 
/// Never expose this server to the internet. Keep it local.

import express from 'express';
import bodyParser from 'body-parser';
import {
    updateKillsById,
    updateDeathsById,
    updateExperienceById,
    updatePlaytimeById,
    updateRoundsPlayedById,
    updateLevelById,
    updateUsedMedkitsById,
    updateUsedColasById,
    updatePocketEscapesById,
    updateUsedAdrenalineById,
    updateFakeRankById,
    updateLastKillersById,
    updateLastKillsById,
} from './DatabaseWrapper.js'; // Adjust path if needed
import Logging from "./Logging.js";

const app = express();
app.use(bodyParser.json());

app.post('/update/kills', async (req, res) => {
    try {
        await updateKillsById(req.body.id, req.body.kills);
        Logging.logInfo(`Updated kills for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update kills: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/deaths', async (req, res) => {
    try {
        await updateDeathsById(req.body.id, req.body.deaths);
        Logging.logInfo(`Updated deaths for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update deaths: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/experience', async (req, res) => {
    try {
        await updateExperienceById(req.body.id, req.body.experience);
        Logging.logInfo(`Updated experience for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update experience: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/playtime', async (req, res) => {
    try {
        await updatePlaytimeById(req.body.id, req.body.playtime);
        Logging.logInfo(`Updated playtime for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update playtime: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/roundsplayed', async (req, res) => {
    try {
        await updateRoundsPlayedById(req.body.id, req.body.roundsplayed);
        Logging.logInfo(`Updated rounds played for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update rounds played: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/level', async (req, res) => {
    try {
        await updateLevelById(req.body.id, req.body.level);
        Logging.logInfo(`Updated level for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update level: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/usedmedkits', async (req, res) => {
    try {
        await updateUsedMedkitsById(req.body.id, req.body.usedmedkits);
        Logging.logInfo(`Updated used medkits for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update used medkits: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/usedcolas', async (req, res) => {
    try {
        await updateUsedColasById(req.body.id, req.body.usedcolas);
        Logging.logInfo(`Updated used colas for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update used colas: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/pocketescapes', async (req, res) => {
    try {
        await updatePocketEscapesById(req.body.id, req.body.pocketescapes);
        Logging.logInfo(`Updated pocket escapes for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update pocket escapes: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/usedadrenaline', async (req, res) => {
    try {
        await updateUsedAdrenalineById(req.body.id, req.body.usedadrenaline);
        Logging.logInfo(`Updated used adrenaline for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update used adrenaline: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/fakerank', async (req, res) => {
    try {
        await updateFakeRankById(req.body.id, req.body.fakerank);
        Logging.logInfo(`Updated fake rank for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update fake rank: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/lastkillers', async (req, res) => {
    try {
        await updateLastKillersById(req.body.id, req.body.lastkillers);
        Logging.logInfo(`Updated last killers for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update last killers: ${err.message}`);
        res.sendStatus(500);
    }
});

app.post('/update/lastkills', async (req, res) => {
    try {
        await updateLastKillsById(req.body.id, req.body.lastkills);
        Logging.logInfo(`Updated last kills for ${req.body.id}`);
        res.sendStatus(200);
    } catch (err) {
        Logging.logError(`Failed to update last kills: ${err.message}`);
        res.sendStatus(500);
    }
});

app.listen(3001, () => {
    Logging.logInfo('Local-only server running on http://localhost:3001');
});
