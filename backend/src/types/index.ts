export interface SteamUser {
    steamid: string;
    personaname: string;
    profileurl: string;
    avatar: string;
    avatarmedium: string;
    avatarfull: string;
}

export interface SessionData {
    steamId: string;
    steamUser: SteamUser;
    createdAt: number;
    expiresAt: number;
}

export interface Statistics {
    username: string;
    kills: number;
    deaths: number;
    experience: number;
    playtime: number;
    avatarFull: string;
    roundsplayed: number;
    leaderboardposition: number;
    usedmedkits: number;
    usedcolas: number;
    pocketescapes: number;
    usedadrenaline: number;
    lastkillers: Array<{ displayname: string; avatarmedium: string }>;
    lastkills: Array<{ displayname: string; avatarmedium: string }>;
}

export interface PlayerData {
    id: string;
    experience?: number;
    playtime?: number;
    roundsplayed?: number;
    usedmedkits?: number;
    usedcolas?: number;
    pocketescapes?: number;
    usedadrenaline?: number;
    fakerank?: string;
}

export interface KillRecord {
    attacker: string;
    target: string;
    timestamp: number;
}
