import openapi from './openapi.json';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema.js';
import {
  handleSteamLogin,
  handleSteamCallback,
  handleGetUser,
  handleLogout,
  handleGenerateLoginSecret,
  handleLoginWithSecret,
} from './routes/auth.js';
import { handleGetStats, handlePostStats } from './routes/stats.js';
import { handleGetPublicStats } from './routes/public-stats.js';
import { handleGetZeitvertreibCoins } from './routes/zvc.js';
import {
  handleUploadSpray,
  handleGetSpray,
  handleGetSprayString,
  handleDeleteSpray,
  handleModerationDelete,
  handleModerationBan,
  handleModerationUnban,
  handleModerationUndelete,
  handleGetUploadLimits,
  handleGetSprayBanStatus,
  handleBackgroundRemoval,
} from './routes/spray.js';
import {
  getFakerank,
  updateFakerank,
  deleteFakerank,
  handleFakerankModerationDelete,
  handleFakerankModerationBan,
} from './routes/fakerank.js';
import {
  handleGetUserFakerank,
  handleSetUserFakerank,
  handleGetBlacklist,
  handleAddToBlacklist,
  handleRemoveFromBlacklist,
  handleGetWhitelist,
  handleAddToWhitelist,
  handleRemoveFromWhitelist,
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
  handleTransferZVC,
} from './routes/financial.js';
import { handleGetRedeemables, handleRedeemItem, handleRedeemCode } from './routes/redeemables.js';
import { updateLeaderboard, handleLeaderboardUpdate } from './routes/leaderboard.js';
import { handleSlotMachine, handleSlotMachineInfo } from './routes/slotmachine.js';
import { handleLuckyWheel, handleLuckyWheelInfo } from './routes/luckywheel.js';
import { handleSwapped } from './routes/swapped.js';
import { handleDiscordLogin, handleDiscordCallback } from './routes/discord.js';
import { handleDiscordBotInteractions } from './routes/discord-bot.js';
import { PlayerlistStorage } from './discord/playerlist-storage.js';
import { handleGetPlayerlist, handleUpdatePlayerlist } from './routes/playerlist.js';
import { handleDiscordTrackerUpdate, handleDiscordTrackerDelete } from './routes/discord-tracker.js';
import {
  handleCaseFileUpload,
  handleListCases,
  handleCreateCase,
  handleListCaseFiles,
  handleGetCaseMetadata,
  handleUpdateCaseMetadata,
  handleDeleteCaseFile,
  handleGetFileHash,
} from './routes/cases.js';
import { handleKofiWebhook } from './routes/kofi.js';

// Simple response helper for internal use
function createResponse(data: any, status = 200, origin?: string | null): Response {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };

  return new Response(JSON.stringify(data), { status, headers });
}

