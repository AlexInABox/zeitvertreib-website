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
export interface GetUserFakerankResponse extends UserFakerank {}

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
// Code Redemption Types
// ============================================================================

/** POST /redeem-code request */
export interface RedeemCodeRequest {
  code: string;
}

/** POST /redeem-code response */
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

// ============================================================================
// Sessions Info Types
// ============================================================================

/** GET /sessions response */
export interface SessionsInfoGetResponse {
  sessions: {
    id: string;
    createdAt: number;
    lastLoginAt: number;
    expiresAt: number;
    userAgent: string;
    ipAddress: string;
  }[];
}

/** DELETE /sessions request */
export interface SessionsInfoDeleteRequest {
  id: string[];
}

// ============================================================================
// Takeout Types
// ============================================================================

/** GET /takeout response */
export interface TakeoutGetResponse {
  lastRequestedAt: number;
}

/** POST /takeout request */
export interface TakeoutPostRequest {
  email: string;
}

// ============================================================================
// Deletion Types
// ============================================================================

/** GET /deletion response */
export interface DeletionGetResponse {
  enabledAt: number;
}

/** POST /deletion request */
export interface DeletionPostRequest {
  enabledAt: number; // 0 to disable, any other value to enable
}

// ============================================================================
// Birthday Types
// ============================================================================

/** GET /birthday response */
export interface BirthdayGetResponse {
  birthday: {
    day: number;
    month: number;
    year?: number; // may be undefined if user doesn't want to share year
  } | null;
  lastUpdated: number | null;
}

/** POST /birthday request */
export interface BirthdayPostRequest {
  day: number;
  month: number;
  year?: number; // optional, user may choose not to share year
}

/** DELETE /birthday request */
export interface BirthdayDeleteRequest {}

// ============================================================================
// Chicken Cross Types
// ============================================================================

/** GET /chickencross/info response */
export interface ChickenCrossInfoResponse {
  minBet: number;
  maxBet: number;
}

/** GET /chickencross request params */
export interface ChickenCrossGetRequest {
  seed: number;
}

/** GET /chickencross response */
export interface ChickenCrossGetResponse {
  seed: number;
  initialWager: number;
  currentPayout: number;
  step: number;
  state: 'ACTIVE' | 'LOST' | 'CASHED_OUT';
  lastUpdatedAt: number;
}

/** POST /chickencross request */
// Send intent here to play chicken cross game
export interface ChickenCrossPostRequest {
  seed?: number;
  bet?: number;
  intent: 'MOVE' | 'CASHOUT';
}

/** POST /chickencross response */
export interface ChickenCrossPostResponse {
  seed: number;
  state: 'ACTIVE' | 'LOST' | 'CASHED_OUT';
  currentPayout: number;
}

//** GET /chickencross/active response */
export interface ChickenCrossActiveResponse {
  activeGameSeed?: number;
}

// ============================================================================
// Cases Types
// ============================================================================

export type CaseCategory =
  | 'Beleidigungen'
  | 'Supportflucht'
  | 'Team-Trolling'
  | 'Soundboard'
  | 'Report-Abuse'
  | 'Camping'
  | 'Rollenflucht'
  | 'Bug-Abusing'
  | 'Diebstahl'
  | 'Teaming'
  | 'Gefesselte Klassen'
  | 'Ban-Evasion'
  | 'Rundenende'
  | 'Sonstiges';

export interface CaseListItem {
  caseId: string;
  title: string | null;
  description: string | null;
  category: CaseCategory;
  createdBy: {
    discordId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
  };
  createdAt: number;
  lastUpdatedAt: number;
  linkedSteamIds: string[];
}

/** GET /cases/upload?case={caseId}&extension={ext} request params */
export interface CaseFileUploadGetRequest {
  case: string;
  extension?: string;
}

/** GET /cases/upload response */
export interface CaseFileUploadGetResponse {
  url: string;
  method: 'PUT';
}

/** GET /cases request params (paginated mode) */
export interface ListCasesGetRequest {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'lastUpdatedAt';
  sortOrder?: 'asc' | 'desc';
  createdByDiscordId?: string;
  category: CaseCategory;
}

/** GET /cases request params (steamId mode — returns ALL, no pagination) */
export interface ListCasesBySteamIdGetRequest {
  steamId: string;
}

