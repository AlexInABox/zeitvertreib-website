-- D1 Database Schema for zeitvertreib-data
-- This file contains the database schema for the player statistics

CREATE TABLE IF NOT EXISTS playerdata (
    id TEXT PRIMARY KEY,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    experience INTEGER DEFAULT 0,
    playtime INTEGER DEFAULT 0,
    roundsplayed INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    usedmedkits INTEGER DEFAULT 0,
    usedcolas INTEGER DEFAULT 0,
    pocketescapes INTEGER DEFAULT 0,
    usedadrenaline INTEGER DEFAULT 0,
    fakerank TEXT,
    lastkillers TEXT,
    lastkills TEXT
);

-- Sample data for testing (optional)
INSERT OR IGNORE INTO playerdata (
    id, kills, deaths, experience, playtime, roundsplayed, level,
    usedmedkits, usedcolas, pocketescapes, usedadrenaline,
    fakerank, lastkillers, lastkills
) VALUES (
    '76561198000000000@steam',
    100, 50, 5000, 3600, 25, 10,
    15, 8, 3, 5,
    NULL,
    '[{"displayname": "TestPlayer1", "avatarmedium": "https://example.com/avatar1.jpg"}]',
    '[{"displayname": "TestPlayer2", "avatarmedium": "https://example.com/avatar2.jpg"}]'
);
