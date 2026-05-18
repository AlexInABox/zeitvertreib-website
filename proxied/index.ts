import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const app = express();
const port = 3000;
const allowedOrigins = new Set([
  'https://dev.zeitvertreib.vip',
  'https://zeitvertreib.vip',
  'https://www.zeitvertreib.vip',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
const allowedMedalOrigin = 'https://cdn.medal.tv';

function applyCorsHeaders(req: express.Request, res: express.Response): string | null {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    return null;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  return origin;
}

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // limit each origin to 50 requests per windowMs
  keyGenerator: (req) => {
    const origin = req.get('origin');
    return origin || ipKeyGenerator(req as any);
  },
  handler: (_, res) => res.status(429).json({ error: 'Too many requests' }),
});

app.use(limiter);

app.options('/', (req, res) => {
  const allowedOrigin = applyCorsHeaders(req, res);
  if (!allowedOrigin) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  return res.status(204).send();
});

app.get('/', async (req, res) => {
  const allowedOrigin = applyCorsHeaders(req, res);
  if (!allowedOrigin) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  const url = req.query.url;
  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  try {
    const parsed = new URL(url);
    if (parsed.origin !== allowedMedalOrigin) {
      return res.status(400).json({ error: 'url must be from https://cdn.medal.tv' });
    }

    const upstream = await fetch(url);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ error: 'Failed to fetch url' });
  }
});

app.all('/unrestricted', async (req, res) => {
  const authHeader = req.get('PROXIED-Authorization');
  const apiKey = process.env.PROXIED_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = req.query.url;
  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  try {
    const headers = new Headers();
    for (const key in req.headers) {
      if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'proxied-authorization') {
        const value = req.headers[key];
        if (typeof value === 'string') {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        }
      }
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      fetchOptions.body = Buffer.concat(chunks);
    }

    const upstream = await fetch(url, fetchOptions);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ error: 'Failed to fetch url' });
  }
});

app.listen(port, () => console.log(`Proxy running on port ${port}`));
