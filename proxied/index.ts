import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const app = express();
const port = 3000;
const allowedOrigins = new Set(['https://dev.zeitvertreib.vip', 'https://zeitvertreib.vip']);
const allowedMedalOrigin = 'https://cdn.medal.tv';

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

app.get('/', async (req, res) => {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    return res.status(403).send('Forbidden origin');
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');

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

app.listen(port, () => console.log(`Proxy running on port ${port}`));
