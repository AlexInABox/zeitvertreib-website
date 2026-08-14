import { ChannelType, Client, Guild, VoiceChannel } from 'discord.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import { ZEITVERTREIB_GUILD_ID } from '../config/constants';

const CHECK_INTERVAL_MS = 10 * 1000;

export function startVoiceChannelMonitor(client: Client<true>): void {
  console.log(`🎙️ Starting voice channel monitor - checking every ${CHECK_INTERVAL_MS / 1000} seconds`);
  updateVoiceChannelConnection(client);
  setInterval(() => updateVoiceChannelConnection(client), CHECK_INTERVAL_MS);
}

export async function updateVoiceChannelConnection(client: Client<true>): Promise<void> {
  const guild = client.guilds.cache.get(ZEITVERTREIB_GUILD_ID);
  if (!guild) return;

  try {
    const connection = getVoiceConnection(guild.id);
    const target = findBusiestChannel(guild);

    if (!target) {
      connection?.destroy();
      return;
    }

    if (connection?.joinConfig.channelId === target.id) return;

    joinVoiceChannel({
      channelId: target.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
  } catch (error) {
    console.error(`Failed to check voice channels for guild ${guild.id}:`, error);
  }
}

function findBusiestChannel(guild: Guild): VoiceChannel | null {
  let busiest: VoiceChannel | null = null;
  let maxUsers = 0;

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice || channel.id === guild.afkChannelId) continue;

    const userCount = channel.members.filter((member) => !member.user.bot).size;
    if (userCount > maxUsers) {
      maxUsers = userCount;
      busiest = channel;
    }
  }

  return busiest;
}
