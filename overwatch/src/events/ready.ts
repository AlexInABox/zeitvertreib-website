import { Client } from 'discord.js';
import { startMemberTracking } from '../services/memberTracker';
import { startStickyMessageService } from '../services/stickyMessage';

export async function handleReady(readyClient: Client<true>): Promise<void> {
  console.log(`Logged in as ${readyClient.user.tag}!`);
  startMemberTracking(readyClient);
  startStickyMessageService(readyClient);
}
