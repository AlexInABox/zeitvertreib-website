/**
 * Shared API types for frontend & backend communication.
 * These types define the shape of request and response payloads
 * for all API endpoints.
 */

// ============================================================================
// Common / Auth Types
// ============================================================================

export interface SteamUser {
  steamId: string;
  username: string;
  avatarUrl: string;
}

export interface SessionData {
  steamId: string;
  steamUser: SteamUser;
  createdAt: number;
  expiresAt: number;
}

export interface PlayerData {
  id: string;
  discordId?: string | null;
  experience?: number;
  playtime?: number;
  roundsplayed?: number;
  usedmedkits?: number;
  usedcolas?: number;
  pocketescapes?: number;
  usedadrenaline?: number;
  snakehighscore?: number;
  fakerank?: string | null;
  fakerank_color?: string;
  killcount?: number;
  deathcount?: number;
  fakerank_until?: number;
  fakerankadmin_until?: number;
  fakerankoverride_until?: number;
  redeemed_codes?: string;
  slotSpins?: number;
  slotWins?: number;
  slotLosses?: number;
  luckyWheelSpins?: number;
  luckyWheelWins?: number;
  luckyWheelLosses?: number;
  username?: string;
}

// ============================================================================
// Auth Endpoints
// ============================================================================

/** GET /auth/me response */
export interface GetUserResponse {
  user: SteamUser;
  playerData: PlayerData | null;
  isModerator: boolean;
  isDonator: boolean;
  isVip: boolean;
  isBooster: boolean;
  isSprayBanned: boolean;
  sprayBanReason: string | null;
  sprayBannedBy: string | null;
  isFakerankBanned: boolean;
  fakerankBanReason: string | null;
  fakerankBannedBy: string | null;
}

/** POST /auth/logout response */
export interface LogoutResponse {
  success: boolean;
}

/** POST /auth/generate-login-secret request (body) */
export interface GenerateLoginSecretRequest {
  steamId: string;
}

/** POST /auth/generate-login-secret response */
export interface GenerateLoginSecretResponse {
  secret: string;
  loginUrl: string;
  steamId: string;
  expiresIn: string;
}

/** GET /auth/login-with-secret response */
export interface LoginWithSecretResponse {
  success: boolean;
  token: string;
  user: SteamUser;
}

// ============================================================================
// Stats Types
// ============================================================================

export interface KillRecord {
  attacker: string;
  target: string;
  timestamp: number;
}

export interface KillerInfo {
  displayname: string;
  avatarmedium: string;
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
  fakerank_until?: number;
  fakerankadmin_until?: number;
  fakerankoverride_until?: number;
  lastkillers: KillerInfo[];
  lastkills: KillerInfo[];
}

/** GET /stats response */
export interface GetStatsResponse {
  stats: Statistics;
}

// ============================================================================
// Leaderboard Types
// ============================================================================

export interface LeaderboardEntry {
  name: string;
  value: number;
  rank: number;
  discordId: string | null;
}

/** GET /leaderboard response */
export interface GetLeaderboardResponse {
  snake: LeaderboardEntry[];
  kills: LeaderboardEntry[];
  deaths: LeaderboardEntry[];
  zvcoins: LeaderboardEntry[];
  playtime: LeaderboardEntry[];
  rounds: LeaderboardEntry[];
  medkits: LeaderboardEntry[];
  colas: LeaderboardEntry[];
  pocketescapes: LeaderboardEntry[];
  adrenaline: LeaderboardEntry[];
  slotSpins: LeaderboardEntry[];
  slotWins: LeaderboardEntry[];
  luckyWheelWins: LeaderboardEntry[];
}

// ============================================================================
// Fakerank Types
// ============================================================================

export type FakerankColor =
  | 'pink'
  | 'red'
  | 'brown'
  | 'silver'
  | 'default'
  | 'light_green'
  | 'crimson'
  | 'cyan'
  | 'aqua'
  | 'deep_pink'
  | 'tomato'
  | 'yellow'
  | 'magenta'
  | 'blue_green'
  | 'orange'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'carmine'
  | 'nickel'
  | 'mint'
  | 'army_green'
  | 'pumpkin';

/** GET /fakerank request params*/
/** When theres no userids array present, use the userid from the session token! */
export interface FakerankGetRequest {
  userids?: string[];
}

/** GET /fakerank response */
/** Regardless of the amount of requested fakeranks, always return an array */
export interface FakerankGetResponse {
  fakeranks: {
    userid: string;
    id: number;
    text: string;
    color: FakerankColor;
  }[];
}

/** POST /fakerank request body */
export interface FakerankPostRequest {
  text: string;
  color: FakerankColor;
}

/** DELETE /fakerank request body */
export interface FakerankDeleteRequest {
  id: number;
}

