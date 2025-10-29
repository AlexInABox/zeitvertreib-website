import {
  sqliteTable,
  check,
  text,
  integer,
  index,
  real,
  numeric,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const playerdata = sqliteTable('playerdata', {
  id: text('id').primaryKey(),
  discordId: integer('discordId'),
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
  migratedCedmod: integer('migrated_cedmod', { mode: 'timestamp_ms' }),
  firstSeen: integer('first_seen', { mode: 'timestamp_ms' }),
  lastSeen: integer('last_seen', { mode: 'timestamp_ms' }),
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

export const recurringTransactions = sqliteTable('recurring_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionType: text('transaction_type', {
    enum: ['income', 'expense'],
  }).notNull(),
  category: text('category').notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  frequency: text('frequency', {
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
  }).notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  nextExecution: text('next_execution').notNull(),
  isActive: integer('is_active').default(1),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
  referenceId: text('reference_id'),
  notes: text('notes'),
  lastExecuted: text('last_executed'),
});

export const financialTransactions = sqliteTable('financial_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionType: text('transaction_type', {
    enum: ['income', 'expense'],
  }).notNull(),
  category: text('category').notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  transactionDate: text('transaction_date').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
  referenceId: text('reference_id'),
  notes: text('notes'),
});
