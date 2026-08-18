import { Message } from 'discord.js';
import type { BirthdayRewardResponse } from '@zeitvertreib/types';
import { ZEITVERTREIB_GUILD_ID } from '../config/constants';

const BIRTHDAY_CHANNEL_ID = '888946307346100247';
const BACKEND_API_URL = 'https://zeitvertreib.vip/api/birthday/reward';
const OVERWATCH_API_KEY = process.env.OVERWATCH_API_KEY;

function berlinDay(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
}

/**
 * Checks whether a reply to a birthday message should be rewarded and awards it via the backend.
 * Discord is the source of truth: wishes only count on the day the birthday message was
 * sent and the next day (Europe/Berlin).
 */
export async function handleBirthdayReply(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.guildId !== ZEITVERTREIB_GUILD_ID) return;
  if (!message.reference?.messageId) return;

  // Birthday messages are only ever posted in the hardcoded birthday channel
  if (message.reference.channelId && message.reference.channelId !== BIRTHDAY_CHANNEL_ID) return;
  if (message.channelId !== BIRTHDAY_CHANNEL_ID) return;

  const referencedMessageId = message.reference.messageId;

  // Fetch the original message from Discord to verify the time window (source of truth)
  let referencedMessage;
  try {
    referencedMessage = await message.channel.messages.fetch(referencedMessageId);
  } catch (error) {
    console.error('[Birthday Reward] Could not fetch referenced message:', error);
    return;
  }

  const messageDay = berlinDay(message.createdAt);
  const birthdayDay = berlinDay(referencedMessage.createdAt);
  const nextDay = berlinDay(new Date(referencedMessage.createdAt.getTime() + 24 * 60 * 60 * 1000));

  if (messageDay !== birthdayDay && messageDay !== nextDay) return;

  if (!OVERWATCH_API_KEY) {
    console.error('[Birthday Reward] OVERWATCH_API_KEY is not set');
    return;
  }

  try {
    const response = await fetch(BACKEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OVERWATCH_API_KEY}`,
      },
      body: JSON.stringify({
        messageId: referencedMessageId,
        discordId: message.author.id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Birthday Reward] Backend error: ${response.status} - ${errorText}`);
      return;
    }

    const result = (await response.json()) as BirthdayRewardResponse;

    if (result.status === 'awarded') {
      await message.reply({
        content: `🎉 Danke für deine Geburtstagswünsche, <@${message.author.id}>! Du hast **${result.amount} ZVC** erhalten! 🎁`,
        allowedMentions: { repliedUser: true },
      });
    } else if (result.status === 'no_account') {
      await message.reply({
        content: `Danke für deine Geburtstagswünsche! Verknüpfe deinen Discord-Account unter https://zeitvertreib.vip, um die ZVC-Belohnung zu erhalten. 🎁`,
        allowedMentions: { repliedUser: true },
      });
    }
  } catch (error) {
    console.error('[Birthday Reward] Error awarding birthday wish:', error);
  }
}
