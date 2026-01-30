import type { TakeoutGetResponse, TakeoutPostRequest } from '@zeitvertreib/types';
import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, lt, or, isNull } from 'drizzle-orm';
import {
  lastTakeoutRequests,
  playerdata,
  discordInfo,
  kills,
  adventCalendar,
  sprays,
  sprayBans,
  deletedSprays,
  paysafeCardSubmissions,
  fakeranks,
  fakerankBans,
  deletedFakeranks,
  donations,
  sessions,
  steamCache,
  birthdays,
} from '../db/schema.js';
import { SMTPClient, Message } from 'emailjs';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
  playerdata: Record<string, unknown> | null;
  discordInfo: Record<string, unknown> | null;
  kills: { asAttacker: Record<string, unknown>[]; asTarget: Record<string, unknown>[] };
  adventCalendar: Record<string, unknown> | null;
  sprays: Record<string, unknown>[];
  sprayBans: Record<string, unknown> | null;
  deletedSprays: Record<string, unknown>[];
  fakeranks: Record<string, unknown>[];
  fakerankBans: Record<string, unknown> | null;
  deletedFakeranks: Record<string, unknown>[];
  paysafeCardSubmissions: Record<string, unknown>[];
  donations: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  steamCache: Record<string, unknown> | null;
  birthdays: Record<string, unknown> | null;
}

async function collectUserData(
  db: ReturnType<typeof drizzle<Record<string, unknown>>>,
  userid: string,
): Promise<TakeoutDataResult> {
  // Collect data from all relevant tables
  const playerdataResult = await db.select().from(playerdata).where(eq(playerdata.id, userid)).get();

  // Get discordId from playerdata for discord-related lookups
  const discordId = playerdataResult?.discordId ?? null;

  const discordInfoResult = discordId
    ? await db.select().from(discordInfo).where(eq(discordInfo.discordId, discordId)).get()
    : null;

  const killsAsAttacker = await db.select().from(kills).where(eq(kills.attacker, userid)).all();

  const killsAsTarget = await db.select().from(kills).where(eq(kills.target, userid)).all();

  const adventCalendarResult = await db.select().from(adventCalendar).where(eq(adventCalendar.userId, userid)).get();

  const spraysResult = await db.select().from(sprays).where(eq(sprays.userid, userid)).all();

  const sprayBansResult = await db.select().from(sprayBans).where(eq(sprayBans.userid, userid)).get();

  const deletedSpraysResult = await db
    .select()
    .from(deletedSprays)
    .where(eq(deletedSprays.uploadedByUserid, userid))
    .all();

  const fakeranksResult = await db.select().from(fakeranks).where(eq(fakeranks.userid, userid)).all();

  const fakerankBansResult = await db.select().from(fakerankBans).where(eq(fakerankBans.userid, userid)).get();

  const deletedFakeranksResult = await db
    .select()
    .from(deletedFakeranks)
    .where(eq(deletedFakeranks.uploadedByUserid, userid))
    .all();

  // Paysafe and donations are linked by discordId
  const paysafeResult = discordId
    ? await db.select().from(paysafeCardSubmissions).where(eq(paysafeCardSubmissions.discordId, discordId)).all()
    : [];

  const donationsResult = discordId
    ? await db.select().from(donations).where(eq(donations.discordId, discordId)).all()
    : [];

  // Sessions for this user
  const sessionsResult = await db.select().from(sessions).where(eq(sessions.userid, userid)).all();

  // Steam cache
  const steamCacheResult = await db.select().from(steamCache).where(eq(steamCache.steamId, userid)).get();

  // Birthday data
  const birthdaysResult = await db.select().from(birthdays).where(eq(birthdays.userid, userid)).get();

  return {
    playerdata: playerdataResult ?? null,
    discordInfo: discordInfoResult ?? null,
    kills: {
      asAttacker: killsAsAttacker,
      asTarget: killsAsTarget,
    },
    adventCalendar: adventCalendarResult ?? null,
    sprays: spraysResult,
    sprayBans: sprayBansResult ?? null,
    deletedSprays: deletedSpraysResult,
    fakeranks: fakeranksResult,
    fakerankBans: fakerankBansResult ?? null,
    deletedFakeranks: deletedFakeranksResult,
    paysafeCardSubmissions: paysafeResult.map((p) => ({
      ...p,
      // Mask the card code for security - only show last 4 digits
      cardCode: p.cardCode ? `****${p.cardCode.slice(-4)}` : null,
    })),
    donations: donationsResult,
    sessions: sessionsResult.map((s) => ({
      ...s,
      // Mask the session id for security
      id: `${s.id.slice(0, 8)}...`,
    })),
    steamCache: steamCacheResult ?? null,
    birthdays: birthdaysResult ?? null,
  };
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
