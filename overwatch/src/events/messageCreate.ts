import { Message } from 'discord.js';
import { TICKET_PHRASES, SUPPORT_CHANNEL_ID } from '../config/constants';
import { moderateMessage } from '../handlers/moderation';

export async function handleMessageCreate(message: Message): Promise<void> {
  // Delete stats command responses
  if (message.interaction && message.interaction.commandName.includes('stats get') && message.deletable) {
    message.delete();
  }

  await moderateMessage(message);

  // Check if message still exists after moderation
  const messageExists = await message.channel.messages.fetch(message.id).catch(() => null);
  if (!messageExists) return;

  const messageContentLower = message.content.toLowerCase();

  // Check for ticket/support related phrases
  if (TICKET_PHRASES.some((group) => group.every((word) => messageContentLower.includes(word.toLowerCase())))) {
    await message.reply({
      content: `<#${SUPPORT_CHANNEL_ID}>`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }
}
