import { BaseCommand } from '../base-command.js';
import { triggerReinstall } from '../../services/pterodactyl.js';
import { isTeamByDiscordId } from '../../utils.js';

export class ReinstallCommand extends BaseCommand {
  override name = 'reinstall';
  override description = 'Reinstall the SCP:SL server and start it afterwards';
  override description_localizations = {
    de: 'Installiert den SCP:SL Server neu und startet ihn danach',
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

    const reinstallTriggered = await triggerReinstall(env);
    if (!reinstallTriggered) {
      await helpers.reply('❌ Die Neuinstallation konnte nicht ausgelöst werden. Bitte später erneut versuchen.');
      return;
    }

    const id = env.REINSTALL_MANAGER.idFromName('scpsl-reinstall');
    const stub = env.REINSTALL_MANAGER.get(id);

    const response = await stub.fetch(
      new Request('https://reinstall-manager.worker/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionToken: interaction.token }),
      }),
    );

    if (!response.ok) {
      await helpers.reply(
        '⚠️ Die Neuinstallation wurde ausgelöst, aber ich konnte die Statusprüfung nicht starten. Beobachte das Panel oder nutze `/restart` in ein paar Minuten.',
      );
      return;
    }

    await helpers.reply(
      '♻️ **Neuinstallation ausgelöst!** Ich prüfe den Status und starte den Server, sobald er fertig ist.',
    );
  }
}
