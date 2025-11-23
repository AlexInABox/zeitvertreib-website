import { EmbedBuilder } from '@discordjs/builders';
import { BaseCommand } from '../base-command.js';

export class PingCommand extends BaseCommand {
  override name = 'ping';
  override description = 'Check if the bot is online and get performance statistics!';
  override name_localizations = {
    de: 'ping',
  };
  override description_localizations = {
    de: 'Überprüfe ob der Bot online ist und erhalte Leistungsstatistiken!',
  };
  override options = [
    {
      name: 'show_latency',
      description: 'More detailed performance statistics',
      name_localizations: {
        de: 'latenz_anzeigen',
      },
      description_localizations: {
        de: 'Detaillierte Leistungsstatistiken anzeigen',
      },
      type: 5, // Boolean
      required: false,
    },
  ];

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    const showLatency = interaction.data.options?.find((opt: any) => opt.name === 'show_latency')?.value || false;

    if (showLatency) {
      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x00ff00)
        .addFields(
          {
            name: '📊 Leistungsstatistiken',
            value: `🌐 **Region:** ${
              (request as any).cf?.region || 'Unbekannt'
            }\n⏰ **Zeit:** ${new Date().toLocaleString('de-DE')}`,
            inline: false,
          },
          {
            name: '🔧 Server Info',
            value: `🆔 **Guild:** ${interaction.guild_id || 'DM'}`,
            inline: false,
          },
        )
        .setTimestamp();

      await helpers.reply({ embeds: [embed.toJSON()] });
    } else {
      await helpers.reply('🏓 Pong!');
    }
  }
}
