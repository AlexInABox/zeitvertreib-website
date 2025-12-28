import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  PermissionFlagsBits,
  Client,
  TextChannel,
  MessageFlags,
} from 'discord.js';

const MODERATION_CHANNEL_ID = '1401609093633933324';
const MODERATOR_ROLE_ID = '1454877745984180266';
const STICKY_UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes

/**
 * Creates the moderation info embeds with opt-out button
 */
function createModerationEmbed() {
  const welcomeEmbed = new EmbedBuilder()
    .setTitle('🛡️ Content Moderation')
    .setDescription(
      'Willkommen im Spray-Fakerank Moderationskanal! Hier werden Nutzer-generierte Sprays und Fakeranks überprüft und moderiert.',
    )
    .setColor(0x5865f2);

  const csamEmbed = new EmbedBuilder()
    .setTitle('🚨 CSAM REPORT')
    .setDescription(
      '**Dieser Button ist ausschließlich für Material mit sexueller Gewalt, Missbrauch oder Ausbeutung von Kindern gedacht** - also Personen die eindeutig minderjährig oder kindlich aussehen.\n\n' +
        'Beim Drücken wird <@428870593358594048> sofort benachrichtigt. Das Material wird gesichert und händisch von <@428870593358594048> an das BKA gemeldet (DSA Art. 18). Das Spray wird **in-game** gelöscht und der Hash permanent blockiert.\n\n' +
        'Du gilst als meldende Person und wirst bei Fortschritt in diesem Fall benachrichtigt, wirst aber nicht in einen rechtlichen Prozess verwickelt.',
    )
    .addFields({
      name: '⚠️ WICHTIGE WARNUNGEN',
      value:
        '• **NIEMALS** das Bild selbst herunterladen - als meldende Person ist das illegal ([§ 184b Abs. 3 StGB](https://www.gesetze-im-internet.de/stgb/__184b.html))!\n' +
        '• **NUR** den CSAM REPORT Button verwenden - nicht direkt an Discord melden\n' +
        '• **NICHT** Bot-Nachrichten löschen - das ist illegal (Verdunklung/Vertuschung von Straftaten)\n' +
        '• **NUR** bei echtem Verdacht drücken - nicht rückgängig zu machen!',
      inline: false,
    })
    .setColor(0xed4245);

  const legalEmbed = new EmbedBuilder()
    .setTitle('⚠️ Wichtiger Hinweis')
    .setDescription(
      '**Keine aktive Überwachungspflicht ([DSA Art. 8](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_8.html)):**\n' +
        'Ihr seid NICHT verpflichtet, diesen Kanal aktiv zu überwachen oder proaktiv nach problematischen Inhalten zu suchen.\n\n' +
        '**Moderation ist freiwillig:**\n' +
        'Dieser Kanal kann verstörende, beleidigende oder illegale Inhalte enthalten. Die Moderation kann psychisch belastend sein.\n\n' +
        '**Du kannst jederzeit aussteigen** - Button unten klicken.',
    )
    .setColor(0xfee75c)
    .setFooter({ text: 'Danke für deine Hilfe bei der Moderation! • Zeitvertreib Team' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('opt_out_moderation')
    .setLabel('🚪 Moderation verlassen')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embeds: [welcomeEmbed, csamEmbed, legalEmbed], components: [row] };
}

/**
 * Checks and updates the sticky message periodically
 */
async function checkAndUpdateSticky(client: Client): Promise<void> {
  try {
    const channel = await client.channels.fetch(MODERATION_CHANNEL_ID);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

    // Fetch the most recent message
    const messages = await channel.messages.fetch({ limit: 1 });
    const lastMessage = messages.first();

    // If the last message is from us, no need to update
    if (lastMessage?.author.id === client.user?.id) return;

    // Fetch recent messages and delete our old sticky message
    try {
      const recentMessages = await channel.messages.fetch({ limit: 50 });
      const ourMessages = recentMessages.filter((msg) => msg.author.id === client.user?.id);

      // Delete all our old messages
      for (const msg of ourMessages.values()) {
        if (msg.deletable) {
          await msg.delete();
        }
      }
    } catch (error) {
      console.log('Could not delete old sticky messages:', error);
    }

    // Send the new sticky message
    await channel.send(createModerationEmbed());
  } catch (error) {
    console.error('Error updating sticky message:', error);
  }
}

/**
 * Starts the sticky message service that runs every 2 minutes
 */
export function startStickyMessageService(client: Client): void {
  // Initial check
  checkAndUpdateSticky(client);

  // Set up interval
  setInterval(() => {
    checkAndUpdateSticky(client);
  }, STICKY_UPDATE_INTERVAL);

  console.log('✅ Sticky message service started (checks every 2 minutes)');
}

/**
 * @deprecated No longer used - sticky messages are now handled by interval
 */
export async function updateStickyMessage(message: Message): Promise<void> {
  // This function is no longer used but kept for compatibility
  return;
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
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if bot has permission to manage roles
    if (!interaction.guild) {
      await interaction.reply({
        content: '❌ Fehler: Guild nicht gefunden.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: '❌ Bot hat keine Berechtigung, Rollen zu verwalten. Bitte kontaktiere das Team.',
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: '❌ Fehler beim Entfernen der Rolle.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('Error handling opt-out button:', error);
    await interaction.reply({
      content: '❌ Ein Fehler ist aufgetreten. Bitte kontaktiere das Team.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
