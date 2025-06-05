# Zeitvertreib Backend

A lightweight Cloudflare Workers backend for Steam authentication and player statistics.

## Structure

- `src/index.ts` - Main worker entry point with route handling
- `src/utils.ts` - Consolidated utilities (Steam, session, database, response helpers)
- `src/routes/auth.ts` - Steam authentication endpoints
- `src/routes/stats.ts` - Player statistics endpoint
- `src/types/index.ts` - TypeScript interfaces

## API Endpoints

- `GET /auth/steam` - Initiate Steam login
- `GET /auth/steam/callback` - Steam login callback
- `GET /auth/me` - Get current user info
- `POST /auth/logout` - Logout user
- `GET /stats` - Get player statistics (requires authentication)

## Environment Variables

- `STEAM_API_KEY` - Steam Web API key
- `FRONTEND_URL` - Frontend URL for redirects (default: http://localhost:4200)
- `SESSIONS` - Cloudflare KV namespace for sessions
- `zeitvertreib-data` - Cloudflare D1 database binding

## Development

```bash
npm install
npm run dev
```

## Deployment

```bash
npm run deploy
```
