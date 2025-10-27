import { sqliteTable, check, text, integer, index, real, numeric } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const playerdata = sqliteTable("playerdata", {
    id: text("id").primaryKey(),
    experience: integer("experience").default(0),
    playtime: integer("playtime").default(0),
    roundsplayed: integer("roundsplayed").default(0),
    usedmedkits: integer("usedmedkits").default(0),
    usedcolas: integer("usedcolas").default(0),
    pocketescapes: integer("pocketescapes").default(0),
    usedadrenaline: integer("usedadrenaline").default(0),
    fakerank: text("fakerank"),
    snakehighscore: integer("snakehighscore").default(0),
    killcount: integer("killcount").default(0),
    deathcount: integer("deathcount").default(0),
    fakerank_until: integer("fakerank_until").default(0),
    fakerank_color: text("fakerank_color", {
        enum: [
            "pink", "red", "brown", "silver", "default", "light_green", "crimson", "cyan", "aqua", "deep_pink",
            "tomato", "yellow", "magenta", "blue_green", "orange", "lime", "green", "emerald",
            "carmine", "nickel", "mint", "army_green", "pumpkin"
        ]
    }).default("default"),
    fakerankadmin_until: integer("fakerankadmin_until").default(0),
    redeemed_codes: text("redeemed_codes").default(""),
    fakerankoverride_until: integer("fakerankoverride_until").default(0),
    username: text("username").default(""),
});

export const loginSecrets = sqliteTable("login_secrets", {
    secret: text("secret").primaryKey(),
    steam_id: text("steam_id").notNull(),
    created_at: integer("created_at").default(sql`CURRENT_TIMESTAMP`),
    expires_at: integer("expires_at").notNull(),
});

export const kills = sqliteTable("kills", {
    attacker: text("attacker"),
    target: text("target"),
    timestamp: integer("timestamp"),
});

export const redemptionCodes = sqliteTable("redemption_codes", {
    code: text("code").primaryKey(),
    credits: integer("credits").notNull(),
    remaining_uses: integer("remaining_uses").notNull(),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const recurringTransactions = sqliteTable("recurring_transactions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transaction_type: text("transaction_type", {
        enum: ["income", "expense"],
    }).notNull(),
    category: text("category").notNull(),
    amount: real("amount").notNull(),
    description: text("description").notNull(),
    frequency: text("frequency", {
        enum: ["daily", "weekly", "monthly", "yearly"],
    }).notNull(),
    start_date: text("start_date").notNull(),
    end_date: text("end_date"),
    next_execution: text("next_execution").notNull(),
    is_active: integer("is_active").default(1),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    created_by: text("created_by"),
    reference_id: text("reference_id"),
    notes: text("notes"),
    last_executed: text("last_executed"),
});

export const financialTransactions = sqliteTable("financial_transactions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transaction_type: text("transaction_type", {
        enum: ["income", "expense"],
    }).notNull(),
    category: text("category").notNull(),
    amount: real("amount").notNull(),
    description: text("description").notNull(),
    transaction_date: text("transaction_date").notNull(),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    created_by: text("created_by"),
    reference_id: text("reference_id"),
    notes: text("notes"),
});
