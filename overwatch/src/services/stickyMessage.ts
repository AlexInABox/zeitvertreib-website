import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  PermissionFlagsBits,
} from 'discord.js';

const MODERATION_CHANNEL_ID = '1401609093633933324';
const MODERATOR_ROLE_ID = '1454877745984180266';

/**
 * Creates the moderation info embed with opt-out button
 */
function createModerationEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ Content Moderation - Information')
    .setDescription(
      'Willkommen im Spray-Fakerank Moderationskanal! Hier werden Nutzer-generierte Sprays und Fakeranks überprüft hochgeladen und von euch moderiert.\n\n',
    )
    .setColor(0x5865f2)
    .addFields(
      {
        name: '🎨 Spray Moderation',
        value:
          '• **Delete Spray**: Entfernt das Spray und blockiert den Hash (verhindert erneuten Upload)\n' +
          '• **Ban User**: Entfernt das Spray, blockiert den Hash UND sperrt den User von Spray-Uploads\n' +
          '• **Unblock Hash**: Hebt die Hash-Blockierung auf (erlaubt erneute Uploads)\n' +
          '• **Unban User**: Hebt die User-Sperre von Spray-Uploads auf',
        inline: false,
      },
      {
        name: '📛 Fakerank Moderation',
        value:
          '• **Delete Fakerank**: Entfernt den Fakerank und blockiert den Text (verhindert erneuten Upload)\n' +
          '• **Ban User**: Entfernt den Fakerank, blockiert den Text UND sperrt den User von Fakerank-Uploads\n' +
          '• **Unblock Text**: Hebt die Text-Blockierung auf (erlaubt erneute Verwendung)\n' +
          '• **Unban User**: Hebt die User-Sperre von Fakerank-Uploads auf',
        inline: false,
      },
      {
        name: '🚨 CSAM REPORT - § 184b StGB',
        value:
          '**Dieser Button ist ausschließlich für Material mit sexueller Gewalt, Missbrauch oder Ausbeutung von Kindern gedacht** - also Personen die eindeutig minderjährig oder kindlich aussehen.\n\n' +
          'Beim Drücken wird <@428870593358594048> sofort benachrichtigt. Das Material wird gesichert und händisch von <@428870593358594048> an das BKA gemeldet (DSA Art. 18). Das Spray wird **in-game** gelöscht und der Hash permanent blockiert.\n\n' +
          'Du gilst als meldende Person und wirst bei Fortschritt in diesem Fall benachrichtigt, wirst aber nicht in einen rechtlichen Prozess verwickelt.\n\n' +
          '**⚠️ WICHTIGE WARNUNGEN:**\n' +
          '• **NIEMALS** das Bild selbst herunterladen - als meldende Person ist das illegal (§ 184b Abs. 3 StGB)!\n' +
          '• **NUR** den CSAM REPORT Button verwenden - nicht direkt an Discord melden\n' +
          '• **NICHT** Bot-Nachrichten löschen - das ist illegal (Verdunklung/Vertuschung von Straftaten)\n' +
          '• **NUR** bei echtem Verdacht drücken - nicht rückgängig zu machen!',
        inline: false,
      },
      {
        name: '⚠️ Wichtiger Hinweis',
        value:
          '**Keine aktive Überwachungspflicht (DSA Art. 8):**\n' +
          'Ihr seid NICHT verpflichtet, diesen Kanal aktiv zu überwachen oder proaktiv nach problematischen Inhalten zu suchen.\n\n' +
          '**Moderation ist freiwillig:**\n' +
          'Dieser Kanal kann verstörende, beleidigende oder illegale Inhalte enthalten. ' +
          'Die Moderation kann psychisch belastend sein.\n\n' +
          '**CSAM-Meldemechanismus (DSA Art. 16):**\n' +
          'Der CSAM REPORT Button wird als verpflichtender Meldemechanismus bereitgestellt.\n\n' +
          '**Du kannst jederzeit aussteigen** - Button unten klicken.',
        inline: false,
      },
    )
    .setFooter({ text: 'Danke für deine Hilfe bei der Moderation! • Zeitvertreib Team' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('opt_out_moderation')
    .setLabel('🚪 Moderation verlassen')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embeds: [embed], components: [row] };
}

/**
 * Sends or updates the sticky moderation info message
 */
export async function updateStickyMessage(message: Message): Promise<void> {
  // Only process messages in the moderation channel
  if (message.channelId !== MODERATION_CHANNEL_ID) return;

  // Ignore bot messages (including our own) to prevent loops
  if (message.author.bot) return;

  try {
    const channel = message.channel;

    // Type guard to ensure we can send messages
    if (!channel.isTextBased() || channel.isDMBased()) return;

    // Fetch recent messages and delete the last bot message
    try {
      const recentMessages = await channel.messages.fetch({ limit: 50 });
      const lastBotMessage = recentMessages.find((msg) => msg.author.bot && msg.author.id === message.client.user?.id);
      if (lastBotMessage?.deletable) {
        await lastBotMessage.delete();
      }
    } catch (error) {
      console.log('Could not delete last sticky message:', error);
    }

    // Send the new sticky message
    await channel.send(createModerationEmbed());
  } catch (error) {
    console.error('Error updating sticky message:', error);
  }
}

/**
 * Handles the opt-out button interaction
 */
export async function handleOptOutButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId !== 'opt_out_moderation') return;

  try {
    const member = interaction.member;
    if (!member || !('roles' in member)) {
      await interaction.reply({
        content: '❌ Fehler: Member-Daten konnten nicht geladen werden.',
        ephemeral: true,
      });
      return;
    }

    // Check if user has the moderator role
    const hasRole =
      member.roles instanceof Array
        ? member.roles.includes(MODERATOR_ROLE_ID)
        : member.roles.cache.has(MODERATOR_ROLE_ID);

    if (!hasRole) {
      await interaction.reply({
        content: '❌ Du hast die Moderator-Rolle nicht.',
        ephemeral: true,
      });
      return;
    }

    // Remove the role
    if ('remove' in member.roles) {
      await member.roles.remove(MODERATOR_ROLE_ID);

      await interaction.reply({
        content:
          '✅ **Die Moderator-Rolle wurde entfernt.**\n\n' +
          'Du hast keinen Zugriff mehr auf diesen Kanal und kannst keine Sprays/Fakeranks mehr moderieren.\n' +
          'Danke für deine Hilfe! Falls du später wieder helfen möchtest, wende dich an das Team.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Fehler beim Entfernen der Rolle.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error handling opt-out button:', error);
    await interaction.reply({
      content: '❌ Ein Fehler ist aufgetreten. Bitte kontaktiere das Team.',
      ephemeral: true,
    });
  }
}
