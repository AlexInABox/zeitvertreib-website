import { sqliteTable, AnySQLiteColumn, check, text, integer, numeric, index, foreignKey } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const kills = sqliteTable("kills", {
  attacker: text(),
  target: text(),
  timestamp: integer(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const playerdata = sqliteTable("playerdata", {
  id: text().primaryKey().notNull(),
  discordId: text(),
  experience: integer().default(0),
  playtime: integer().default(0),
  roundsplayed: integer().default(0),
  usedmedkits: integer().default(0),
  usedcolas: integer().default(0),
  pocketescapes: integer().default(0),
  usedadrenaline: integer().default(0),
  fakerank: text(),
  snakehighscore: integer().default(0),
  killcount: integer().default(0),
  deathcount: integer().default(0),
  fakerankUntil: integer("fakerank_until").default(0),
  fakerankColor: text("fakerank_color").default("default"),
  fakerankadminUntil: integer("fakerankadmin_until").default(0),
  redeemedCodes: text("redeemed_codes").default(""),
  fakerankoverrideUntil: integer("fakerankoverride_until").default(0),
  username: text().default(""),
  slotSpins: integer().default(0).notNull(),
  slotWins: integer().default(0).notNull(),
  slotLosses: integer().default(0).notNull(),
  migratedCedmod: integer("migrated_cedmod"),
  firstSeen: integer("first_seen"),
  lastSeen: integer("last_seen"),
  luckyWheelSpins: integer().default(0).notNull(),
  luckyWheelWins: integer().default(0).notNull(),
  luckyWheelLosses: integer().default(0).notNull(),
  rouletteSpins: integer().default(0).notNull(),
  rouletteWins: integer().default(0).notNull(),
  rouletteLosses: integer().default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const discordInfo = sqliteTable("discord_info", {
  discordId: text().primaryKey().notNull(),
  username: text().notNull(),
  displayName: text("display_name").notNull(),
  boosterSince: integer("booster_since").default(0).notNull(),
  donatorSince: integer("donator_since").default(0).notNull(),
  teamSince: integer("team_since").default(0).notNull(),
  vipSince: integer("vip_since").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const redemptionCodes = sqliteTable("redemption_codes", {
  code: text().primaryKey().notNull(),
  credits: integer().notNull(),
  remainingUses: integer("remaining_uses").notNull(),
  createdAt: text("created_at").default("sql`(CURRENT_TIMESTAMP)`"),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const loginSecrets = sqliteTable("login_secrets", {
  secret: text().primaryKey().notNull(),
  steamId: text("steam_id").notNull(),
  createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  expiresAt: integer("expires_at").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const adventCalendar = sqliteTable("advent_calendar", {
  userId: text("user_id").primaryKey().notNull(),
  day1: integer("day_1").default(0).notNull(),
  day2: integer("day_2").default(0).notNull(),
  day3: integer("day_3").default(0).notNull(),
  day4: integer("day_4").default(0).notNull(),
  day5: integer("day_5").default(0).notNull(),
  day6: integer("day_6").default(0).notNull(),
  day7: integer("day_7").default(0).notNull(),
  day8: integer("day_8").default(0).notNull(),
  day9: integer("day_9").default(0).notNull(),
  day10: integer("day_10").default(0).notNull(),
  day11: integer("day_11").default(0).notNull(),
  day12: integer("day_12").default(0).notNull(),
  day13: integer("day_13").default(0).notNull(),
  day14: integer("day_14").default(0).notNull(),
  day15: integer("day_15").default(0).notNull(),
  day16: integer("day_16").default(0).notNull(),
  day17: integer("day_17").default(0).notNull(),
  day18: integer("day_18").default(0).notNull(),
  day19: integer("day_19").default(0).notNull(),
  day20: integer("day_20").default(0).notNull(),
  day21: integer("day_21").default(0).notNull(),
  day22: integer("day_22").default(0).notNull(),
  day23: integer("day_23").default(0).notNull(),
  day24: integer("day_24").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const sprayBans = sqliteTable("spray_bans", {
  userid: text().primaryKey(),
  bannedAt: integer("banned_at").default(0).notNull(),
  reason: text().notNull(),
  bannedByDiscordId: text("banned_by_discord_id").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const deletedSprays = sqliteTable("deleted_sprays", {
  sha256: text().primaryKey().notNull(),
  uploadedByUserid: text("uploaded_by_userid").notNull(),
  deletedByDiscordId: text("deleted_by_discord_id").notNull(),
  reason: text().notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const sprays = sqliteTable("sprays", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  userid: text().notNull(),
  name: text().notNull(),
  sha256: text().notNull(),
  uploadedAt: integer("uploaded_at").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const steamCache = sqliteTable("steam_cache", {
  steamId: text("steam_id").primaryKey().notNull(),
  username: text().notNull(),
  avatarUrl: text("avatar_url").notNull(),
  lastUpdated: integer("last_updated").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const paysafeCardSubmissions = sqliteTable("paysafe_card_submissions", {
  id: integer().primaryKey({ autoIncrement: true }),
  discordId: text("discord_id").notNull(),
  cardCode: text("card_code").notNull(),
  submittedAt: integer("submitted_at").default(0).notNull(),
  processedAt: integer("processed_at").default(0).notNull(),
  status: text().default("pending").notNull(),
  amount: numeric().notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const fakeranks = sqliteTable("fakeranks", {
  id: integer().primaryKey({ autoIncrement: true }),
  userid: text().notNull(),
  text: text().notNull(),
  normalizedText: text("normalized_text").notNull(),
  color: text().default("default").notNull(),
  uploadedAt: integer("uploaded_at").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const fakerankBans = sqliteTable("fakerank_bans", {
  userid: text().primaryKey(),
  bannedAt: integer("banned_at").default(0).notNull(),
  reason: text().notNull(),
  bannedByDiscordId: text("banned_by_discord_id").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const deletedFakeranks = sqliteTable("deleted_fakeranks", {
  normalizedText: text("normalized_text").primaryKey(),
  uploadedByUserid: text("uploaded_by_userid").notNull(),
  deletedByDiscordId: text("deleted_by_discord_id").notNull(),
  reason: text().notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const donations = sqliteTable("donations", {
  id: integer().primaryKey({ autoIncrement: true }),
  discordId: text("discord_id").notNull(),
  amount: numeric().notNull(),
  donatedAt: integer("donated_at").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userid: text().notNull(),
  userAgent: text("user_agent").notNull(),
  ipAddress: text("ip_address").notNull(),
  createdAt: integer("created_at").default(0).notNull(),
  lastLoginAt: integer("last_login_at").default(0).notNull(),
  expiresAt: integer("expires_at").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const lastTakeoutRequests = sqliteTable("last_takeout_requests", {
  userid: text().primaryKey(),
  lastRequestedAt: integer("last_requested_at").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const deletionEnabledUsers = sqliteTable("deletion_enabled_users", {
  userid: text().primaryKey(),
  enabledAt: integer("enabled_at").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const birthdays = sqliteTable("birthdays", {
  userid: text().primaryKey(),
  day: integer().notNull(),
  month: integer().notNull(),
  year: integer(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const birthdayUpdates = sqliteTable("birthday_updates", {
  userid: text().primaryKey(),
  lastUpdated: integer("last_updated").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const chickenCrossGames = sqliteTable("chicken_cross_games", {
  seed: integer().primaryKey().notNull(),
  userid: text().notNull(),
  initialWager: integer("initial_wager").notNull(),
  currentPayout: integer("current_payout").notNull(),
  step: integer().notNull(),
  state: text().default("ACTIVE").notNull(),
  lastUpdatedAt: integer("last_updated_at").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const reducedLuckUsers = sqliteTable("reduced_luck_users", {
  steamId: text("steam_id").primaryKey().notNull(),
  addedAt: integer("added_at").notNull(),
  reason: text(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const cases = sqliteTable("cases", {
  id: text().primaryKey(),
  title: text().default("").notNull(),
  description: text().default("").notNull(),
  createdByDiscordId: text("created_by_discord_id").notNull(),
  createdAt: integer("created_at").default(0).notNull(),
  lastUpdatedAt: integer("last_updated_at").default(0).notNull(),
  category: text().default("Sonstiges").notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const casesRelatedUsers = sqliteTable("cases_related_users", {
  caseId: text("case_id").references(() => cases.id, { onDelete: "cascade" }),
  steamId: text("steam_id").notNull(),
},
  (table) => [
    index("idx_cases_related_users_steam_id").on(table.steamId),
    index("idx_cases_related_users_case_id").on(table.caseId),
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

export const discordCache = sqliteTable("discord_cache", {
  discordId: text("discord_id").primaryKey().notNull(),
  displayName: text("display_name").notNull(),
  username: text().notNull(),
  avatarUrl: text("avatar_url").notNull(),
  lastUpdated: integer("last_updated").default(0).notNull(),
},
  (table) => [
    check("paysafe_card_submissions_check_1", sql`status IN ('pending', 'approved', 'rejected'`),
    check("chicken_cross_games_check_2", sql`state IN ('ACTIVE', 'LOST', 'CASHED_OUT'`),
    check("cases_id_length_check", sql`length(id`),
  ]);

