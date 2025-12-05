import path from 'path';

// Guild and Role IDs
export const ZEITVERTREIB_GUILD_ID = '888946306872131604';
export const BOOSTER_ROLE_IDs = ['890641971486535722'];
export const DONATOR_ROLE_IDs = ['1356624307928825927', '1429741303842734080'];
export const TEAM_MEMBER_ROLE_IDs = ['997161653542068225'];

// Channel IDs
export const SUPPORT_CHANNEL_ID = '889505316994166825';

// Ticket detection phrases
export const TICKET_PHRASES = [
  ['wie', 'entbann'],
  ['wo', 'entbann'],
  ['wo', 'melde'],
  ['wie', 'melde'],
  ['wo', 'report'],
  ['wie', 'report'],
  ['wo', 'beschwer'],
  ['wie', 'beschwer'],
  ['ticket'],
  ['support'],
];

// Member tracking
export const DATA_FILE_PATH = path.join(__dirname, '../../data/members.json');
export const TRACKING_INTERVAL_MS = 60 * 1000; // 1 minute
