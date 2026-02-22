import { sqliteTable, check, text, integer, real, numeric } from 'drizzle-orm/sqlite-core';
import { desc, sql } from 'drizzle-orm';

export const playerdata = sqliteTable('playerdata', {
  id: text('id').primaryKey(),
  discordId: text('discordId'),
  experience: integer('experience').default(0),
  playtime: integer('playtime').default(0),
  roundsplayed: integer('roundsplayed').default(0),
  usedmedkits: integer('usedmedkits').default(0),
  usedcolas: integer('usedcolas').default(0),
  pocketescapes: integer('pocketescapes').default(0),
  usedadrenaline: integer('usedadrenaline').default(0),
  fakerank: text('fakerank'),
  snakehighscore: integer('snakehighscore').default(0),
  killcount: integer('killcount').default(0),
  deathcount: integer('deathcount').default(0),
  fakerankUntil: integer('fakerank_until').default(0),
  fakerankColor: text('fakerank_color', {
    enum: [
      'pink',
      'red',
      'brown',
      'silver',
      'default',
      'light_green',
      'crimson',
      'cyan',
      'aqua',
      'deep_pink',
      'tomato',
      'yellow',
      'magenta',
      'blue_green',
      'orange',
      'lime',
      'green',
      'emerald',
      'carmine',
      'nickel',
      'mint',
      'army_green',
      'pumpkin',
    ],
  }).default('default'),
  fakerankadminUntil: integer('fakerankadmin_until').default(0),
  redeemedCodes: text('redeemed_codes').default(''),
  fakerankoverrideUntil: integer('fakerankoverride_until').default(0),
  username: text('username').default(''),
  slotSpins: integer('slotSpins').notNull().default(0),
  slotWins: integer('slotWins').notNull().default(0),
  slotLosses: integer('slotLosses').notNull().default(0),
  luckyWheelSpins: integer('luckyWheelSpins').notNull().default(0),
  luckyWheelWins: integer('luckyWheelWins').notNull().default(0),
  luckyWheelLosses: integer('luckyWheelLosses').notNull().default(0),
  rouletteSpins: integer('rouletteSpins').notNull().default(0),
  rouletteWins: integer('rouletteWins').notNull().default(0),
  rouletteLosses: integer('rouletteLosses').notNull().default(0),
  migratedCedmod: integer('migrated_cedmod', { mode: 'timestamp_ms' }),
  firstSeen: integer('first_seen', { mode: 'timestamp_ms' }),
  lastSeen: integer('last_seen', { mode: 'timestamp_ms' }),
});

export const discordInfo = sqliteTable('discord_info', {
  discordId: text('discordId').primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  boosterSince: integer('booster_since').notNull().default(0),
  donatorSince: integer('donator_since').notNull().default(0),
  vipSince: integer('vip_since').notNull().default(0),
  teamSince: integer('team_since').notNull().default(0),
});

export const loginSecrets = sqliteTable('login_secrets', {
  secret: text('secret').primaryKey(),
  steamId: text('steam_id').notNull(),
  createdAt: integer('created_at').default(sql`CURRENT_TIMESTAMP`),
  expiresAt: integer('expires_at').notNull(),
});

export const kills = sqliteTable('kills', {
  attacker: text('attacker'),
  target: text('target'),
  timestamp: integer('timestamp'),
});

export const redemptionCodes = sqliteTable('redemption_codes', {
  code: text('code').primaryKey(),
  credits: integer('credits').notNull(),
  remainingUses: integer('remaining_uses').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const adventCalendar = sqliteTable('advent_calendar', {
  userId: text('user_id').primaryKey().notNull(),
  day1: integer('day_1').notNull().default(0),
  day2: integer('day_2').notNull().default(0),
  day3: integer('day_3').notNull().default(0),
  day4: integer('day_4').notNull().default(0),
  day5: integer('day_5').notNull().default(0),
  day6: integer('day_6').notNull().default(0),
  day7: integer('day_7').notNull().default(0),
  day8: integer('day_8').notNull().default(0),
  day9: integer('day_9').notNull().default(0),
  day10: integer('day_10').notNull().default(0),
  day11: integer('day_11').notNull().default(0),
  day12: integer('day_12').notNull().default(0),
  day13: integer('day_13').notNull().default(0),
  day14: integer('day_14').notNull().default(0),
  day15: integer('day_15').notNull().default(0),
  day16: integer('day_16').notNull().default(0),
  day17: integer('day_17').notNull().default(0),
  day18: integer('day_18').notNull().default(0),
  day19: integer('day_19').notNull().default(0),
  day20: integer('day_20').notNull().default(0),
  day21: integer('day_21').notNull().default(0),
  day22: integer('day_22').notNull().default(0),
  day23: integer('day_23').notNull().default(0),
  day24: integer('day_24').notNull().default(0),
});

export const sprays = sqliteTable('sprays', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userid: text('userid').notNull(),
  name: text('name').notNull(),
  sha256: text('sha256').notNull(),
  uploadedAt: integer('uploaded_at').notNull().default(0),
});

export const sprayBans = sqliteTable('spray_bans', {
  userid: text('userid').primaryKey(),
  bannedAt: integer('banned_at').notNull().default(0),
  reason: text('reason').notNull(),
  bannedByDiscordId: text('banned_by_discord_id').notNull(),
});

export const deletedSprays = sqliteTable('deleted_sprays', {
  sha256: text('sha256').notNull().primaryKey(),
  uploadedByUserid: text('uploaded_by_userid').notNull(),
  deletedByDiscordId: text('deleted_by_discord_id').notNull(),
  reason: text('reason').notNull(),
});

export const steamCache = sqliteTable('steam_cache', {
  steamId: text('steam_id').primaryKey().notNull(),
  username: text('username').notNull(),
  avatarUrl: text('avatar_url').notNull(),
  lastUpdated: integer('last_updated').notNull().default(0),
});

export const discordCache = sqliteTable('discord_cache', {
  discordId: text('discord_id').primaryKey().notNull(),
  displayName: text('display_name').notNull(),
  username: text('username').notNull(),
  avatarUrl: text('avatar_url').notNull(),
  lastUpdated: integer('last_updated').notNull().default(0),
});

export const paysafeCardSubmissions = sqliteTable('paysafe_card_submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discordId: text('discord_id').notNull(),
  cardCode: text('card_code').notNull(),
  submittedAt: integer('submitted_at').notNull().default(0),
  processedAt: integer('processed_at').notNull().default(0),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  amount: numeric('amount').notNull(),
});