// Route mapping: path + method -> handler function
const routes: Record<string, (request: Request, env: Env, ctx?: ExecutionContext) => Promise<Response>> = {
  // Auth routes
  'GET:/auth/steam': handleSteamLogin,
  'GET:/auth/steam/callback': handleSteamCallback,
  'GET:/auth/me': handleGetUser,
  'POST:/auth/logout': handleLogout,
  'POST:/auth/generate-login-secret': handleGenerateLoginSecret,
  'GET:/auth/login-with-secret': handleLoginWithSecret,

  // Stats
  'GET:/stats': handleGetStats,
  'POST:/stats': handlePostStats,

  //Public endpoints (no auth)
  'GET:/public/stats': handleGetPublicStats,
  'GET:/public/zvc': handleGetZeitvertreibCoins,
  'GET:/cases/upload': handleCaseFileUpload,
  'GET:/cases': handleListCases,
  'POST:/cases': handleCreateCase,
  'GET:/cases/files': handleListCaseFiles,
  'GET:/cases/metadata': handleGetCaseMetadata,
  'PUT:/cases/metadata': handleUpdateCaseMetadata,
  'GET:/cases/file/hash': handleGetFileHash,
  'DELETE:/cases/file': handleDeleteCaseFile,

  // Spray routes
  'POST:/spray/upload': handleUploadSpray,
  'POST:/spray/remove-background': handleBackgroundRemoval,
  'GET:/spray/image': handleGetSpray,
  'GET:/spray/string': handleGetSprayString,
  'DELETE:/spray/delete': handleDeleteSpray,
  'GET:/spray/moderate/delete': handleModerationDelete,
  'GET:/spray/moderate/ban': handleModerationBan,
  'GET:/spray/moderate/unban': handleModerationUnban,
  'GET:/spray/moderate/undelete': handleModerationUndelete,
  'GET:/spray/upload-limits': handleGetUploadLimits,
  'GET:/spray/ban-status': handleGetSprayBanStatus,

  // Fakerank routes
  'GET:/fakerank': getFakerank,
  'POST:/fakerank': updateFakerank,
  'PATCH:/fakerank': updateFakerank,
  'DELETE:/fakerank': deleteFakerank,
  'GET:/fakerank/moderate/delete': handleFakerankModerationDelete,
  'GET:/fakerank/moderate/ban': handleFakerankModerationBan,

  // Fakerank admin routes
  'GET:/fakerank-admin/user': handleGetUserFakerank,
  'POST:/fakerank-admin/user': handleSetUserFakerank,
  'GET:/fakerank-admin/blacklist': handleGetBlacklist,
  'POST:/fakerank-admin/blacklist': handleAddToBlacklist,
  'DELETE:/fakerank-admin/blacklist': handleRemoveFromBlacklist,
  'GET:/fakerank-admin/whitelist': handleGetWhitelist,
  'POST:/fakerank-admin/whitelist': handleAddToWhitelist,
  'DELETE:/fakerank-admin/whitelist': handleRemoveFromWhitelist,

  // Financial routes
  'GET:/financial/transactions': handleGetTransactions,
  'POST:/financial/transactions': handleCreateTransaction,
  'PUT:/financial/transactions': handleUpdateTransaction,
  'DELETE:/financial/transactions': handleDeleteTransaction,
  'GET:/financial/recurring': handleGetRecurringTransactions,
  'POST:/financial/recurring': handleCreateRecurringTransaction,
  'PUT:/financial/recurring': handleUpdateRecurringTransaction,
  'DELETE:/financial/recurring': handleDeleteRecurringTransaction,
  'GET:/financial/summary': handleGetSummary,

  // Redeemables routes
  'GET:/redeemables': handleGetRedeemables,
  'POST:/redeemables/redeem': handleRedeemItem,
  'POST:/redeem-code': handleRedeemCode,

  // Slot machine routes
  'GET:/slotmachine/info': handleSlotMachineInfo,
  'POST:/slotmachine': handleSlotMachine,

  // Lucky Wheel routes
  'GET:/luckywheel/info': handleLuckyWheelInfo,
  'POST:/luckywheel': handleLuckyWheel,

  // Swapped (role swap) route
  'POST:/swapped/': handleSwapped,

  // Other routes
  'POST:/transfer-zvc': handleTransferZVC,
  'POST:/leaderboard/update': handleLeaderboardUpdate,

  // Discord OAuth2 routes
  'GET:/auth/discord': handleDiscordLogin,
  'GET:/auth/discord/callback': handleDiscordCallback,

  // Discord Bot routes
  'POST:/discord': handleDiscordBotInteractions,

  // Playerlist routes
  'GET:/playerlist': handleGetPlayerlist,
  'POST:/playerlist': handleUpdatePlayerlist,

  // Discord tracker route (Overwatch bot)
  'POST:/discord-tracker': handleDiscordTrackerUpdate,
  'DELETE:/discord-tracker': handleDiscordTrackerDelete,

  // Ko-fi webhook
  'POST:/kofi/webhook': handleKofiWebhook,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

      // Remove /api prefix if present to match our route definitions
      let pathname = url.pathname;
      if (pathname.startsWith('/api')) {
        pathname = pathname.substring(4);
      }

      if (pathname === '/openapi.json' && request.method === 'GET') {
        return new Response(JSON.stringify(openapi), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Serve OpenAPI HTML at /docs
      if (pathname === '/docs' && request.method === 'GET') {
        const redocHtml = `<!doctype html>
        <html>
          <head>
            <title>Scalar API Reference</title>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1" />
          </head>

          <body>
            <div id="app"></div>

            <!-- Load the Script -->
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

            <!-- Initialize the Scalar API Reference -->
            <script>
              Scalar.createApiReference('#app', {
                // The URL of the OpenAPI/Swagger document
                url: 'openapi.json',
              })
            </script>
          </body>
        </html>`;

        return new Response(redocHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // Handle routes with dynamic paths (transactions/{id}, recurring/{id})
      let routeKey = `${request.method}:${pathname}`;

      // Check for dynamic routes
      const transactionIdMatch = pathname.match(/^\/financial\/transactions\/(\d+)$/);
      if (transactionIdMatch) {
        routeKey = `${request.method}:/financial/transactions`;
      }

      const recurringIdMatch = pathname.match(/^\/financial\/recurring\/(\d+)$/);
      if (recurringIdMatch) {
        routeKey = `${request.method}:/financial/recurring`;
      }

      const handler = routes[routeKey];
      if (handler) {
        return await handler(request, env, ctx);
      }
      return createResponse({ error: 'Not Found' }, 404, origin);
    } catch (error) {
      console.error('Request error:', error);
      return createResponse({ error: 'Internal Server Error' }, 500, origin);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.ZEITVERTREIB_DATA, { schema });

    // Process recurring transactions daily (6:00 AM)
    if (controller.cron === '0 6 * * *') {
      ctx.waitUntil(processRecurringTransactions(db, env));
    }

    // Update leaderboard every 30 minutes
    if (controller.cron === '*/15 * * * *') {
      ctx.waitUntil(updateLeaderboard(db, env));
    }
  },
} satisfies ExportedHandler<Env>;

// Export PlayerlistStorage for Durable Object
export { PlayerlistStorage };
