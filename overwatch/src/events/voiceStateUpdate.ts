import { ZEITVERTREIB_GUILD_ID } from '../config/constants';
import { Client, ChannelType, VoiceState } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';

// Monitor voice channels and join the one with the most users
export async function updateVoiceChannelConnection(client: Client<true>): Promise<void> {
  const guild = client.guilds.cache.get(ZEITVERTREIB_GUILD_ID);
  if (!guild) {
    console.error('Target guild not found for voice channel monitoring');
    return;
  }

  try {
    let maxUsers = 0;
    let targetChannel = null;

    // Find the voice channel with the most users
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildVoice && channel.id !== guild.afkChannelId) {
        const userCount = channel.members.filter((m) => !m.user.bot).size;
        if (userCount > maxUsers) {
          maxUsers = userCount;
          targetChannel = channel;
        }
      }
    }

    // If a channel with users exists, join it
    if (targetChannel && maxUsers > 0) {
      joinVoiceChannel({
        channelId: targetChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
    } else {
      // No users in any voice channel, leave if we're in one
      const connection = getVoiceConnection(guild.id);
      if (connection) {
        connection.destroy();
      }
    }
  } catch (error) {
    console.error(`Error checking voice channels for guild ${guild.id}:`, error);
  }
}

export async function handleVoiceStateUpdate(newState: VoiceState): Promise<void> {
  await updateVoiceChannelConnection(newState.client as Client<true>);
}
