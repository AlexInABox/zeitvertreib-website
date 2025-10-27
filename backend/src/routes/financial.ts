import { validateSession, createResponse } from '../utils.js';
import { FinancialTransaction, RecurringTransaction } from '../types/index.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and } from 'drizzle-orm';
import {
  financialTransactions,
  recurringTransactions,
} from '../../drizzle/schema.js';

const ADMIN_STEAM_ID = '76561198354414854';

/**
 * Validates if the user has admin privileges for write operations
 */
async function validateAdminAccess(
  request: Request,
  env: Env,
): Promise<{ isAdmin: boolean; session?: any; error?: string }> {
  const validation = await validateSession(request, env);
  if (!validation.isValid) {
    return {
      isAdmin: false,
      ...(validation.error && { error: validation.error }),
    };
  }

  const isAdmin = validation.session?.steamId === ADMIN_STEAM_ID;
  return { isAdmin, session: validation.session };
}

/**
 * GET /financial/transactions
 * Returns all financial transactions (requires valid Steam auth)
 */
export async function handleGetTransactions(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session (any valid Steam user can read)
  const validation = await validateSession(request, env);

  if (!validation.isValid) {
    return createResponse({ error: validation.error }, 401, origin);
  }

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const type = url.searchParams.get('type'); // 'income' or 'expense'
    const category = url.searchParams.get('category');

    // Build where conditions
    const conditions: any[] = [];

    if (type && (type === 'income' || type === 'expense')) {
      conditions.push(eq(financialTransactions.transactionType, type));
    }

    if (category) {
      conditions.push(eq(financialTransactions.category, category));
    }

    // Execute query with Drizzle
    const result = await db
      .select()
      .from(financialTransactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(financialTransactions.transactionDate),
        desc(financialTransactions.createdAt),
      )
      .limit(limit)
      .offset(offset);

    // Transform database records to match frontend interface
    const transformedTransactions = result.map((row) => ({
      id: row.id,
      date: row.transactionDate,
      type: row.transactionType,
      category: row.category,
      amount: row.amount,
      description: row.description,
      service: row.notes || row.category, // Use notes as service/title, fallback to category
      created_at: row.createdAt,
    }));

    return createResponse(
      {
        transactions: transformedTransactions,
        total: result.length,
        limit: limit,
        offset: offset,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error getting transactions:', error);
    return createResponse({ error: 'Failed to get transactions' }, 500, origin);
  }
}

/**
 * GET /financial/recurring
 * Returns all recurring transactions (requires valid Steam auth)
 */
export async function handleGetRecurringTransactions(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session (any valid Steam user can read)
  const validation = await validateSession(request, env);
  if (!validation.isValid) {
    return createResponse({ error: validation.error }, 401, origin);
  }

  try {
    const result = await db
      .select()
      .from(recurringTransactions)
      .orderBy(desc(recurringTransactions.createdAt));

    return createResponse(
      {
        recurring_transactions: result,
        total: result.length,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    return createResponse(
      { error: 'Failed to fetch recurring transactions' },
      500,
      origin,
    );
  }
}

/**
 * POST /financial/recurring
 * Creates a new recurring transaction (requires admin Steam ID)
 */
export async function handleCreateRecurringTransaction(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate admin access
  const adminValidation = await validateAdminAccess(request, env);
  if (!adminValidation.isAdmin) {
    return createResponse(
      {
        error: adminValidation.error || 'Admin access required',
      },
      403,
      origin,
    );
  }

  try {
    const recurring: Omit<
      RecurringTransaction,
      'id' | 'created_at' | 'is_active'
    > = await request.json();

    // Validate required fields
    if (
      !recurring.transaction_type ||
      !['income', 'expense'].includes(recurring.transaction_type)
    ) {
      return createResponse(
        { error: 'Valid transaction_type required (income or expense)' },
        400,
        origin,
      );
    }

    if (
      !recurring.frequency ||
      !['daily', 'weekly', 'monthly', 'yearly'].includes(recurring.frequency)
    ) {
      return createResponse(
        { error: 'Valid frequency required (daily, weekly, monthly, yearly)' },
        400,
        origin,
      );
    }

    if (!recurring.category || typeof recurring.category !== 'string') {
      return createResponse({ error: 'Category is required' }, 400, origin);
    }

    if (
      !recurring.amount ||
      typeof recurring.amount !== 'number' ||
      recurring.amount <= 0
    ) {
      return createResponse(
        { error: 'Valid amount (positive number) is required' },
        400,
        origin,
      );
    }

    if (!recurring.description || typeof recurring.description !== 'string') {
      return createResponse({ error: 'Description is required' }, 400, origin);
    }

    if (!recurring.start_date || typeof recurring.start_date !== 'string') {
      return createResponse({ error: 'Start date is required' }, 400, origin);
    }

    // Calculate next execution date
    const nextExecution = calculateNextExecution(
      recurring.start_date,
      recurring.frequency,
    );

    // Insert recurring transaction using Drizzle
    const result = await db
      .insert(recurringTransactions)
      .values({
        transactionType: recurring.transaction_type,
        category: recurring.category,
        amount: recurring.amount,
        description: recurring.description,
        frequency: recurring.frequency,
        startDate: recurring.start_date,
        endDate: recurring.end_date || null,
        nextExecution: nextExecution,
        createdBy: adminValidation.session?.steamId || null,
        referenceId: recurring.reference_id || null,
        notes: recurring.notes || null,
      })
      .returning({ insertedId: recurringTransactions.id });

    return createResponse(
      {
        message: 'Recurring transaction created successfully',
        id: result[0]?.insertedId,
      },
      201,
      origin,
    );
  } catch (error) {
    console.error('Error creating recurring transaction:', error);
    return createResponse(
      { error: 'Failed to create recurring transaction' },
      500,
      origin,
    );
  }
}

/**
 * PUT /financial/recurring/{id}
 * Updates a recurring transaction (requires admin Steam ID)
 */
export async function handleUpdateRecurringTransaction(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate admin access
  const adminValidation = await validateAdminAccess(request, env);
  if (!adminValidation.isAdmin) {
    return createResponse(
      {
        error: adminValidation.error || 'Admin access required',
      },
      403,
      origin,
    );
  }

  try {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id || isNaN(parseInt(id))) {
      return createResponse(
        { error: 'Valid transaction ID required' },
        400,
        origin,
      );
    }

    const updates: any = await request.json();

    // Build update object dynamically
    const updateData: any = {};

    if (updates.transaction_type) {
      updateData.transactionType = updates.transaction_type;
    }
    if (updates.category) {
      updateData.category = updates.category;
    }
    if (updates.amount !== undefined) {
      updateData.amount = updates.amount;
    }
    if (updates.description) {
      updateData.description = updates.description;
    }
    if (updates.frequency) {
      updateData.frequency = updates.frequency;
    }
    if (updates.is_active !== undefined) {
      updateData.isActive = updates.is_active;
    }
    if (updates.end_date !== undefined) {
      updateData.endDate = updates.end_date;
    }

    if (Object.keys(updateData).length === 0) {
      return createResponse({ error: 'No fields to update' }, 400, origin);
    }

    const result = await db
      .update(recurringTransactions)
      .set(updateData)
      .where(eq(recurringTransactions.id, parseInt(id)))
      .returning({ updatedId: recurringTransactions.id });

    if (result.length === 0) {
      return createResponse(
        { error: 'Recurring transaction not found' },
        404,
        origin,
      );
    }

    return createResponse(
      { message: 'Recurring transaction updated successfully' },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error updating recurring transaction:', error);
    return createResponse(
      { error: 'Failed to update recurring transaction' },
      500,
      origin,
    );
  }
}

/**
 * DELETE /financial/recurring/{id}
 * Deletes a recurring transaction (requires admin Steam ID)
 */
export async function handleDeleteRecurringTransaction(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate admin access
  const adminValidation = await validateAdminAccess(request, env);
  if (!adminValidation.isAdmin) {
    return createResponse(
      {
        error: adminValidation.error || 'Admin access required',
      },
      403,
      origin,
    );
  }

  try {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id || isNaN(parseInt(id))) {
      return createResponse(
        { error: 'Valid transaction ID required' },
        400,
        origin,
      );
    }

    const result = await db
      .delete(recurringTransactions)
      .where(eq(recurringTransactions.id, parseInt(id)))
      .returning({ deletedId: recurringTransactions.id });

    if (result.length === 0) {
      return createResponse(
        { error: 'Recurring transaction not found' },
        404,
        origin,
      );
    }

    return createResponse(
      { message: 'Recurring transaction deleted successfully' },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error deleting recurring transaction:', error);
    return createResponse(
      { error: 'Failed to delete recurring transaction' },
      500,
      origin,
    );
  }
}

/**
 * Helper function to calculate next execution date
 */
function calculateNextExecution(startDate: string, frequency: string): string {
  const start = new Date(startDate);
  const next = new Date(start);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next.toISOString().split('T')[0] ?? '';
}

/**
 * Cron job function to process recurring transactions
 * This will be called daily by Cloudflare Workers cron
 */
export async function processRecurringTransactions(
  _db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0] ?? '';

  try {
    // Get all active recurring transactions that are due today
    const result = await env.ZEITVERTREIB_DATA.prepare(
      `
            SELECT * FROM recurring_transactions 
            WHERE is_active = TRUE 
            AND next_execution <= ?
            AND (end_date IS NULL OR end_date >= ?)
        `,
    )
      .bind(today, today)
      .all();

    const recurringTransactions =
      result.results as unknown as RecurringTransaction[];

    for (const recurring of recurringTransactions) {
      try {
        // Create the actual financial transaction
        await env.ZEITVERTREIB_DATA.prepare(
          `
                    INSERT INTO financial_transactions (
                        transaction_type, category, amount, description, transaction_date,
                        created_by, reference_id, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
        )
          .bind(
            recurring.transaction_type,
            recurring.category,
            recurring.amount,
            `${recurring.description} (Recurring)`,
            today,
            recurring.created_by,
            recurring.reference_id,
            `Auto-generated from recurring transaction #${recurring.id}`,
          )
          .run();

        // Update the recurring transaction's next execution date
        const nextExecution = calculateNextExecution(
          today,
          recurring.frequency,
        );

        await env.ZEITVERTREIB_DATA.prepare(
          `
                    UPDATE recurring_transactions 
                    SET next_execution = ?, last_executed = ?
                    WHERE id = ?
                `,
        )
          .bind(nextExecution, today, recurring.id)
          .run();

        console.log(
          `Processed recurring transaction #${recurring.id}: ${recurring.description}`,
        );
      } catch (error) {
        console.error(
          `Error processing recurring transaction #${recurring.id}:`,
          error,
        );
      }
    }

    console.log(
      `Processed ${recurringTransactions.length} recurring transactions for ${today}`,
    );
  } catch (error) {
    console.error('Error processing recurring transactions:', error);
  }
}

/**
 * POST /financial/transactions
 * Creates a new financial transaction (requires admin Steam ID)
 */
export async function handleCreateTransaction(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate admin access
  const adminValidation = await validateAdminAccess(request, env);
  if (!adminValidation.isAdmin) {
    return createResponse(
      {
        error: adminValidation.error || 'Admin access required',
      },
      403,
      origin,
    );
  }

  try {
    const transaction: Omit<FinancialTransaction, 'id' | 'created_at'> =
      await request.json();

    // Validate required fields
    if (
      !transaction.transaction_type ||
      !['income', 'expense'].includes(transaction.transaction_type)
    ) {
      return createResponse(
        { error: 'Valid transaction_type required (income or expense)' },
        400,
        origin,
      );
    }

    if (!transaction.category || typeof transaction.category !== 'string') {
      return createResponse({ error: 'Category is required' }, 400, origin);
    }

    if (
      !transaction.amount ||
      typeof transaction.amount !== 'number' ||
      transaction.amount <= 0
    ) {
      return createResponse(
        { error: 'Valid amount (positive number) is required' },
        400,
        origin,
      );
    }

    if (
      !transaction.description ||
      typeof transaction.description !== 'string'
    ) {
      return createResponse({ error: 'Description is required' }, 400, origin);
    }

    if (
      !transaction.transaction_date ||
      typeof transaction.transaction_date !== 'string'
    ) {
      return createResponse(
        { error: 'Transaction date is required' },
        400,
        origin,
      );
    }

    // Validate date format (should be YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(transaction.transaction_date)) {
      return createResponse(
        { error: 'Transaction date must be in YYYY-MM-DD format' },
        400,
        origin,
      );
    }

    // Insert transaction using Drizzle
    const result = await db
      .insert(financialTransactions)
      .values({
        transactionType: transaction.transaction_type,
        category: transaction.category,
        amount: transaction.amount,
        description: transaction.description,
        transactionDate: transaction.transaction_date,
        createdBy: adminValidation.session?.steamId || null,
        referenceId: transaction.reference_id || null,
        notes: transaction.notes || null,
      })
      .returning({ insertedId: financialTransactions.id });

    return createResponse(
      {
        message: 'Transaction created successfully',
        id: result[0]?.insertedId,
      },
      201,
      origin,
    );
  } catch (error) {
    console.error('Error creating financial transaction:', error);
    return createResponse(
      { error: 'Failed to create transaction' },
      500,
      origin,
    );
  }
}

/**
 * PUT /financial/transactions/{id}
 * Updates a financial transaction (requires admin Steam ID)
 */
export async function handleUpdateTransaction(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate admin access
  const adminValidation = await validateAdminAccess(request, env);
  if (!adminValidation.isAdmin) {
    return createResponse(
      {
        error: adminValidation.error || 'Admin access required',
      },
      403,
      origin,
    );
  }

  try {
    const url = new URL(request.url);
    const transactionId = url.pathname.split('/').pop();

    if (!transactionId || isNaN(parseInt(transactionId))) {
      return createResponse(
        { error: 'Valid transaction ID required' },
        400,
        origin,
      );
    }

    const updates: Partial<FinancialTransaction> = await request.json();

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: any[] = [];

    if (
      updates.transaction_type &&
      ['income', 'expense'].includes(updates.transaction_type)
    ) {
      updateFields.push('transaction_type = ?');
      params.push(updates.transaction_type);
    }

    if (updates.category) {
      updateFields.push('category = ?');
      params.push(updates.category);
    }

    if (
      updates.amount &&
      typeof updates.amount === 'number' &&
      updates.amount > 0
    ) {
      updateFields.push('amount = ?');
      params.push(updates.amount);
    }

    if (updates.description) {
      updateFields.push('description = ?');
      params.push(updates.description);
    }

    if (
      updates.transaction_date &&
      /^\d{4}-\d{2}-\d{2}$/.test(updates.transaction_date)
    ) {
      updateFields.push('transaction_date = ?');
      params.push(updates.transaction_date);
    }

    if (updates.reference_id !== undefined) {
      updateFields.push('reference_id = ?');
      params.push(updates.reference_id);
    }

    if (updates.notes !== undefined) {
      updateFields.push('notes = ?');
      params.push(updates.notes);
    }

    if (updateFields.length === 0) {
      return createResponse(
        { error: 'No valid fields to update' },
        400,
        origin,
      );
    }

    // Add transaction ID to params
    params.push(parseInt(transactionId));

    const result = await env.ZEITVERTREIB_DATA.prepare(
      `
            UPDATE financial_transactions 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `,
    )
      .bind(...params)
      .run();

    if (!result.success) {
      return createResponse(
        { error: 'Failed to update transaction' },
        500,
        origin,
      );
    }

    if (result.meta.changes === 0) {
      return createResponse({ error: 'Transaction not found' }, 404, origin);
    }

    return createResponse(
      {
        message: 'Transaction updated successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error updating financial transaction:', error);
    return createResponse(
      { error: 'Failed to update transaction' },
      500,
      origin,
    );
  }
}

/**
 * DELETE /financial/transactions/{id}
 * Deletes a financial transaction (requires admin Steam ID)
 */
export async function handleDeleteTransaction(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate admin access
  const adminValidation = await validateAdminAccess(request, env);
  if (!adminValidation.isAdmin) {
    return createResponse(
      {
        error: adminValidation.error || 'Admin access required',
      },
      403,
      origin,
    );
  }

  try {
    const url = new URL(request.url);
    const transactionId = url.pathname.split('/').pop();

    if (!transactionId || isNaN(parseInt(transactionId))) {
      return createResponse(
        { error: 'Valid transaction ID required' },
        400,
        origin,
      );
    }

    const result = await env.ZEITVERTREIB_DATA.prepare(
      `
            DELETE FROM financial_transactions WHERE id = ?
        `,
    )
      .bind(parseInt(transactionId))
      .run();

    if (!result.success) {
      return createResponse(
        { error: 'Failed to delete transaction' },
        500,
        origin,
      );
    }

    if (result.meta.changes === 0) {
      return createResponse({ error: 'Transaction not found' }, 404, origin);
    }

    return createResponse(
      {
        message: 'Transaction deleted successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error deleting financial transaction:', error);
    return createResponse(
      { error: 'Failed to delete transaction' },
      500,
      origin,
    );
  }
}

/**
 * GET /financial/summary
 * Returns financial summary statistics (requires valid Steam auth)
 */
export async function handleGetSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session (any valid Steam user can read)
  const validation = await validateSession(request, env);
  if (!validation.isValid) {
    return createResponse({ error: validation.error }, 401, origin);
  }

  try {
    // Get total balance
    const balanceResult = await env.ZEITVERTREIB_DATA.prepare(
      `
            SELECT 
                SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END) as balance
            FROM financial_transactions
        `,
    ).first();

    // Get monthly totals for the last 12 months
    const monthlyResult = await env.ZEITVERTREIB_DATA.prepare(
      `
            SELECT 
                strftime('%Y-%m', transaction_date) as month,
                SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses
            FROM financial_transactions
            WHERE transaction_date >= date('now', '-12 months')
            GROUP BY strftime('%Y-%m', transaction_date)
            ORDER BY month DESC
        `,
    ).all();

    // Get current month totals
    const currentMonthResult = await env.ZEITVERTREIB_DATA.prepare(
      `
            SELECT 
                SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses
            FROM financial_transactions
            WHERE strftime('%Y-%m', transaction_date) = strftime('%Y-%m', 'now')
        `,
    ).first();

    // Get category breakdown
    const categoryResult = await env.ZEITVERTREIB_DATA.prepare(
      `
            SELECT 
                category,
                transaction_type,
                SUM(amount) as total,
                COUNT(*) as count
            FROM financial_transactions
            WHERE transaction_date >= date('now', '-12 months')
            GROUP BY category, transaction_type
            ORDER BY total DESC
        `,
    ).all();

    return createResponse(
      {
        balance: balanceResult?.['balance'] || 0,
        currentMonth: {
          income: currentMonthResult?.['income'] || 0,
          expenses: currentMonthResult?.['expenses'] || 0,
        },
        monthlyData: monthlyResult.results || [],
        categoryBreakdown: categoryResult.results || [],
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    return createResponse({ error: 'Failed to fetch summary' }, 500, origin);
  }
}

/**
 * POST /transfer-zvc
 * Transfer ZV Coins (experience) from one user to another with 10% tax
 */
export async function handleTransferZVC(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  // Validate session for the sender
  const validation = await validateSession(request, env);
  if (!validation.isValid) {
    return createResponse({ error: validation.error }, 401, origin);
  }

  try {
    const body = (await request.json()) as {
      recipient?: string;
      amount?: number;
    };
    const { recipient, amount } = body;

    // Validate input
    if (
      !recipient ||
      typeof recipient !== 'string' ||
      recipient.trim() === ''
    ) {
      return createResponse(
        { error: 'Empfänger ist erforderlich' },
        400,
        origin,
      );
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return createResponse(
        { error: 'Gültiger Betrag ist erforderlich' },
        400,
        origin,
      );
    }

    if (!Number.isInteger(amount)) {
      return createResponse(
        { error: 'Betrag muss eine ganze Zahl sein' },
        400,
        origin,
      );
    }

    // Validate minimum transfer amount
    if (amount < 100) {
      return createResponse(
        { error: 'Mindestbetrag für Transfers: 100 ZVC' },
        400,
        origin,
      );
    }

    // Validate maximum transfer amount
    if (amount > 50000) {
      return createResponse(
        { error: 'Maximaler Transferbetrag: 50.000 ZVC' },
        400,
        origin,
      );
    }

    const senderSteamId = validation.steamId! + '@steam';
    const cleanRecipient = recipient.trim();

    // Prevent self-transfer
    if (senderSteamId === cleanRecipient) {
      return createResponse(
        { error: 'Du kannst nicht an dich selbst senden' },
        400,
        origin,
      );
    }

    // Calculate tax (10%)
    const taxRate = 0.1;
    const taxAmount = Math.floor(amount * taxRate);
    const totalCost = amount + taxAmount; // Total amount to deduct from sender

    // Check if sender has enough ZVC (needs 110% of transfer amount)
    const senderData = (await env.ZEITVERTREIB_DATA.prepare(
      'SELECT experience FROM playerdata WHERE id = ?',
    )
      .bind(senderSteamId)
      .first()) as { experience: number } | null;

    if (!senderData) {
      return createResponse(
        {
          error: 'Sender ' + senderSteamId + ' nicht in der Datenbank gefunden',
        },
        404,
        origin,
      );
    }

    const senderBalance = senderData.experience || 0;
    if (senderBalance < totalCost) {
      return createResponse(
        {
          error: `Nicht genügend ZVC. Benötigt: ${totalCost} ZVC (${amount} + ${taxAmount} Steuer), Verfügbar: ${senderBalance} ZVC`,
        },
        400,
        origin,
      );
    }

    // Determine if input is Steam ID or username
    let recipientData: { id: string; experience: number } | null = null;

    // First, try to parse as Steam ID
    let recipientSteamId = cleanRecipient;
    if (recipientSteamId.endsWith('@steam')) {
      recipientSteamId = recipientSteamId.slice(0, -6); // Remove "@steam"
    }

    // Check if it's a valid Steam ID format (17 digits)
    if (/^\d{17}$/.test(recipientSteamId)) {
      // It's a Steam ID - query by id column with @steam suffix
      recipientData = (await env.ZEITVERTREIB_DATA.prepare(
        'SELECT id, experience FROM playerdata WHERE id = ?',
      )
        .bind(recipientSteamId + '@steam')
        .first()) as { id: string; experience: number } | null;
    } else {
      // It's not a Steam ID - treat as username and query by username column
      recipientData = (await env.ZEITVERTREIB_DATA.prepare(
        'SELECT id, experience FROM playerdata WHERE username = ?',
      )
        .bind(cleanRecipient)
        .first()) as { id: string; experience: number } | null;
    }

    if (!recipientData) {
      return createResponse(
        {
          error: `Empfänger "${cleanRecipient}" nicht in der Datenbank gefunden. Bitte gib eine gültige Steam ID (17 Ziffern) oder einen Benutzernamen ein.`,
        },
        400,
        origin,
      );
    }

    const recipientBalance = recipientData.experience || 0;
    const finalRecipientId = recipientData.id;

    // Perform the transfer in a transaction
    try {
      // Deduct total cost from sender (amount + tax)
      await env.ZEITVERTREIB_DATA.prepare(
        'UPDATE playerdata SET experience = experience - ? WHERE id = ?',
      )
        .bind(totalCost, senderSteamId)
        .run();

      // Add only the transfer amount to recipient (not including tax)
      await env.ZEITVERTREIB_DATA.prepare(
        'UPDATE playerdata SET experience = experience + ? WHERE id = ?',
      )
        .bind(amount, finalRecipientId)
        .run();

      // Calculate new balances
      const newSenderBalance = senderBalance - totalCost;
      const newRecipientBalance = recipientBalance + amount;

      return createResponse(
        {
          success: true,
          message: `${amount} ZVC erfolgreich an ${finalRecipientId} gesendet!`,
          transfer: {
            amount,
            tax: taxAmount,
            totalCost,
            recipient: finalRecipientId,
            senderNewBalance: newSenderBalance,
            recipientNewBalance: newRecipientBalance,
          },
        },
        200,
        origin,
      );
    } catch (dbError) {
      console.error('Database error during transfer:', dbError);
      return createResponse(
        { error: 'Transfer fehlgeschlagen - Datenbankfehler' },
        500,
        origin,
      );
    }
  } catch (error) {
    console.error('Error in ZVC transfer:', error);
    if (error instanceof SyntaxError) {
      return createResponse({ error: 'Ungültiges JSON' }, 400, origin);
    }
    return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
  }
}
