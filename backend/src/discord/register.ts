import { commandManager } from './commands.js';
import { proxyFetch } from '../proxy.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, GUILD_ID, PROXY_HOST } = process.env;

// Create a mock env object for the registration script
const env = {
  PROXY_HOST: PROXY_HOST || '',
} as any as Env;

console.log('🔄 Registering commands...');

// Clear old guild commands if GUILD_ID is provided
if (GUILD_ID) {
  console.log('🧹 Clearing old guild commands...');

  const clearResponse = await proxyFetch(
    `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${DISCORD_TOKEN}`,
      },
      body: JSON.stringify([]),
    },
    env,
  );

  if (clearResponse.ok) {
    console.log('✅ Successfully cleared old guild commands');
  } else {
    console.warn('⚠️ Failed to clear old guild commands:', await clearResponse.text());
    // Continue with registration anyway
  }

  const setResponse = await proxyFetch(
    `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${DISCORD_TOKEN}`,
      },
      body: JSON.stringify(commandManager.getForRegistration()),
    },
    env,
  );

  if (clearResponse.ok) {
    const data = (await setResponse.json()) as any[];
    console.log(`✅ Registered ${data.length} commands: ${data.map((c) => c.name).join(', ')}`);
  } else {
    console.warn('⚠️ Failed to set guild commands:', await clearResponse.text());
  }
}

const response = await proxyFetch(
  `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`,
  {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_TOKEN}`,
    },
    body: JSON.stringify([]),
  },
  env,
);

if (response.ok) {
  console.log(`✅ Cleared all global commands!`);
} else {
  console.error('❌ Failed to clear global commands:', await response.text());
  process.exit(1);
}
