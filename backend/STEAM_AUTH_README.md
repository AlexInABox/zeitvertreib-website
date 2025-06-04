# Steam Authentication API

This Cloudflare Worker provides a complete Steam OpenID authentication system with persistent sessions using KV storage.

## Setup

1. **Get a Steam API Key**:
   - Go to https://steamcommunity.com/dev/apikey
   - Register your domain and get your API key

2. **Configure Environment**:
   ```bash
   # Set your Steam API key as a secret (recommended)
   wrangler secret put STEAM_API_KEY
   
   # Or update wrangler.jsonc vars section with your key
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

## API Endpoints

### `GET /auth/steam`
Initiates Steam OpenID authentication.

**Query Parameters:**
- `return_url` (optional): URL to redirect after successful authentication

**Response:** Redirects to Steam login page

### `GET /auth/steam/callback`
Handles the Steam OpenID callback and creates a session.

**Response:**
```json
{
  "success": true,
  "user": {
    "steamid": "76561198000000000",
    "personaname": "Username",
    "profileurl": "https://steamcommunity.com/profiles/76561198000000000/",
    "avatar": "https://avatars.cloudflare.steamstatic.com/...",
    "avatarmedium": "https://avatars.cloudflare.steamstatic.com/...",
    "avatarfull": "https://avatars.cloudflare.steamstatic.com/..."
  },
  "sessionId": "uuid-session-id"
}
```

Sets a secure HTTP-only session cookie (7 days expiry).

### `GET /auth/me`
Gets the current authenticated user's information.

**Response:**
```json
{
  "user": {
    "steamid": "76561198000000000",
    "personaname": "Username",
    "profileurl": "https://steamcommunity.com/profiles/76561198000000000/",
    "avatar": "https://avatars.cloudflare.steamstatic.com/...",
    "avatarmedium": "https://avatars.cloudflare.steamstatic.com/...",
    "avatarfull": "https://avatars.cloudflare.steamstatic.com/..."
  }
}
```

### `POST /auth/logout`
Logs out the current user and destroys the session.

**Response:**
```json
{
  "success": true
}
```

## Usage Example

```javascript
// Frontend JavaScript example
const API_BASE = 'https://your-worker-domain.workers.dev';

// Login
window.location.href = `${API_BASE}/auth/steam`;

// Check if user is logged in
async function getCurrentUser() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include'
  });
  
  if (response.ok) {
    const data = await response.json();
    return data.user;
  }
  return null;
}

// Logout
async function logout() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
}
```

## Features

- ✅ Steam OpenID authentication
- ✅ Secure session management with KV storage
- ✅ HTTP-only, secure cookies
- ✅ 7-day session expiry
- ✅ CORS support
- ✅ TypeScript support
- ✅ Automatic session cleanup

## Session Storage

Sessions are stored in Cloudflare KV with automatic expiration. Each session contains:
- Steam ID
- Complete Steam user profile data
- Creation and expiration timestamps

The session duration is 7 days and automatically extends on each request.
