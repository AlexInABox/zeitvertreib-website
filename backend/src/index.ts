import {
  handleSteamLogin,
  handleSteamCallback,
  handleGetUser,
  handleLogout,
} from './routes/auth.js';
import { handleGetStats } from './routes/stats.js';
import {
  handleUploadSpray,
  handleGetSpray,
  handleGetSprayString,
  handleDeleteSpray,
  handleModerationDelete,
  handleModerationBan,
  handleGetUploadLimits,
  handleGetSprayBanStatus,
} from './routes/spray.js';
import {
  handleFakerank,
  handleFakerankModerationDelete,
  handleFakerankModerationBan,
} from './routes/profile.js';
import {
  handleGetUserFakerank,
  handleSetUserFakerank,
  handleGetBlacklist,
  handleAddToBlacklist,
  handleRemoveFromBlacklist,
  handleGetWhitelist,
  handleAddToWhitelist,
  handleRemoveFromWhitelist,
  handleGetAllFakeranks,
} from './routes/fakerank-admin.js';
import {
  handleGetTransactions,
  handleCreateTransaction,
  handleUpdateTransaction,
  handleDeleteTransaction,
  handleGetSummary,
  handleGetRecurringTransactions,
  handleCreateRecurringTransaction,
  handleUpdateRecurringTransaction,
  handleDeleteRecurringTransaction,
  processRecurringTransactions,
} from './routes/financial.js';
import {
  updateLeaderboard,
  handleLeaderboardUpdate,
} from './routes/leaderboard.js';

// Simple response helper for internal use
function createResponse(
  data: any,
  status = 200,
  origin?: string | null,
): Response {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };

  return new Response(JSON.stringify(data), { status, headers });
}

// Route handlers
const routes: Record<
  string,
  (request: Request, env: Env) => Promise<Response>
> = {
  '/auth/steam': handleSteamLogin,
  '/auth/steam/callback': handleSteamCallback,
  '/auth/me': handleGetUser,
  '/auth/logout': handleLogout,
  '/stats': handleGetStats,
  '/spray/upload': handleUploadSpray,
  '/spray/image': handleGetSpray,
  '/spray/string': handleGetSprayString,
  '/spray/delete': handleDeleteSpray,
  '/spray/moderate/delete': handleModerationDelete,
  '/spray/moderate/ban': handleModerationBan,
  '/spray/upload-limits': handleGetUploadLimits,
  '/spray/ban-status': handleGetSprayBanStatus,
  '/fakerank': handleFakerank,
  '/fakerank/moderate/delete': handleFakerankModerationDelete,
  '/fakerank/moderate/ban': handleFakerankModerationBan,
  '/fakerank-admin/user': handleFakerankAdminUser,
  '/fakerank-admin/blacklist': handleFakerankAdminBlacklist,
  '/fakerank-admin/whitelist': handleFakerankAdminWhitelist,
  '/fakerank-admin/all-fakeranks': handleGetAllFakeranks,
  '/financial/transactions': handleFinancialTransactions,
  '/financial/recurring': handleRecurringTransactions,
  '/financial/summary': handleGetSummary,
  '/leaderboard/update': handleLeaderboardUpdate,
};

// Helper function to route recurring transactions based on method and path
async function handleRecurringTransactions(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // Handle different HTTP methods for /financial/recurring
  if (url.pathname === '/financial/recurring') {
    if (method === 'GET') {
      return handleGetRecurringTransactions(request, env);
    } else if (method === 'POST') {
      return handleCreateRecurringTransaction(request, env);
    }
  }

  // Handle /financial/recurring/{id} for PUT and DELETE
  const recurringIdMatch = url.pathname.match(
    /^\/financial\/recurring\/(\d+)$/,
  );
  if (recurringIdMatch) {
    if (method === 'PUT') {
      return handleUpdateRecurringTransaction(request, env);
    } else if (method === 'DELETE') {
      return handleDeleteRecurringTransaction(request, env);
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper function to route financial transactions based on method and path
async function handleFinancialTransactions(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // Handle different HTTP methods for /financial/transactions
  if (url.pathname === '/financial/transactions') {
    if (method === 'GET') {
      return handleGetTransactions(request, env);
    } else if (method === 'POST') {
      return handleCreateTransaction(request, env);
    }
  }

  // Handle /financial/transactions/{id} for PUT and DELETE
  const transactionIdMatch = url.pathname.match(
    /^\/financial\/transactions\/(\d+)$/,
  );
  if (transactionIdMatch) {
    if (method === 'PUT') {
      return handleUpdateTransaction(request, env);
    } else if (method === 'DELETE') {
      return handleDeleteTransaction(request, env);
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper function to route fakerank admin user operations based on method
async function handleFakerankAdminUser(
  request: Request,
  env: Env,
): Promise<Response> {
  const method = request.method;

  if (method === 'GET') {
    return handleGetUserFakerank(request, env);
  } else if (method === 'POST') {
    return handleSetUserFakerank(request, env);
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper function to route fakerank admin blacklist operations based on method
async function handleFakerankAdminBlacklist(
  request: Request,
  env: Env,
): Promise<Response> {
  const method = request.method;

  if (method === 'GET') {
    return handleGetBlacklist(request, env);
  } else if (method === 'POST') {
    return handleAddToBlacklist(request, env);
  } else if (method === 'DELETE') {
    return handleRemoveFromBlacklist(request, env);
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper function to route fakerank admin whitelist operations based on method
async function handleFakerankAdminWhitelist(
  request: Request,
  env: Env,
): Promise<Response> {
  const method = request.method;

  if (method === 'GET') {
    return handleGetWhitelist(request, env);
  } else if (method === 'POST') {
    return handleAddToWhitelist(request, env);
  } else if (method === 'DELETE') {
    return handleRemoveFromWhitelist(request, env);
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }

    try {
      const url = new URL(request.url);

      // Handle financial routes with dynamic paths
      if (url.pathname.startsWith('/financial/transactions')) {
        return await handleFinancialTransactions(request, env);
      }

      // Handle recurring financial routes with dynamic paths
      if (url.pathname.startsWith('/financial/recurring')) {
        return await handleRecurringTransactions(request, env);
      }

      const handler = routes[url.pathname];
      if (handler) {
        // Handle method-specific routing for spray upload
        if (url.pathname === '/spray/upload' && request.method !== 'POST') {
          return createResponse({ error: 'Method Not Allowed' }, 405, origin);
        }
        if (
          (url.pathname === '/spray/image' ||
            url.pathname === '/spray/string') &&
          request.method !== 'GET'
        ) {
          return createResponse({ error: 'Method Not Allowed' }, 405, origin);
        }
        if (url.pathname === '/spray/delete' && request.method !== 'DELETE') {
          return createResponse({ error: 'Method Not Allowed' }, 405, origin);
        }

        return await handler(request, env);
      }
      return createResponse({ error: 'Not Found' }, 404, origin);
    } catch (error) {
      console.error('Request error:', error);
      return createResponse({ error: 'Internal Server Error' }, 500, origin);
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Process recurring transactions daily (6:00 AM)
    if (controller.cron === '0 6 * * *') {
      ctx.waitUntil(processRecurringTransactions(env));
    }

    // Update leaderboard every 30 minutes
    if (controller.cron === '*/15 * * * *') {
      ctx.waitUntil(updateLeaderboard(env));
    }
  },
} satisfies ExportedHandler<Env>;
