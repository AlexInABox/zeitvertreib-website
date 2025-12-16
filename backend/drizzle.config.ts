import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

const getLocalD1 = () => {
  try {
    const basePath = path.resolve('.wrangler');
    const dbFile = fs.readdirSync(basePath, { encoding: 'utf-8', recursive: true }).find((f) => f.endsWith('.sqlite'));

    if (!dbFile) {
      throw new Error(`.sqlite file not found in ${basePath}`);
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
