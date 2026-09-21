import type { TakeoutGetResponse, TakeoutPostRequest } from '@zeitvertreib/types';
import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, type SQL } from 'drizzle-orm';
import { lastTakeoutRequests, playerdata } from '../db/schema.js';
import { SMTPClient, Message } from 'emailjs';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Tables that must never be included in a takeout, even when a row references the user.
// login_secrets holds credentials (login links) and must not leave the database.
const BANNED_TAKEOUT_TABLES = new Set<string>(['login_secrets']);

// Columns whose values are credentials/tokens and are replaced with a truncated preview.
const MASKED_TAKEOUT_COLUMNS: Record<string, string[]> = {
  sessions: ['id'],
};

// Simple email syntax validation
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function handleGetTakeout(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const takeoutRecord = await db
    .select({ lastRequestedAt: lastTakeoutRequests.lastRequestedAt })
    .from(lastTakeoutRequests)
    .where(eq(lastTakeoutRequests.userid, validation.steamId))
    .get();

  const response: TakeoutGetResponse = {
    lastRequestedAt: takeoutRecord?.lastRequestedAt ?? 0,
  };

  return createResponse(response, 200, origin);
}

export async function handlePostTakeout(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const body: TakeoutPostRequest = await request.json();

  // Validate email syntax
  if (!body.email || !isValidEmail(body.email)) {
    return createResponse({ error: 'Invalid email address' }, 400, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const now = Date.now();
  const thirtyDaysAgo = now - THIRTY_DAYS_MS;

  // Check if a takeout was requested in the last 30 days and atomically set the lock
  // This uses INSERT OR REPLACE to upsert, but first we check if it's been 30+ days
  const existingRecord = await db
    .select({ lastRequestedAt: lastTakeoutRequests.lastRequestedAt })
    .from(lastTakeoutRequests)
    .where(eq(lastTakeoutRequests.userid, validation.steamId))
    .get();

  if (existingRecord && existingRecord.lastRequestedAt > thirtyDaysAgo) {
    const nextAllowedDate = new Date(existingRecord.lastRequestedAt + THIRTY_DAYS_MS);
    return createResponse(
      {
        error: 'Takeout can only be requested once every 30 days',
        nextAllowedAt: existingRecord.lastRequestedAt + THIRTY_DAYS_MS,
        nextAllowedDate: nextAllowedDate.toISOString(),
      },
      429,
      origin,
    );
  }

  // Insert or update the takeout record (set the "lock")
  await db
    .insert(lastTakeoutRequests)
    .values({
      userid: validation.steamId,
      lastRequestedAt: now,
    })
    .onConflictDoUpdate({
      target: lastTakeoutRequests.userid,
      set: { lastRequestedAt: now },
    });

  try {
    // Collect all user data from the database
    const takeoutData = await collectUserData(db, validation.steamId);

    // Send email with the takeout data
    await sendTakeoutEmail(env, body.email, validation.steamId, takeoutData);

    return createResponse({ success: true, message: 'Takeout email sent successfully' }, 200, origin);
  } catch (error) {
    // If anything fails, remove the lock by restoring the previous value or deleting
    if (existingRecord) {
      await db
        .update(lastTakeoutRequests)
        .set({ lastRequestedAt: existingRecord.lastRequestedAt })
        .where(eq(lastTakeoutRequests.userid, validation.steamId));
    } else {
      await db.delete(lastTakeoutRequests).where(eq(lastTakeoutRequests.userid, validation.steamId));
    }

    console.error('Failed to process takeout:', error);
    return createResponse({ error: 'Failed to send takeout email. Please try again later.' }, 500, origin);
  }
}

interface TakeoutDataResult {
  [tableName: string]: Record<string, unknown>[];
}

// The introspection helpers below deliberately use raw SQL: Drizzle's typed query builder cannot
// enumerate tables/columns at runtime. The equivalent exception to CONVENTIONS.md section 2.
async function getExportableTableNames(db: ReturnType<typeof drizzle<Record<string, unknown>>>): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );

  const tableNames: string[] = [];
  for (const row of rows) {
    const name = row.name;
    // Internal bookkeeping tables (KV, drizzle migrations) start with an underscore. D1 rejects
    // queries against them, and they hold no user data.
    if (name.startsWith('_')) continue;
    if (BANNED_TAKEOUT_TABLES.has(name)) continue;
    tableNames.push(name);
  }
  return tableNames;
}

async function getTableColumns(
  db: ReturnType<typeof drizzle<Record<string, unknown>>>,
  tableName: string,
): Promise<string[]> {
  const rows = await db.all<{ name: string }>(sql`PRAGMA table_info(${sql.identifier(tableName)})`);

  const columns: string[] = [];
  for (const row of rows) {
    columns.push(row.name);
  }
  return columns;
}

