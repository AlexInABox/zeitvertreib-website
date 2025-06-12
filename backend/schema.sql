-- D1 Database Schema for zeitvertreib-data
-- This file contains the database schema for the player statistics

CREATE TABLE IF NOT EXISTS playerdata (
    id TEXT PRIMARY KEY,
    experience INTEGER DEFAULT 0,
    playtime INTEGER DEFAULT 0,
    roundsplayed INTEGER DEFAULT 0,
    usedmedkits INTEGER DEFAULT 0,
    usedcolas INTEGER DEFAULT 0,
    pocketescapes INTEGER DEFAULT 0,
    usedadrenaline INTEGER DEFAULT 0,
    fakerank TEXT
);

-- Kills table to track all kill events
CREATE TABLE IF NOT EXISTS kills (
    attacker TEXT,
    target TEXT,
    timestamp INTEGER
);

-- Sample data for testing (optional)
INSERT OR IGNORE INTO playerdata (
    id, experience, playtime, roundsplayed,
    usedmedkits, usedcolas, pocketescapes, usedadrenaline,
    fakerank
) VALUES (
    '76561198354414854@steam',
    12500, 7200, 45,
    25, 18, 7, 12,
    'Elite Commander'
);

-- Sample kills data for testing
INSERT OR IGNORE INTO kills (attacker, target, timestamp) VALUES
    ('76561198354414854@steam', '76561198000000001@steam', 1703980800),
    ('76561198354414854@steam', '76561198000000002@steam', 1703981200),
    ('76561198354414854@steam', 'anonymous', 1703981600),
    ('76561198354414854@steam', '76561198000000003@steam', 1703982000),
    ('76561198354414854@steam', '76561198000000004@steam', 1703982400),
    ('76561198000000005@steam', '76561198354414854@steam', 1703983000),
    ('76561198000000006@steam', '76561198354414854@steam', 1703983400),
    ('anonymous', '76561198354414854@steam', 1703983800),
    ('76561198000000007@steam', '76561198354414854@steam', 1703984200),
    ('76561198000000008@steam', '76561198354414854@steam', 1703984600);