/** GET /cases response (paginated) */
export interface ListCasesGetResponse {
  cases: CaseListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/** GET /cases response (steamId mode — no pagination) */
export interface ListCasesBySteamIdGetResponse {
  cases: CaseListItem[];
}

/** GET /cases/metadata?case={caseId} request params */
export interface GetCaseMetadataGetRequest {
  case: string;
}

/** GET /cases/metadata response */
export interface GetCaseMetadataGetResponse {
  id: string;
  caseId: string;
  title: string | null;
  description: string | null;
  category: CaseCategory;
  createdBy: {
    discordId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
  };
  createdAt: number;
  lastUpdatedAt: number;
  linkedUsers: {
    steamId: string;
    username: string;
    avatarUrl: string;
  }[];
  files: {
    name: string;
    size: number;
    createdAt: number;
    url: string;
  }[];
}

/** POST /cases — no request body */
export interface CreateCasePostRequest {}

/** POST /cases response */
export interface CreateCasePostResponse {
  caseId: string;
}

/** PUT /cases/metadata?case={caseId} request params */
export interface UpdateCaseMetadataPutRequestParams {
  case: string;
}

/** PUT /cases/metadata request body */
export interface UpdateCaseMetadataPutRequest {
  title?: string;
  description?: string;
  category: CaseCategory;
  linkedSteamIds?: string[];
}

/** PUT /cases/metadata response */
export interface UpdateCaseMetadataPutResponse {
  success: boolean;
  caseId: string;
}

// ============================================================================
// Roulette Types
// ============================================================================

export type RouletteBetType = 'red' | 'black' | 'odd' | 'even' | 'number' | '1to18' | '19to36';

/** GET /roulette/info response */
export interface RouletteGetInfoResponse {
  minBet: number;
  maxBet: number;
}

/** POST /roulette request */
export interface RoulettePostRequest {
  bet: number;
  type: RouletteBetType;
  value?: number;
}

/** POST /roulette response */
export interface RoulettePostResponse {
  spinResult: number;
  won: boolean;
  payout: number;
}

// ============================================================================
// Z.E.I.T. Types
// ============================================================================

/** GET /zeit request params */
export interface ZeitGetRequest {
  steamid?: string;
  discordid?: string;
}

/** GET /zeit response */
export interface ZeitGetResponse {
  steam: {
    id: string;
    username: string;
    avatar: string;
  };
  discord: {
    id: string;
    username: string;
    avatar: string;
  } | null;
  zvc: number;
  playtime: number;
  roundsplayed: number;
  fakerank: {
    text: string;
    color: FakerankColor;
  } | null;
  fakerankBanned: boolean;
  fakerankBanReason?: string;
  fakerankBannedByDiscordId?: string;
  sprays: {
    id: number;
    name: string;
    full_res: Base64URLString;
  }[];
  sprayBanned: boolean;
  sprayBanReason?: string;
  sprayBannedByDiscordId?: string;
  cedmodBans: {
    id: number;
    reason: string;
    bannedAt: number;
    duration: number;
    issuer: string;
  }[];
  cedmodActivelyBanned: boolean;
  cedmodWarns: {
    id: number;
    reason: string;
    warnedAt: number;
    issuer: string;
  }[];
  linkedCases: {
    caseId: string;
    title: string;
    category: CaseCategory;
    createdAt: number;
  }[];
}

// ============================================================================
// Quest Types
// ============================================================================

// Base categories for daily quests
export type QuestCategory = 'medipacks' | 'playtime' | 'kills' | 'colas' | 'rounds' | 'pocketescapes' | 'adrenaline';

export interface QuestDefinition {
  category: QuestCategory;
  targetValue: number;
  coinReward: number;
  description: string;
}

export interface QuestProgress {
  id: number;
  category: QuestCategory;
  description: string;
  targetValue: number;
  currentProgress: number;
  coinReward: number;
  isCompleted: boolean;
  claimedAt: number;
}

/** GET /quests/today response */
export interface GetQuestsResponse {
  dailyQuests: QuestProgress[];
  weeklyQuests: QuestProgress[];
}

/** POST /quests/claim-reward request body */
export interface ClaimQuestRewardRequest {
  questId: number;
}

/** POST /quests/claim-reward response */
export interface ClaimQuestRewardResponse {
  success: boolean;
  coinsAwarded: number;
  message: string;
}

// ============================================================================
// Reporting Types
// ============================================================================

export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

/** POST /reports — create a new report (no auth required) */
export interface CreateReportPostRequest {
  steamId: string;
  reportedSteamId: string;
  description: string;
}

/** POST /reports response */
export interface CreateReportPostResponse {
  reportToken: string;
  message: string;
}

/** GET /reports/upload?report={reportToken}&extension={ext} — get presigned upload URL */
export interface ReportFileUploadGetResponse {
  url: string;
  method: string;
}

/** GET /reports?token={reportToken} — view a report by token (no auth) */
export interface GetReportByTokenResponse {
  reportToken: string;
  steamId: string;
  reportedSteamId: string;
  description: string;
  status: ReportStatus;
  createdAt: number;
  files: string[];
}

/** GET /reports/list — list all reports (staff only) */
export interface ListReportsGetResponse {
  reports: ReportListItem[];
}

export interface ReportListItem {
  reportToken: string;
  steamId: string;
  reportedSteamId: string;
  description: string;
  status: ReportStatus;
  createdAt: number;
  linkedCaseId: string | null;
  fileCount: number;
}

/** PUT /reports/status — update report status (staff only) */
export interface UpdateReportStatusPutRequest {
  reportToken: string;
  status: ReportStatus;
  linkedCaseId?: string;
}

/** PUT /reports/status response */
export interface UpdateReportStatusPutResponse {
  success: boolean;
  message: string;
}

/** GET /reports/warns?steamId={steamId} — fetch CedMod warns for a Steam ID (staff only) */
export interface GetReportWarnsResponse {
  warns: {
    id: number;
    reason: string;
    warnedAt: number;
    issuer: string;
  }[];
}

/** GET /reports/by-reported-player?steamId={steamId} — fetch reports for a reported player (staff only) */
export interface GetReportsByReportedPlayerResponse {
  reports: ReportWithFilesItem[];
}

export interface ReportWithFilesItem {
  reportToken: string;
  steamId: string;
  reporterUsername: string;
  reporterAvatarUrl: string;
  reportedSteamId: string;
  reportedUsername: string;
  reportedAvatarUrl: string;
  description: string;
  status: ReportStatus;
  createdAt: number;
  fileCount: number;
  files: string[];
}

/** GET /reports/cedmod-lookup?steamId={steamId} — fetch reporter's last in-game report from CedMod (public) */
export interface CedModLastReportResponse {
  found: boolean;
  reportedSteamId: string | null;
  reason: string | null;
  reportedAt: number | null;
}