/** GET /fakerank/colors request response */
export interface FakerankColorsResponse {
  teamColors: FakerankColor[];
  vipColors: FakerankColor[];
  donatorColors: FakerankColor[];
  boosterColors: FakerankColor[];
  otherColors: FakerankColor[];
}

// ============================================================================
// Fakerank Admin Types
// ============================================================================

export interface UserFakerank {
  steamId: string;
  username: string;
  avatarFull: string | null;
  fakerank: string | null;
  fakerank_color: FakerankColor;
  fakerank_until: number;
  hasFakerankAccess: boolean;
}

/** GET /fakerank-admin/user response */
export interface GetUserFakerankResponse extends UserFakerank { }

/** POST /fakerank-admin/user request */
export interface SetUserFakerankRequest {
  steamId: string;
  fakerank: string | null;
  fakerank_color?: FakerankColor;
  isOverride?: boolean;
  overrideDurationHours?: number;
}

/** POST /fakerank-admin/user response */
export interface SetUserFakerankResponse {
  success: boolean;
  steamId: string;
  fakerank: string | null;
  fakerank_color: FakerankColor;
  isOverride: boolean;
  overrideDurationHours?: number;
}

export interface BlacklistItem {
  id: number;
  word: string;
  createdAt: string;
}

export interface WhitelistItem {
  id: number;
  word: string;
  createdAt: string;
}

/** GET /fakerank-admin/blacklist response */
export interface GetBlacklistResponse {
  blacklistedWords: BlacklistItem[];
  count: number;
}

/** POST /fakerank-admin/blacklist request */
export interface AddToBlacklistRequest {
  word: string;
}

/** POST /fakerank-admin/blacklist response */
export interface AddToBlacklistResponse {
  success: boolean;
  id: number;
}

/** DELETE /fakerank-admin/blacklist request */
export interface RemoveFromBlacklistRequest {
  word: string;
}

/** DELETE /fakerank-admin/blacklist response */
export interface RemoveFromBlacklistResponse {
  success: boolean;
}

/** GET /fakerank-admin/whitelist response */
export interface GetWhitelistResponse {
  whitelistedWords: WhitelistItem[];
  count: number;
}

/** POST /fakerank-admin/whitelist request */
export interface AddToWhitelistRequest {
  word: string;
}

/** POST /fakerank-admin/whitelist response */
export interface AddToWhitelistResponse {
  success: boolean;
  id: number;
}

/** DELETE /fakerank-admin/whitelist request */
export interface RemoveFromWhitelistRequest {
  word: string;
}

/** DELETE /fakerank-admin/whitelist response */
export interface RemoveFromWhitelistResponse {
  success: boolean;
}

export interface AdminPlayerInfo {
  id: string;
  steamId: string;
  personaname: string;
  username: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarFull: string;
  fakerank: string | null;
  fakerank_color: FakerankColor;
  fakerankallowed: boolean;
  experience: number;
  playtime: number;
  roundsplayed: number;
  usedmedkits: number;
  usedcolas: number;
  pocketescapes: number;
  usedadrenaline: number;
  snakehighscore: number;
  killcount: number;
  deathcount: number;
  fakerankadmin: boolean;
  isCurrentlyOnline?: boolean;
  Team?: string;
}

