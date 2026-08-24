import { eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { playerdata } from './schema.js';

/**
 * ZVC (Zeitvertreib Coins) balance helpers.
 *
 * ZVC balances are stored in `playerdata.experience`. Every read or write of a
 * user's ZVC balance across the backend MUST go through these helpers instead
 * of ad-hoc queries (see CONVENTIONS.md).
 *
 * `getZvc` returns `null` when the user has no playerdata row at all, so
 * callers can distinguish "user not found" from an empty (0) balance.
 *
 * For multi-statement writes (e.g. transfers), put the unexecuted `*Query`
 * builders into `db.batch([...])`. D1 does not support interactive
 * transactions — `db.transaction()` emits a literal `BEGIN`, which D1
 * rejects. Batches are atomic: all statements commit together or roll back.
 */

export type ZvcDb = BaseSQLiteDatabase<any, any, any, any>;

export type ZvcUserRef = { id: string } | { discordId: string };

function zvcUserColumn(user: ZvcUserRef) {
  return 'id' in user ? playerdata.id : playerdata.discordId;
}

function zvcUserValue(user: ZvcUserRef) {
  return 'id' in user ? user.id : user.discordId;
}

export async function getZvc(db: ZvcDb, user: ZvcUserRef): Promise<number | null> {
  const result = await db
    .select({ experience: playerdata.experience })
    .from(playerdata)
    .where(eq(zvcUserColumn(user), zvcUserValue(user)))
    .get();

  return result ? (result.experience ?? 0) : null;
}

/**
 * Unexecuted increment query. Pass into `db.batch([...])` to make it atomic
 * with other statements.
 */
export function increaseZvcQuery(db: ZvcDb, user: ZvcUserRef, amount: number) {
  return db
    .update(playerdata)
    .set({ experience: sql`${playerdata.experience} + ${amount}` })
    .where(eq(zvcUserColumn(user), zvcUserValue(user)));
}

export async function increaseZvc(db: ZvcDb, user: ZvcUserRef, amount: number): Promise<void> {
  await increaseZvcQuery(db, user, amount).run();
}

/**
 * Unexecuted decrement query. Pass into `db.batch([...])` to make it atomic
 * with other statements.
 */
export function decreaseZvcQuery(db: ZvcDb, user: ZvcUserRef, amount: number) {
  return db
    .update(playerdata)
    .set({ experience: sql`${playerdata.experience} - ${amount}` })
    .where(eq(zvcUserColumn(user), zvcUserValue(user)));
}

export async function decreaseZvc(db: ZvcDb, user: ZvcUserRef, amount: number): Promise<void> {
  await decreaseZvcQuery(db, user, amount).run();
}
