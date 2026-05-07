import { Client } from 'discord.js';
import { startMemberTracking } from '../services/memberTracker';
import { startStickyMessageService } from '../services/stickyMessage';
import { updateVoiceChannelConnection } from './voiceStateUpdate';

export async function handleReady(readyClient: Client<true>): Promise<void> {
  console.log(`Logged in as ${readyClient.user.tag}!`);
  startMemberTracking(readyClient);
  startStickyMessageService(readyClient);
  await updateVoiceChannelConnection(readyClient);
}
