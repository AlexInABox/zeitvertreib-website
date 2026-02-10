import { EmbedBuilder } from '@discordjs/builders';
import { ApplicationCommandOptionType } from 'discord-api-types/v10';
import { BaseCommand } from '../base-command.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata } from '../../db/schema.js';

/**
 * Check if it's currently weekend (Saturday or Sunday) in Berlin, Germany
 */
function isWeekendInBerlin(): boolean {
  const berlinTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
  const berlinDate = new Date(berlinTime);
  const dayOfWeek = berlinDate.getDay();
  // Sunday = 0, Saturday = 6
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Get account linked embed for display
 */
function getNotLinkedEmbed(): any {
  return {
    title: '🔗 Discord-Account nicht verknüpft!',
    description:
      'Du musst deinen Discord-Account erst mit Zeitvertreib verknüpfen, um ZVC-Features nutzen zu können.',
    color: 0xff6b6b,
    fields: [
      {
        name: '👆 Hier verknüpfen:',
        value: 'https://zeitvertreib.de/link',
      },
    ],
  };
}

export class ZvcCommand extends BaseCommand {
  override name = 'zvc';
  override name_localizations = {
    'en-US': 'zvc',
  };
  override description = 'Verwalte deine Zeitvertreib Coins (ZVC)!';
  override description_localizations = {
    'en-US': 'Manage your Zeitvertreib Coins (ZVC)!',
  };

  override options = [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'send',
      name_localizations: { de: 'senden' },
      description: 'Sende ZVC an einen anderen Benutzer',
      description_localizations: {
        'en-US': 'Send ZVC to another user',
      },
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          name_localizations: { de: 'benutzer' },
          description: 'Der Empfänger der Überweisung',
          description_localizations: {
            'en-US': 'The recipient of the transfer',
          },
          required: true,
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'amount',
          name_localizations: { de: 'betrag' },
          description: 'Die Anzahl der ZVC zum Senden',
          description_localizations: {
            'en-US': 'The amount of ZVC to send',
          },
          required: true,
          min_value: 100,
          max_value: 50000,
        },
      ],
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'info',
      name_localizations: { de: 'info' },
      description: 'Zeige deinen ZVC-Kontostand oder den eines anderen Benutzers',
      description_localizations: {
        'en-US': 'Display your ZVC balance or another user\'s',
      },
      options: [
        {
          type: ApplicationCommandOptionType.User,
          name: 'user',
          name_localizations: { de: 'benutzer' },
          description: 'Der Benutzer, dessen Kontostand angezeigt werden soll (Standard: du selbst)',
          description_localizations: {
            'en-US': 'The user whose balance to display (defaults to yourself)',
          },
          required: false,
        },
      ],
    },
  ];

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    const subcommand = interaction.data?.options?.[0]?.name;
    const discordId = interaction.member?.user?.id || interaction.user?.id;

    if (!discordId) {
      await helpers.reply('❌ Konnte Benutzer-ID nicht ermitteln!');
      return;
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    switch (subcommand) {
      case 'send':
      case 'senden':
        await this.handleSend(interaction, helpers, db, discordId, env);
        break;
      case 'info':
        await this.handleInfo(interaction, helpers, db, discordId);
        break;
      default:
        await helpers.reply('❌ Unbekannter Befehl!');
    }
  }

  private async handleInfo(
    interaction: any,
    helpers: CommandHelpers,
    db: ReturnType<typeof drizzle>,
    requestingUserId: string,
  ) {
    try {
      // Determine which user to look up
      let targetDiscordId = requestingUserId;
      let targetDisplayName: string | null = null;

      // Check if a user option was provided
      if (interaction.data?.options?.[0]?.options?.[0]?.value) {
        targetDiscordId = interaction.data.options[0].options[0].value;
        const resolvedUser = interaction.data.resolved?.users?.[targetDiscordId];
        targetDisplayName = resolvedUser?.global_name || resolvedUser?.username || null;
      }

      // Query the database for the target user
      const result = await db
        .select({ id: playerdata.id, experience: playerdata.experience, username: playerdata.username })
        .from(playerdata)
        .where(eq(playerdata.discordId, targetDiscordId))
        .limit(1);

      if (result.length === 0) {
        await helpers.reply({
          embeds: [getNotLinkedEmbed()],
        });
        return;
      }

      const balance = result[0]?.experience || 0;
      const steamId = result[0]?.id;
      const displayName = targetDisplayName || result[0]?.username || 'Unknown';

      const embed = new EmbedBuilder()
        .setTitle('💰 ZVC Kontostand')
        .setDescription(`${displayName}`)
        .addFields(
          {
            name: 'Kontostand',
            value: `**${balance.toLocaleString('de-DE')}** ZVC`,
            inline: false,
          },
          {
            name: 'Steam ID',
            value: steamId || 'N/A',
            inline: false,
          },
        )
        .setColor(0x3447ff)
        .setTimestamp();

      await helpers.reply({
        embeds: [embed.toJSON()],
      });
    } catch (error) {
      console.error('Error in ZVC info command:', error);
      await helpers.reply('❌ Ein Fehler ist aufgetreten!');
    }
  }

  private async handleSend(
    interaction: any,
    helpers: CommandHelpers,
    db: ReturnType<typeof drizzle>,
    senderDiscordId: string,
    env: Env,
  ) {
    try {
      // Get options
      const options = interaction.data?.options?.[0]?.options;
      const recipientUserId = options?.find((opt: any) => opt.name === 'user' || opt.name === 'benutzer')?.value;
      const amount = options?.find((opt: any) => opt.name === 'amount' || opt.name === 'betrag')?.value;

      if (!recipientUserId || !amount) {
        await helpers.reply('❌ Ungültige Parameter!');
        return;
      }

      // Validate amount
      if (!Number.isInteger(amount) || amount < 100 || amount > 50000) {
        await helpers.reply({
          embeds: [
            {
              title: '❌ Ungültiger Betrag',
              description: 'Der Betrag muss zwischen 100 und 50.000 ZVC liegen.',
              color: 0xff6b6b,
            },
          ],
        });
        return;
      }

      // Get sender's Steam ID
      const senderResult = await db
        .select({ id: playerdata.id, experience: playerdata.experience })
        .from(playerdata)
        .where(eq(playerdata.discordId, senderDiscordId))
        .limit(1);

      if (senderResult.length === 0) {
        await helpers.reply({
          embeds: [getNotLinkedEmbed()],
        });
        return;
      }

      const senderData = senderResult[0]!;
      const senderSteamId = senderData.id;
      const senderBalance = senderData.experience || 0;

      if (!senderSteamId) {
        await helpers.reply('❌ Ein Fehler ist aufgetreten beim Abrufen deiner Daten!');
        return;
      }

      // Get recipient's info
      const recipientResult = await db
        .select({ id: playerdata.id, experience: playerdata.experience })
        .from(playerdata)
        .where(eq(playerdata.discordId, recipientUserId))
        .limit(1);

      if (recipientResult.length === 0) {
        await helpers.reply({
          embeds: [
            {
              title: '❌ Empfänger nicht verknüpft',
              description: 'Der Empfänger hat sein Discord-Konto nicht mit Zeitvertreib verknüpft.',
              color: 0xff6b6b,
            },
          ],
        });
        return;
      }

      const recipientData = recipientResult[0]!;
      const recipientSteamId = recipientData.id;
      const recipientBalance = recipientData.experience || 0;

      if (!recipientSteamId) {
        await helpers.reply('❌ Ein Fehler ist aufgetreten beim Abrufen der Empfängerdaten!');
        return;
      }

      // Prevent self-transfer
      if (senderSteamId === recipientSteamId) {
        await helpers.reply({
          embeds: [
            {
              title: '❌ Ungültige Überweisung',
              description: 'Du kannst nicht an dich selbst senden!',
              color: 0xff6b6b,
            },
          ],
        });
        return;
      }

      // Calculate tax
      const isWeekend = isWeekendInBerlin();
      const taxRate = isWeekend ? 0 : 0.05;
      const taxAmount = Math.floor(amount * taxRate);
      const totalCost = amount + taxAmount;

      // Check balance
      if (senderBalance < totalCost) {
        await helpers.reply({
          embeds: [
            {
              title: '❌ Unzureichende Deckung',
              description: `Du hast nicht genügend ZVC.\n**Benötigt:** ${totalCost.toLocaleString('de-DE')} ZVC (${amount.toLocaleString('de-DE')} + ${taxAmount.toLocaleString('de-DE')} Steuer)\n**Verfügbar:** ${senderBalance.toLocaleString('de-DE')} ZVC`,
              color: 0xff6b6b,
            },
          ],
        });
        return;
      }

      // Perform transfer
      await db
        .update(playerdata)
        .set({ experience: senderBalance - totalCost })
        .where(eq(playerdata.id, senderSteamId));

      await db
        .update(playerdata)
        .set({ experience: recipientBalance + amount })
        .where(eq(playerdata.id, recipientSteamId));

      const newSenderBalance = senderBalance - totalCost;
      const newRecipientBalance = recipientBalance + amount;

      // Get display names
      const recipientUser = interaction.data?.resolved?.users?.[recipientUserId];
      const recipientDisplayName = recipientUser?.global_name || recipientUser?.username || 'Unknown';

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Überweisung erfolgreich')
        .addFields(
          {
            name: 'Betrag',
            value: `**${amount.toLocaleString('de-DE')}** ZVC`,
            inline: true,
          },
          {
            name: 'Gebühr',
            value: `**${taxAmount.toLocaleString('de-DE')}** ZVC${isWeekend ? ' (Wochenende!)' : ''}`,
            inline: true,
          },
          {
            name: 'Empfänger',
            value: `<@${recipientUserId}>`,
            inline: false,
          },
          {
            name: 'Dein neuer Kontostand',
            value: `**${newSenderBalance.toLocaleString('de-DE')}** ZVC`,
            inline: true,
          },
          {
            name: 'Sein neuer Kontostand',
            value: `**${newRecipientBalance.toLocaleString('de-DE')}** ZVC`,
            inline: true,
          },
        )
        .setColor(0x51cf66)
        .setTimestamp();

      await helpers.reply({
        embeds: [successEmbed.toJSON()],
      });
    } catch (error) {
      console.error('Error in ZVC send command:', error);
      await helpers.reply('❌ Ein Fehler ist aufgetreten!');
    }
  }
}
