import express from 'express';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
const PORT = 3000;
app.set('trust proxy', 1);

// Database
fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
const db = new Database('data/counted.db');
const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf-8');
db.exec(schema);

// Config
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('Missing API_KEY environment variable');
  process.exit(1);
}

const ALLOWED_ORIGINS = new Set([
  'https://dev.zeitvertreib.vip',
  'https://zeitvertreib.vip',
  'https://www.zeitvertreib.vip',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

// Middleware
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    handler: (_, res) => res.status(429).json({ error: 'Too many requests' }),
  }),
);

app.use(express.text({ type: '*/*', limit: '1kb' }));

// Helpers
function applyCorsHeaders(req: express.Request, res: express.Response): boolean {
  const origin = req.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  return true;
}

// Routes
app.options('/', (req, res) => {
  if (!applyCorsHeaders(req, res)) return res.status(403).json({ error: 'Forbidden origin' });
  return res.status(204).send();
});

app.post('/', (req, res) => {
  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const num = Number(req.body);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 99) {
    return res.status(400).json({ error: 'Body must be an integer between 0 and 99' });
  }

  try {
    // POST - insert
    db.prepare(
      `
  INSERT INTO readings (ts, val)
  SELECT $ts, $val
  WHERE NOT EXISTS (
    SELECT 1 FROM readings
    WHERE val = $val
    AND ts = (SELECT MAX(ts) FROM readings)
  )
`,
    ).run({ ts: Date.now(), val: num });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Insert failed:', err);
    return res.status(502).json({ error: 'Failed to store reading' });
  }
});

app.get('/', (req, res) => {
  applyCorsHeaders(req, res);

  const startSec = Number(req.query.startDate);
  const endSec = Number(req.query.endDate);

  if (!Number.isInteger(startSec) || !Number.isInteger(endSec) || startSec <= 0 || endSec <= 0) {
    return res.status(400).json({ error: 'startDate and endDate must be positive integers (epoch seconds)' });
  }

  if (endSec <= startSec) {
    return res.status(400).json({ error: 'endDate must be after startDate' });
  }

  if (endSec - startSec > ONE_YEAR_SEC) {
    return res.status(400).json({ error: 'Date range cannot exceed 1 year' });
  }

  const startMs = startSec * 1000;
  const endMs = endSec * 1000;

  try {
    const rows = db
      .prepare(
        `
      SELECT ts, val
      FROM readings
      WHERE ts >= (
        SELECT COALESCE(MAX(ts), 0)
        FROM readings
        WHERE ts <= $start
      )
      AND ts <= $end
      ORDER BY ts
    `,
      )
      .all({ start: startMs, end: endMs }) as Array<{ ts: number; val: number }>;

    return res.json({
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
      count: rows.length,
      readings: rows.map((r) => ({ ts: Math.floor(r.ts / 1000), val: r.val })),
    });
  } catch (err) {
    console.error('Query failed:', err);
    return res.status(502).json({ error: 'Failed to query readings' });
  }
});

app.listen(PORT, () => console.log(`Counted running on port ${PORT} `));
