# Zeitvertreib Backend

A lightweight Cloudflare Workers backend for Steam authentication and player statistics.

## Structure

- `src/index.ts` - Main worker entry point with route handling
- `src/utils.ts` - Consolidated utilities (Steam, session, database, response helpers)
- `src/routes/auth.ts` - Steam authentication endpoints
- `src/routes/stats.ts` - Player statistics endpoint
- `src/types/index.ts` - TypeScript interfaces

## Environment Variables

### Required Variables

- `STEAM_API_KEY` - Your Steam Web API key
- `FRONTEND_URL` - Frontend application URL
- `BACKEND_URL` - Backend worker URL

### Discord Integration

- `SPRAY_MOD_WEBHOOK` - Discord webhook URL for spray moderation
- `LEADERBOARD_WEBHOOK` - Discord webhook URL for leaderboard updates
- `LEADERBOARD_MESSAGE_ID` - Discord message ID to edit for leaderboard

### Proxy Configuration (Optional)

For Discord API calls, you can configure a proxy to route requests through:

- `PROXY_HOST_PORT` - Proxy server address (format: `host:port`, e.g., `217.154.204.87:7432`)
- `PROXY_USERNAME` - Proxy authentication username
- `PROXY_PASSWORD` - Proxy authentication password

**Example proxy configuration:**

```bash
PROXY_HOST_PORT=217.154.204.87:7432
PROXY_USERNAME=cloudflare
PROXY_PASSWORD=supersecretpassword
```

When configured, all Discord API calls will automatically route through the specified proxy. This is useful for bypassing regional restrictions or adding an additional layer of privacy.

## API Endpoints

- `GET /auth/steam` - Initiate Steam login
- `GET /auth/steam/callback` - Steam login callback
- `GET /auth/me` - Get current user info
- `POST /auth/logout` - Logout user
- `GET /stats` - Get player statistics (requires authentication)
- `POST /spray/upload` - Upload and process an image as a spray (requires authentication)
- `GET /spray/image` - Get the processed spray image (requires authentication)
- `GET /spray/string` - Get the spray as a pixel art string (requires authentication)

### Spray Endpoints Details

#### POST /spray/upload

Uploads an image file and processes it into a 400x400 pixel spray with pixel art representation.

**Request:**

- Method: POST
- Content-Type: multipart/form-data
- Authentication: Required (Steam session)
- Body: Form data with 'image' field containing the image file

**Response:**

```json
{
  "success": true,
  "message": "Spray uploaded and processed successfully",
  "pixelString": "<color=#ff0000>███</color><color=#00ff00>████</color>..."
}
```

#### GET /spray/image

Returns the processed spray image as PNG.

**Response:** Binary PNG image data

#### GET /spray/string

Returns the spray as a pixel art string with color information.

**Response:**

```json
{
  "pixelString": "<color=#ff0000>███</color><color=#00ff00>████</color>\n<color=#0000ff>██</color>...",
  "uploadedAt": 1642579200000,
  "originalFileName": "spray.png"
}
```

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
