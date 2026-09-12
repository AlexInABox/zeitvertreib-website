import { BaseCommand } from '../base-command.js';
import { getServerState, sendPowerSignal } from '../../services/pterodactyl.js';
import { isTeamByDiscordId } from '../../utils.js';

const BUSY_STATE_LABELS: Record<string, string> = {
  starting: 'wird gerade gestartet',
  stopping: 'wird gerade gestoppt',
  restarting: 'wird gerade neu gestartet',
};

export class RestartCommand extends BaseCommand {
  override name = 'restart';
  override description = 'Restart the SCP:SL server via the panel';
  override description_localizations = {
    de: 'Startet den SCP:SL Server über das Panel neu',
  };

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    const discordId = interaction.member?.user?.id || interaction.user?.id;

    if (!discordId) {
      await helpers.reply('❌ Konnte Benutzer-ID nicht ermitteln!');
      return;
    }

    const teamMember = await isTeamByDiscordId(discordId, env);
    if (!teamMember) {
      await helpers.reply('⛔ Nur Teammitglieder dürfen diesen Befehl nutzen.');
      return;
    }

    const state = await getServerState(env);

    if (state.isInstalling) {
      await helpers.reply('⏳ Der Server wird gerade neuinstalliert. Ein Restart ist dabei nicht möglich.');
      return;
    }

    if (state.isSuspended) {
      await helpers.reply('⏸️ Der Server ist suspendiert. Ein Restart ist gerade nicht möglich.');
      return;
    }

    if (state.currentState === 'running' || state.currentState === 'offline') {
      const restartSent = await sendPowerSignal(env, 'restart');
      if (restartSent) {
        await helpers.reply('🔄 **Restart-Signal gesendet!** Der Server wird neu gestartet.');
      } else {
        await helpers.reply('❌ Das Restart-Signal konnte nicht gesendet werden. Bitte später erneut versuchen.');
      }
      return;
    }

    if (state.currentState === null) {
      await helpers.reply('❌ Der aktuelle Status des Servers konnte nicht abgerufen werden. Kein Restart gesendet.');
      return;
    }

    const busyLabel = BUSY_STATE_LABELS[state.currentState] ?? `macht gerade ${state.currentState}`;
    await helpers.reply(`⛔ Der Server ${busyLabel}. Ein Restart wird deshalb nicht ausgelöst. Warte, bis er online oder offline ist.`);
  }
}