export const fakeranks = sqliteTable('fakeranks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userid: text('userid').notNull(),
  text: text('text').notNull(),
  normalizedText: text('normalized_text').notNull(),
  color: text('color', {
    enum: [
      'pink',
      'red',
      'brown',
      'silver',
      'default',
      'light_green',
      'crimson',
      'cyan',
      'aqua',
      'deep_pink',
      'tomato',
      'yellow',
      'magenta',
      'blue_green',
      'orange',
      'lime',
      'green',
      'emerald',
      'carmine',
      'nickel',
      'mint',
      'army_green',
      'pumpkin',
    ],
  })
    .default('default')
    .notNull(),
  uploadedAt: integer('uploaded_at').notNull().default(0),
});

export const fakerankBans = sqliteTable('fakerank_bans', {
  userid: text('userid').primaryKey(),
  bannedAt: integer('banned_at').notNull().default(0),
  reason: text('reason').notNull(),
  bannedByDiscordId: text('banned_by_discord_id').notNull(),
});

export const deletedFakeranks = sqliteTable('deleted_fakeranks', {
  normalizedText: text('normalized_text').notNull().primaryKey(),
  uploadedByUserid: text('uploaded_by_userid').notNull(),
  deletedByDiscordId: text('deleted_by_discord_id').notNull(),
  reason: text('reason').notNull(),
});

export const donations = sqliteTable('donations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discordId: text('discord_id').notNull(),
  amount: numeric('amount').notNull(),
  donatedAt: integer('donated_at').notNull().default(0),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userid: text('userid').notNull(),
  userAgent: text('user_agent').notNull(),
  ipAddress: text('ip_address').notNull(),
  createdAt: integer('created_at').notNull().default(0),
  lastLoginAt: integer('last_login_at').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
});

export const lastTakeoutRequests = sqliteTable('last_takeout_requests', {
  userid: text('userid').primaryKey(),
  lastRequestedAt: integer('last_requested_at').notNull(),
});

export const deletionEnabledUsers = sqliteTable('deletion_enabled_users', {
  userid: text('userid').primaryKey(),
  enabledAt: integer('enabled_at').notNull(),
});

export const birthdays = sqliteTable('birthdays', {
  userid: text('userid').primaryKey(),
  day: integer('day').notNull(),
  month: integer('month').notNull(),
  year: integer('year'), // can be null if user doesn't want to share year
});

export const birthdayUpdates = sqliteTable('birthday_updates', {
  userid: text('userid').primaryKey(),
  lastUpdated: integer('last_updated').notNull(),
});

export const chickenCrossGames = sqliteTable('chicken_cross_games', {
  seed: integer('seed').primaryKey().notNull(),
  userid: text('userid').notNull(),
  initialWager: integer('initial_wager').notNull(),
  currentPayout: integer('current_payout').notNull(),
  step: integer('step').notNull(),
  state: text('state', {
    enum: ['ACTIVE', 'LOST', 'CASHED_OUT'],
  })
    .default('ACTIVE')
    .notNull(),
  lastUpdatedAt: integer('last_updated_at').notNull(),
});

export const reducedLuckUsers = sqliteTable('reduced_luck_users', {
  steamId: text('steam_id').primaryKey().notNull(),
  addedAt: integer('added_at').notNull(),
  reason: text('reason'),
});

// Cases and all they need (moderation cases not csgo related lol)
export const cases = sqliteTable(
  'cases',
  {
    id: text('id').primaryKey(),
    title: text('title').default('').notNull(),
    description: text('description').default('').notNull(),
    category: text('category', {
      enum: [
        'Beleidigungen',
        'Supportflucht',
        'Team-Trolling',
        'Soundboard',
        'Report-Abuse',
        'Camping',
        'Rollenflucht',
        'Bug-Abusing',
        'Diebstahl',
        'Teaming',
        'Gefesselte Klassen',
        'Ban-Evasion',
        'Rundenende',
        'Sonstiges',
      ],
    })
      .default('Sonstiges')
      .notNull(),
    createdByDiscordId: text('created_by_discord_id').notNull(),
    createdAt: integer('created_at').notNull().default(0),
    lastUpdatedAt: integer('last_updated_at').notNull().default(0),
  },
  (table) => [check('cases_id_length_check', sql`length(${table.id}) = 10`)],
);

// many-to-many
export const casesRelatedUsers = sqliteTable('cases_related_users', {
  caseId: text('case_id').references(() => cases.id),
  steamId: text('steam_id').notNull(),
});
