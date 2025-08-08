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
  snakehighscore: number;
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
  snakehighscore?: number;
  fakerank?: string;
}

export interface KillRecord {
  attacker: string;
  target: string;
  timestamp: number;
}

export interface FinancialTransaction {
  id?: number;
  transaction_type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  transaction_date: string;
  created_at?: string;
  created_by?: string;
  reference_id?: string;
  notes?: string;
}

export interface RecurringTransaction {
  id?: number;
  transaction_type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date?: string;
  next_execution: string;
  is_active: boolean;
  created_at?: string;
  created_by?: string;
  reference_id?: string;
  notes?: string;
  last_executed?: string;
}
