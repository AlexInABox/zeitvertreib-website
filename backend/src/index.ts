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
import { handleGetZeitvertreibCoins, handleTransferZVC } from './routes/zvc.js';
import { handlePostSpray, handleGetSpray, handleDeleteSpray } from './routes/sprays.js';
import { getFakerank, updateFakerank, deleteFakerank } from './routes/fakerank.js';
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
import { handleGetAdventCalendar, handleRedeemAdventDoor } from './routes/adventcalendar.js';
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
import { handlePostPaysafe, handleGetPaysafe } from './routes/paysafe.js';

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
const routes: Record<string, (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>> = {
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
  'GET:/zvc': handleGetZeitvertreibCoins,
  'GET:/cases/upload': handleCaseFileUpload,
  'GET:/cases': handleListCases,
  'POST:/cases': handleCreateCase,
  'GET:/cases/files': handleListCaseFiles,
  'GET:/cases/metadata': handleGetCaseMetadata,
  'PUT:/cases/metadata': handleUpdateCaseMetadata,
  'GET:/cases/file/hash': handleGetFileHash,
  'DELETE:/cases/file': handleDeleteCaseFile,

  // Spray routes
  'POST:/spray': handlePostSpray,
  'GET:/spray': handleGetSpray,
  'DELETE:/spray': handleDeleteSpray,

  // Fakerank routes
  'GET:/fakerank': getFakerank,
  'POST:/fakerank': updateFakerank,
  'PATCH:/fakerank': updateFakerank,
  'DELETE:/fakerank': deleteFakerank,

  // Fakerank admin routes
  'GET:/fakerank-admin/user': handleGetUserFakerank,
  'POST:/fakerank-admin/user': handleSetUserFakerank,
  'GET:/fakerank-admin/blacklist': handleGetBlacklist,
  'POST:/fakerank-admin/blacklist': handleAddToBlacklist,
  'DELETE:/fakerank-admin/blacklist': handleRemoveFromBlacklist,
  'GET:/fakerank-admin/whitelist': handleGetWhitelist,
  'POST:/fakerank-admin/whitelist': handleAddToWhitelist,
  'DELETE:/fakerank-admin/whitelist': handleRemoveFromWhitelist,

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

  // Advent Calendar routes
  'GET:/adventcalendar': handleGetAdventCalendar,
  'POST:/adventcalendar/redeem': handleRedeemAdventDoor,

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

  // Paysafe routes
  'POST:/paysafe': handlePostPaysafe,
  'GET:/paysafe': handleGetPaysafe,
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

      /*
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
        */

      // Determine route key from method + pathname
      const routeKey = `${request.method}:${pathname}`;

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

    // Update leaderboard every 15 minutes
    if (controller.cron === '*/15 * * * *') {
      ctx.waitUntil(updateLeaderboard(db, env, ctx));
    }

    // Flush advent calendar table on January 2nd at 03:00 UTC
    if (controller.cron === '0 3 2 1 *') {
      console.log('Running annual advent calendar flush...');
      try {
        await db.delete(schema.adventCalendar);
        console.log('Advent calendar table flushed successfully');
      } catch (error) {
        console.error('Failed to flush advent calendar:', error);
      }
    }
  },
} satisfies ExportedHandler<Env>;

// Export PlayerlistStorage for Durable Object
export { PlayerlistStorage };
