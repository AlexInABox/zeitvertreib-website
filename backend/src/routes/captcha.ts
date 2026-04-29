import { createResponse } from '../utils.js';
import type { CaptchaResponse } from '@zeitvertreib/types';

const CAPTCHA_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CAPTCHA_LENGTH = 5;
const CAPTCHA_TTL_SECONDS = 300; // 5 minutes
const CAPTCHA_RATELIMIT_MAX = 20; // max captcha requests per IP per minute
const CAPTCHA_RATELIMIT_TTL = 60; // rate limit window in seconds

// Colour palette — stands out on dark background
const CHAR_COLORS = [
  '#e5e5e5', '#c8b5ff', '#ffd86e', '#ff9eb5',
  '#7effc4', '#7dd3fc', '#f97316', '#a78bfa', '#34d399',
];

// 5×7 pixel-art bitmap font.
// Each entry is 7 numbers (one per row, top→bottom).
// Each number is a 5-bit mask: bit4 = leftmost column, bit0 = rightmost column.
const FONT_BITMAPS: Record<string, readonly number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10000, 0b10000, 0b10011, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  J: [0b00011, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10011, 0b01111],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01110, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b01110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b11011, 0b01010],
  X: [0b10001, 0b01010, 0b01010, 0b00100, 0b01010, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  '6': [0b01111, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

// Layout constants
const PIXEL_SIZE = 3; // each "on" pixel renders as a 3×3 rect
const PIXEL_STEP = 4; // 3px rect + 1px gap
const CHAR_COLS = 5;
const CHAR_ROWS = 7;
const CHAR_W = CHAR_COLS * PIXEL_STEP; // 20px per character
const CHAR_H = CHAR_ROWS * PIXEL_STEP; // 28px per character
const CHAR_GAP = 8;
const SVG_W = 240;
const SVG_H = 80;
const MARGIN_LEFT = Math.round((SVG_W - (CAPTCHA_LENGTH * CHAR_W + (CAPTCHA_LENGTH - 1) * CHAR_GAP)) / 2);
const BASELINE = Math.round((SVG_H - CHAR_H) / 2);
const WAVE_AMPLITUDE = 8;

function generateCaptchaText(buf: Uint8Array): string {
  let text = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    text += CAPTCHA_CHARSET[buf[i]! % CAPTCHA_CHARSET.length];
  }
  return text;
}

function buildSvg(answer: string, buf: Uint8Array): string {
  // Wave phase randomised from buf[5]
  const wavePhase = (buf[5]! / 255) * Math.PI * 2;

  // Build pixel rects for each character
  const rects: string[] = [];
  for (let ci = 0; ci < CAPTCHA_LENGTH; ci++) {
    const char = answer[ci]!;
    const bitmap = FONT_BITMAPS[char];
    if (!bitmap) continue;

    const color = CHAR_COLORS[buf[6 + ci]! % CHAR_COLORS.length]!;
    const jitterX = (buf[11 + ci]! % 9) - 4; // ±4 px
    const jitterY = (buf[16 + ci]! % 7) - 3; // ±3 px
    const waveY = Math.round(WAVE_AMPLITUDE * Math.sin(ci * 1.3 + wavePhase));
    const originX = MARGIN_LEFT + ci * (CHAR_W + CHAR_GAP) + jitterX;
    const originY = BASELINE + waveY + jitterY;

    for (let row = 0; row < CHAR_ROWS; row++) {
      const rowBits = bitmap[row]!;
      for (let col = 0; col < CHAR_COLS; col++) {
        if (!((rowBits >> (CHAR_COLS - 1 - col)) & 1)) continue;
        const px = originX + col * PIXEL_STEP;
        const py = originY + row * PIXEL_STEP;
        rects.push(`<rect x="${px}" y="${py}" width="${PIXEL_SIZE}" height="${PIXEL_SIZE}" fill="${color}" opacity="0.92"/>`);
      }
    }
  }

  // 8 noise lines crossing the character zone
  const lines: string[] = [];
  for (let i = 0; i < 8; i++) {
    const b = 60 + i * 6;
    const x1 = buf[b]! % SVG_W;
    const y1 = buf[b + 1]! % SVG_H;
    const x2 = buf[b + 2]! % SVG_W;
    const y2 = buf[b + 3]! % SVG_H;
    const sw = 1 + (buf[b + 4]! % 2);
    const opacity = (20 + (buf[b + 5]! % 35)) / 100;
    const lc = CHAR_COLORS[buf[b]! % CHAR_COLORS.length]!;
    lines.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lc}" stroke-width="${sw}" opacity="${opacity.toFixed(2)}"/>`,
    );
  }

  // 30 noise dots
  const dots: string[] = [];
  for (let i = 0; i < 30; i++) {
    const b = 108 + i * 4;
    const cx = buf[b % 256]! % SVG_W;
    const cy = buf[(b + 1) % 256]! % SVG_H;
    const r = 1 + (buf[(b + 2) % 256]! % 2);
    const dc = CHAR_COLORS[buf[(b + 3) % 256]! % CHAR_COLORS.length]!;
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dc}" opacity="0.25"/>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" width="${SVG_W}" height="${SVG_H}" ` +
    `aria-hidden="true" focusable="false">` +
    `<rect width="${SVG_W}" height="${SVG_H}" fill="#0d1117" rx="6"/>` +
    lines.join('') +
    dots.join('') +
    rects.join('') +
    `</svg>`
  );
}

/// GET /captcha
export async function handleGetCaptcha(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Per-IP rate limiting — max 20 captchas per minute
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
  const rateLimitKey = `captcha_ratelimit:${ip}`;
  const countStr = await env.SESSIONS.get(rateLimitKey);
  const count = countStr ? parseInt(countStr, 10) : 0;
  if (count >= CAPTCHA_RATELIMIT_MAX) {
    return createResponse({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, 429, origin);
  }
  await env.SESSIONS.put(rateLimitKey, String(count + 1), { expirationTtl: CAPTCHA_RATELIMIT_TTL });

  // 256 bytes of cryptographic randomness drives both text and SVG
  const buf = new Uint8Array(256);
  crypto.getRandomValues(buf);

  const answer = generateCaptchaText(buf);
  const svg = buildSvg(answer, buf);
  const captchaId = crypto.randomUUID();

  // Store as JSON with createdAt so verifyCaptcha can enforce minimum solve time
  const storedValue = JSON.stringify({ answer, createdAt: Date.now() });
  await env.SESSIONS.put(`captcha:${captchaId}`, storedValue, { expirationTtl: CAPTCHA_TTL_SECONDS });

  const responseBody: CaptchaResponse = { id: captchaId, svg };
  return createResponse(responseBody, 200, origin);
}

export async function handleCheckCaptcha(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const captchaId = url.searchParams.get('captchaId') ?? '';
  const captchaAnswer = url.searchParams.get('captchaAnswer') ?? '';

  if (!captchaId || !captchaAnswer) {
    return createResponse({ error: 'Fehlende Parameter.' }, 400, origin);
  }

  const storedValue = await env.SESSIONS.get(`captcha:${captchaId}`);
  if (storedValue === null) {
    return createResponse({ error: 'Captcha ungültig oder abgelaufen.' }, 400, origin);
  }

  let storedAnswer: string;
  try {
    const parsed = JSON.parse(storedValue) as { answer: string; createdAt: number };
    storedAnswer = parsed.answer;
  } catch {
    return createResponse({ error: 'Interner Fehler.' }, 500, origin);
  }

  if (storedAnswer.toUpperCase() !== captchaAnswer.toUpperCase()) {
    return createResponse({ error: 'Falsche Antwort.' }, 400, origin);
  }

  return createResponse({ ok: true }, 200, origin);
}
