import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { BirthdayRewardResponse } from '@zeitvertreib/types';
import { ZEITVERTREIB_GUILD_ID } from '../config/constants';

const BIRTHDAY_CHANNEL_ID = '888946307346100247';
const BACKEND_URL = process.env.BACKEND_URL ?? 'https://zeitvertreib.vip';
const BACKEND_API_URL = `${BACKEND_URL}/api/birthday/reward`;
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
      if (message.channel.isSendable()) {
        await message.channel.send({
          content: `🎉 <@${message.author.id}> hat **${result.amount} ZVC** für Geburtstagswünsche erhalten! 🎁`,
          allowedMentions: { users: [message.author.id] },
        });
      }
    } else if (result.status === 'no_account') {
      const notFoundEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('👤 Kein Account gefunden')
        .setDescription(
          `Du bist noch **nicht auf Zeitvertreib registriert**.\n\n` +
            `Erstelle jetzt kostenlos deinen Account, um deine ZVC-Belohnung für Geburtstagswünsche zu erhalten!`,
        )
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Jetzt registrieren 🕹️').setStyle(ButtonStyle.Link).setURL(`${BACKEND_URL}/login`),
      );

      await message.reply({
        embeds: [notFoundEmbed],
        components: [row],
        flags: MessageFlags.Ephemeral as unknown as MessageFlags.SuppressEmbeds,
        allowedMentions: { repliedUser: false },
      });
    }
  } catch (error) {
    console.error('[Birthday Reward] Error awarding birthday wish:', error);
  }
}
