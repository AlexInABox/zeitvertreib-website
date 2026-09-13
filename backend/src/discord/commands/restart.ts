import { EmbedBuilder } from '@discordjs/builders';
import { BaseCommand } from '../base-command.js';
import { getServerState, sendPowerSignal } from '../../services/pterodactyl.js';
import { isTeamByDiscordId } from '../../utils.js';

const BUSY_STATE_LABELS: Record<string, string> = {
  starting: 'Der Server startet gerade.',
  stopping: 'Der Server stoppt gerade.',
  restarting: 'Der Server startet gerade neu.',
};

function embedFor(title: string, description: string, color: number): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

export class RestartCommand extends BaseCommand {
  override name = 'restart';
  override description = 'Restart the SCP:SL server via the panel';
  override description_localizations = {
    de: 'Startet den SCP:SL Server über das Panel neu',
  };

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    const discordId = interaction.member?.user?.id || interaction.user?.id;

    if (!discordId) {
      await helpers.reply({ embeds: [embedFor('Fehler', 'Deine Benutzer-ID konnte nicht ermittelt werden.', 0xff0000).toJSON()] });
      return;
    }

    const teamMember = await isTeamByDiscordId(discordId, env);
    if (!teamMember) {
      await helpers.reply({
        embeds: [embedFor('Kein Zugriff', 'Nur Teammitglieder können den Server neu starten.', 0xff0000).toJSON()],
        flags: 64, // Ephemeral
      });
      return;
    }

    const state = await getServerState(env);

    if (state.isInstalling) {
      await helpers.reply({
        embeds: [
          embedFor(
            'Restart nicht möglich',
            'Der Server wird gerade neu installiert. Sobald die Installation abgeschlossen ist, kannst du `/restart` erneut nutzen.',
            0xff9900,
          ).toJSON(),
        ],
      });
      return;
    }

    if (state.isSuspended) {
      await helpers.reply({
        embeds: [
          embedFor(
            'Restart nicht möglich',
            'Der Server ist aktuell suspendiert und kann nicht neu gestartet werden.',
            0xff9900,
          ).toJSON(),
        ],
      });
      return;
    }

    if (state.currentState === 'running' || state.currentState === 'offline') {
      const restartSent = await sendPowerSignal(env, 'restart');
      if (restartSent) {
        await helpers.reply({
          embeds: [
            embedFor(
              'Server wird neu gestartet',
              'Das Restart-Signal wurde gesendet. Der Server ist in etwa einer Minute wieder online.',
              0x28a745,
            ).toJSON(),
          ],
        });
      } else {
        await helpers.reply({
          embeds: [
            embedFor(
              'Restart fehlgeschlagen',
              'Das Restart-Signal konnte nicht an das Panel übermittelt werden. Versuch es später erneut oder nutze das Panel direkt.',
              0xff0000,
            ).toJSON(),
          ],
        });
      }
      return;
    }

    if (state.currentState === null) {
      await helpers.reply({
        embeds: [
          embedFor(
            'Serverstatus unbekannt',
            'Der aktuelle Serverstatus konnte nicht abgerufen werden. Es wurde kein Restart ausgelöst.',
            0xff0000,
          ).toJSON(),
        ],
      });
      return;
    }

    const busyLabel = BUSY_STATE_LABELS[state.currentState] ?? `Der Server ist im Zustand "${state.currentState}".`;
    await helpers.reply({
      embeds: [
        embedFor(
          'Restart nicht möglich',
          `${busyLabel} Ein Restart ist erst möglich, wenn der Server online oder offline ist.`,
          0xff9900,
        ).toJSON(),
      ],
    });
  }
}
