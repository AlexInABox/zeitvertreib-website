import { Message, PartialMessage } from 'discord.js';
import { moderateMessage } from '../handlers/moderation';

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  // Ensure we have a full message object
  if (newMessage.partial) return;

  // Ignore embed-only updates (when content doesn't change)
  if (oldMessage.content !== null && oldMessage.content === newMessage.content) return;

  await moderateMessage(newMessage);
}
