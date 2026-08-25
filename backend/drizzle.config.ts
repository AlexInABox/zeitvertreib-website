import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

const getLocalD1 = () => {
  try {
    const basePath = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    const dbFiles = fs
      .readdirSync(basePath, { encoding: 'utf-8' })
      .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
    const dbFile = dbFiles[0];

    if (!dbFile) {
      throw new Error(`D1 .sqlite file not found in ${basePath} (run 'wrangler dev' once to create local state)`);
    }

    const url = path.resolve(basePath, dbFile);
    return url;
  } catch (err) {
    console.log(`Error  ${err}`);
    return '';
  }
};

const isProd = () => process.env['NODE_ENV'] === 'production';

const getCredentials = () => {
  const prod = {
    driver: 'd1-http',
    dbCredentials: {
      accountId: '1a27efaacb5e2b77fcaec04e0f6b0a0b',
      databaseId: 'a5642ecc-9382-4256-924d-8353a825c26b',
      token: process.env['CLOUDFLARE_API_TOKEN'],
    },
  };

  const dev = {
    dbCredentials: {
      url: getLocalD1(),
    },
  };
  return isProd() ? prod : dev;
};

export default {
  schema: './src/db/*.ts',
  out: './drizzle',
  dialect: 'sqlite',
  ...getCredentials(),
} satisfies Config;
