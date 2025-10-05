# Zeitvertreib Website

A full-stack web application with Angular frontend and Cloudflare Workers backend for Steam player statistics.

## Quick Local Setup

### Prerequisites

- Node.js 18+
- npm

### Backend Setup

```bash
cd backend
npm install
npx wrangler d1 execute zeitvertreib-data --local --file=schema.sql
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

### Environment Variables

Create `backend/.dev.vars`:

```
STEAM_API_KEY=your_steam_api_key
FRONTEND_URL=http://localhost:4200
```

## URLs

- Frontend: http://localhost:4200
- Backend: http://localhost:8787

## Features

- Steam authentication
- Player statistics dashboard
- Real-time data sync
