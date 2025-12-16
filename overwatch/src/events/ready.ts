import { Client } from 'discord.js';
import { startMemberTracking } from '../services/memberTracker';

export async function handleReady(readyClient: Client<true>): Promise<void> {
  console.log(`Logged in as ${readyClient.user.tag}!`);
  startMemberTracking(readyClient);
}
