CREATE TABLE IF NOT EXISTS playerStatistics (
    id TEXT PRIMARY KEY,
    kills INT DEFAULT 0,
    deaths INT DEFAULT 0,
    experience INT DEFAULT 0,
    playtime INT DEFAULT 0,
    roundsplayed INT DEFAULT 0,
    level INT DEFAULT 0,
    leaderboardposition INT DEFAULT 0,
    usedmedkits INT DEFAULT 0,
    usedcolas INT DEFAULT 0,
    pocketescapes INT DEFAULT 0,
    usedadrenaline INT DEFAULT 0,
    fakerank TEXT,
    lastkillers JSONB,
    lastkills JSONB
);