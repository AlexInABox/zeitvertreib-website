CREATE TABLE IF NOT EXISTS playerStatistics (
    id TEXT PRIMARY KEY,
    kills INT DEFAULT 0,
    deaths INT DEFAULT 0,
    experience INT DEFAULT 0,
    playtime INT DEFAULT 0,
    roundsPlayed INT DEFAULT 0,
    level INT DEFAULT 0,
    usedMedkits INT DEFAULT 0,
    usedColas INT DEFAULT 0,
    pocketEscapes INT DEFAULT 0,
    usedAdrenaline INT DEFAULT 0,
    fakerank TEXT,
    lastKillers TEXT[],
    lastKills TEXT[]
);