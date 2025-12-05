import { Message, PartialMessage } from 'discord.js';
import { moderateMessage } from '../handlers/moderation';

export async function handleMessageUpdate(
  _oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  // Ensure we have a full message object
  if (newMessage.partial) return;

  await moderateMessage(newMessage);
}