/** GET /fakerank-admin/fakeranks response */
export interface GetPaginatedFakeranksResponse {
  data: AdminPlayerInfo[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  currentPlayersOnline: number;
  uniquePlayerNames: number;
}

// ============================================================================
// Slot Machine Types
// ============================================================================

export interface SlotPayoutEntry {
  symbol: string;
  name: string;
  condition: string;
  payout: number;
  tier: 'jackpot' | 'big_win' | 'small_win' | 'mini_win';
  description: string;
}

/** GET /slotmachine/info response */
export interface SlotMachineInfoResponse {
  cost: number;
  payoutTable: SlotPayoutEntry[];
  symbols: string[];
  description: string;
}

/** POST /slotmachine request */
export interface SlotMachinePlayRequest {
  // No body required - cost is fixed
}

/** POST /slotmachine response */
export interface SlotMachinePlayResponse {
  slots: [string, string, string];
  payout: number;
  type: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss';
  message: string;
  newBalance: number;
}

// ============================================================================
// Lucky Wheel Types
// ============================================================================

export interface LuckyWheelPayoutEntry {
  multiplier: number;
  weight: number;
}

/** GET /luckywheel/info response */
export interface LuckyWheelInfoResponse {
  minBet: number;
  maxBet: number;
  payoutTable: LuckyWheelPayoutEntry[];
  description: string;
}

/** POST /luckywheel request */
export interface LuckyWheelPlayRequest {
  bet: number;
}

/** POST /luckywheel response */
export interface LuckyWheelPlayResponse {
  multiplier: number;
  betAmount: number;
  payout: number;
  netChange: number;
  newBalance: number;
  isWin: boolean;
}

// ============================================================================
// Financial Types
// ============================================================================

export type TransactionType = 'income' | 'expense';
export type TransactionFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Financial types removed — the backend no longer exposes `/financial` endpoints.
/** GET /cases response */
export interface ListCasesResponse {
  folders: string[];
}

/** GET /cases/:caseId response */
export interface GetCaseResponse {
  files: string[];
  caseId: string;
}

/** GET /cases/upload response */
export interface GetUploadUrlResponse {
  url: string;
  method: string;
  filename: string;
  fileUrl: string;
  expiresIn: number;
}

// ============================================================================
// Redeemables Types
// ============================================================================

/** POST /redeemables/redeem request */
export interface RedeemCodeRequest {
  code: string;
}

/** POST /redeemables/redeem response */
export interface RedeemCodeResponse {
  success: boolean;
  credits: number;
  message: string;
}

// ============================================================================
// Advent Calendar Types
// ============================================================================

export interface AdventCalendarDoor {
  day: number;
  opened: boolean;
  redeemedAt: number;
  reward?: number; // Only present for opened doors
}

/** GET /adventcalendar response */
export interface GetAdventCalendarResponse {
  calendar: {
    doors: AdventCalendarDoor[];
  } | null; // null when not December
}

/** POST /adventcalendar/redeem request */
export interface RedeemAdventDoorRequest {
  day: number;
}

/** POST /adventcalendar/redeem response */
export interface RedeemAdventDoorResponse {
  success: boolean;
  day: number;
  reward: number;
  newZvc: number;
}

// ============================================================================
// Common Error Response
// ============================================================================

export interface ApiErrorResponse {
  error: string;
  details?: string;
}

// ============================================================================
// Swapped Role Swap Types
// ============================================================================

/** POST /swapped/ request */
export interface SwappedRequest {
  userid: string;
  price: number;
}

/** POST /swapped/ response */
export interface SwappedResponse {
  success: boolean;
}

// ============================================================================
// ZVC Types
// ============================================================================

/** GET /zvc response */
export interface ZvcGetResponse {
  users: {
    userid: string;
    zvc: number;
  }[];
}

/** POST /transfer-zvc request */
export interface TransferZvcRequest {
  recipient: string;
  amount: number;
}

/** POST /transfer-zvc response */
export interface TransferZvcResponse {
  success: boolean;
  message: string;
  transfer: {
    amount: number;
    tax: number;
    totalCost: number;
    recipient: string;
    senderNewBalance: number;
    recipientNewBalance: number;
  };
}

// ============================================================================
// Stats Types
// ============================================================================

/** POST /stats request */
export interface StatsPostRequest {
  players: {
    userid: string;
    timePlayed?: number;
    roundsPlayed?: number;
    medkits?: number;
    colas?: number;
    adrenaline?: number;
    pocketEscapes?: number;
    zvc?: number;
    snakeScore?: number;
    fakeRankAllowed?: boolean;
    fakeRankAdmin?: boolean;
    username?: string;
  }[];
  kills: {
    Attacker: string;
    Target: string;
    Timestamp: number;
  }[];
}

/** POST /stats response */
export interface StatsPostResponse {
  success: boolean;
}

// ============================================================================
// Playerlist Types
// ============================================================================

export interface PlayerlistPostRequestItem {
  Name: string;
  UserId: string;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
  Fakerank?: string;
  FakerankColor?: string;
}

/** POST /playerlist request*/
export interface PlayerlistPostRequest {
  players: PlayerlistPostRequestItem[];
}

// ============================================================================
// Spray Types
// ============================================================================

type Base64URLString = string;

/** POST /spray request */
export interface SprayPostRequest {
  name: string;
  full_res: Base64URLString;
  text_toy: string;
}

/** DELETE /spray request */
export interface SprayDeleteRequest {
  id: number;
}

/** GET /spray request params*/
export interface SprayGetRequest {
  userids?: string[];
  full_res?: boolean;
  text_toy?: boolean;
}

/** GET /spray response */
export interface SprayGetResponseItem {
  sprays: {
    userid: string;
    id: number;
    name: string;
    full_res?: Base64URLString;
    text_toy?: string;
  }[];
}

/** GET /spray/rules response */
export interface SprayRulesGetResponse {
  rules_en: string[];
  rules_de: string[];
}

// ============================================================================
// Paysafe Card Submission Types
// ============================================================================

export type PaysafeCardSubmissionStatus = 'pending' | 'approved' | 'rejected';

/** POST /paysafe request */
export interface PaysafeCardPostRequest {
  cardCode: string;
}

/** GET /paysafe response */
export interface PaysafeCardGetResponse {
  submissions: {
    id: number;
    cardCodeTruncated: string;
    submittedAt: number;
    processedAt: number;
    status: PaysafeCardSubmissionStatus;
    amount: number;
  }[];
}
