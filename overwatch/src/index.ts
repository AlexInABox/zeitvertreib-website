import { Client, Events, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

// Event handlers
import { handleReady } from './events/ready';
import { handleMessageCreate } from './events/messageCreate';
import { handleMessageUpdate } from './events/messageUpdate';
import { handleOptOutButton } from './services/stickyMessage';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Register event handlers
client.once(Events.ClientReady, handleReady);
client.on(Events.MessageCreate, handleMessageCreate);
client.on(Events.MessageUpdate, handleMessageUpdate);
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

// Handle button interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    await handleOptOutButton(interaction);
  }
});

client.login(process.env.BOT_TOKEN);