async function collectTableRows(
  db: ReturnType<typeof drizzle<Record<string, unknown>>>,
  tableName: string,
  identifiers: string[],
): Promise<Record<string, unknown>[]> {
  const columns = await getTableColumns(db, tableName);
  if (columns.length === 0) {
    return [];
  }

  // A row belongs to the user when any of its columns holds the steam id or the discord id.
  const matches: SQL[] = [];
  for (const column of columns) {
    for (const identifier of identifiers) {
      matches.push(sql`${sql.identifier(column)} = ${identifier}`);
    }
  }

  return db.all<Record<string, unknown>>(
    sql`SELECT * FROM ${sql.identifier(tableName)} WHERE ${sql.join(matches, sql` OR `)}`,
  );
}

function maskSensitiveColumns(tableName: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const maskedColumns = MASKED_TAKEOUT_COLUMNS[tableName];
  if (!maskedColumns || maskedColumns.length === 0) {
    return rows;
  }

  return rows.map((row) => {
    const masked = { ...row };
    for (const column of maskedColumns) {
      const value = masked[column];
      if (typeof value === 'string') {
        masked[column] = `${value.slice(0, 8)}...`;
      }
    }
    return masked;
  });
}

async function collectUserData(
  db: ReturnType<typeof drizzle<Record<string, unknown>>>,
  userid: string,
): Promise<TakeoutDataResult> {
  const playerdataResult = await db
    .select({ discordId: playerdata.discordId })
    .from(playerdata)
    .where(eq(playerdata.id, userid))
    .get();

  const identifiers: string[] = [userid];
  const discordId = playerdataResult?.discordId;
  if (discordId && discordId !== userid) {
    identifiers.push(discordId);
  }

  const tableNames = await getExportableTableNames(db);
  const takeoutData: TakeoutDataResult = {};

  for (const tableName of tableNames) {
    const rows = await collectTableRows(db, tableName, identifiers);
    if (rows.length === 0) continue;
    takeoutData[tableName] = maskSensitiveColumns(tableName, rows);
  }

  return takeoutData;
}

async function sendTakeoutEmail(
  env: Env,
  recipientEmail: string,
  userid: string,
  takeoutData: TakeoutDataResult,
): Promise<void> {
  const client = new SMTPClient({
    user: 'support@zeitvertreib.vip',
    password: env.EMAIL_PASSWORD,
    host: 'mail.zeitvertreib.vip',
    port: 465,
    ssl: true,
    tls: false,
    domain: 'zeitvertreib.vip',
  });

  const jsonData = JSON.stringify(takeoutData, null, 2);
  const requestDate = new Date().toISOString();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; }
        .info-box { background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <h1>Your Zeitvertreib Data Takeout</h1>
      
      <p>Hello,</p>
      
      <p>As requested, we have compiled all the personal data we have stored about your account (<strong>${userid}</strong>).</p>
      
      <div class="info-box">
        <strong>Request Details:</strong><br>
        Date: ${requestDate}<br>
        User ID: ${userid}
      </div>
      
      <p>Attached to this email is a JSON file containing all your data, organized by database table. This includes but is not limited to:</p>
      
      <ul>
        <li>Player statistics and profile data</li>
        <li>Discord connection information (if linked)</li>
        <li>Kill/death records</li>
        <li>Advent calendar participation</li>
        <li>Spray uploads and moderation actions</li>
        <li>Fakerank customizations and moderation actions</li>
        <li>Payment submissions and donations (if any)</li>
        <li>Session information</li>
        <li>Cached Steam profile data</li>
      </ul>
      
      <p>This data export is provided in compliance with data protection regulations (GDPR Article 15 - Right of Access, Article 20 - Right to Data Portability).</p>
      
      <p>If you have any questions about your data or wish to request deletion, please contact us at <a href="mailto:support@zeitvertreib.vip">support@zeitvertreib.vip</a>.</p>
      
      <div class="footer">
        <p><strong>Important Legal Notice:</strong></p>
        <p>This email and any attachments are confidential and intended solely for the addressee. The data contained herein is provided pursuant to your data subject access request under applicable data protection laws.</p>
        <p>You may request another data takeout after 30 days from this request date.</p>
        <p>© ${new Date().getFullYear()} Zeitvertreib. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const message = new Message({
    from: 'Zeitvertreib Support <support@zeitvertreib.vip>',
    to: recipientEmail,
    subject: 'Your Zeitvertreib Data Takeout Request',
    attachment: [
      {
        data: htmlContent,
        alternative: true,
        type: 'text/html',
      },
      {
        data: jsonData,
        type: 'application/json',
        name: `zeitvertreib-takeout-${userid}-${Date.now()}.json`,
      },
    ],
  });

  try {
    await client.sendAsync(message);
  } finally {
    client.smtp.close();
  }
}
