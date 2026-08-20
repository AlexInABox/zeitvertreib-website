import { EmbedBuilder } from '@discordjs/builders';
import { BaseCommand } from '../base-command.js';
import { drizzle } from 'drizzle-orm/d1';
import { getZvc } from '../../db/zvc.js';

export class CoinflipCommand extends BaseCommand {
  override name = 'münzwurf';
  override description = 'Starte eine Münzwurf-Challenge gegen andere Spieler!';
  override name_localizations = {
    'en-US': 'coinflip',
  };
  override description_localizations = {
    'en-US': 'Start a coinflip challenge against other players!',
  };
  override options = [
    {
      name: 'betrag',
      description: 'Der Betrag in ZVC, den du setzen möchtest',
      name_localizations: {
        'en-US': 'amount',
      },
      description_localizations: {
        'en-US': 'The amount in ZVC you want to bet',
      },
      type: 4, // Integer
      required: true,
      min_value: 1,
    },
  ];

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    const amount = interaction.data.options?.find((opt: any) => opt.name === 'betrag')?.value || 1;
    const userId = interaction.member?.user?.id || interaction.user?.id;

    if (!userId) {
      await helpers.reply('❌ Konnte Benutzer-ID nicht ermitteln!');
      return;
    }

    // Check if user has enough ZVC
    const db = drizzle(env.ZEITVERTREIB_DATA);
    const currentBalance = await getZvc(db, { discordId: userId });

    // Check if user account is linked
    if (currentBalance === null) {
      await helpers.reply({
        embeds: [
          {
            title: '🔗 Discord-Account nicht verknüpft!',
            description:
              'Du musst deinen Discord-Account erst mit Zeitvertreib verknüpfen, um ZVC-Features nutzen zu können.',
            color: 0xff6b6b,
            fields: [
              {
                name: '👆 Hier verknüpfen:',
                value: env.FRONTEND_URL + '/link',
              },
            ],
          },
        ],
      });
      return;
    }

    if (currentBalance < amount) {
      await helpers.reply(
        `❌ Du hast nicht genügend ZVC! Du hast ${currentBalance.toLocaleString('de-DE')} ZVC, brauchst aber ${amount.toLocaleString('de-DE')} ZVC.`,
      );
      return;
    }

    const user = interaction.member?.user || interaction.user;
    const username = user?.global_name || user?.username || 'Unknown User';

    const challengeEmbed = {
      title: '⚔️ Offene Münzwurf-Challenge! ⚔️',
      description: `<@${userId}> hat eine offene Münzwurf-Challenge für **${amount.toLocaleString('de-DE')}** ZVC gestartet! Jeder kann teilnehmen.`,
      color: 0x3447ff,
    };

    await helpers.reply({
      embeds: [challengeEmbed],
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 1, // Primary
              label: 'Challenge annehmen',
              custom_id: `coinflip:${userId}:${amount}`,
              emoji: {
                name: '🪙',
              },
            },
            {
              type: 2, // Button
              style: 4, // Danger
              label: 'Abbrechen',
              custom_id: `coinflip_cancel:${userId}:${amount}`,
              emoji: {
                name: '💀',
              },
            },
          ],
        },
      ],
    });
  }
}
