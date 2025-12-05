import { Client, Events, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

// Event handlers
import { handleReady } from './events/ready';
import { handleMessageCreate } from './events/messageCreate';
import { handleMessageUpdate } from './events/messageUpdate';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

// Register event handlers
client.once(Events.ClientReady, handleReady);
client.on(Events.MessageCreate, handleMessageCreate);
client.on(Events.MessageUpdate, handleMessageUpdate);

client.login(process.env.BOT_TOKEN);
