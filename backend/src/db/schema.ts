import { sqliteTable, check, text, integer, index, real, numeric } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

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
  uploadedByUserId: text('uploaded_by_userid').notNull(),
  deletedByDiscordId: text('deleted_by_discord_id').notNull(),
  reason: text('reason').notNull(),
});