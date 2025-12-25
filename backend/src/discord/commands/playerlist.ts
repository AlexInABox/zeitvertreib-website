import { EmbedBuilder } from '@discordjs/builders';
import { BaseCommand } from '../base-command.js';

export class PlayerlistCommand extends BaseCommand {
  override name = 'playerlist';
  override name_localizations = { de: 'spielerliste' };
  override description = 'Display the current player list from the game!';
  override description_localizations = {
    de: 'Aktuelle Spielerliste vom Spiel anzeigen!',
  };

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    console.log('Executing playerlist command');

    try {
      // Get Durable Object instance
      const id = env.PLAYERLIST_STORAGE.idFromName('playerlist');
      const stub = env.PLAYERLIST_STORAGE.get(id);

      // Fetch playerlist from Durable Object
      const response = await stub.fetch(
        new Request('https://playerlist-storage.worker/playerlist', {
          method: 'GET',
        }),
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch playerlist: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { timestamp: number; players: Playerlist };

      if (!data.timestamp || !Array.isArray(data.players)) {
        throw new Error('Durable Object returned invalid data format');
      }

      // Check if playerlist is stale (older than 1 minute)
      const ageInMs = Date.now() - data.timestamp;
      const ONE_MINUTE_IN_MS = 60 * 1000;
      const isStale = ageInMs > ONE_MINUTE_IN_MS;

      const embed = new EmbedBuilder()
        .setTitle('👥 Aktuelle Spielerliste')
        .setColor(isStale ? 0xff9900 : 0x00ff00)
        .setTimestamp();

      if (isStale) {
        embed.setDescription('⚠️ Spielerliste ist veraltet (älter als 1 Minute)');
      } else if (data.players.length === 0) {
        embed.setDescription('Keine Spieler online');
      } else {
        const playerFields = data.players.map((player: Player) => ({
          name: (player.Name || 'Unknown') + ' ‎  ‎  ‎ ',
          value: `-# Rolle: ${player.Team || 'Unknown'}`,
          inline: true,
        }));

        // Discord embeds have a maximum of 25 fields
        const maxFields = 25;
        if (playerFields.length > maxFields) {
          embed.addFields(playerFields.slice(0, maxFields));
          embed.setDescription(`⚠️ Nur die ersten ${maxFields} von ${playerFields.length} Spielern werden angezeigt.`);
        } else {
          embed.addFields(playerFields);
        }
      }

      embed.setFooter({
        text: `Spielerzahl: ${data.players.length}`,
      });

      await helpers.reply({ embeds: [embed.toJSON()] });
    } catch (error) {
      console.error('Playerlist command error:', error);

      let errorMessage = 'Fehler beim Abrufen der Spielerliste aus dem Durable Object.';

      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch playerlist')) {
          errorMessage = 'Fehler beim Verbinden mit der Spielerliste.';
        } else if (error.message.includes('invalid data format')) {
          errorMessage = 'Ungültige Daten vom Durable Object erhalten.';
        }
      }

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Fehler')
        .setDescription(errorMessage)
        .setColor(0xff0000)
        .setTimestamp();

      await helpers.reply({ embeds: [errorEmbed.toJSON()] });
    }
  }
}

interface Playerlist extends Array<Player> {}

interface Player {
  Name: string;
  UserId: string;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
}
