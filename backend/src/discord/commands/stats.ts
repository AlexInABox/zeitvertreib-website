import { EmbedBuilder } from '@discordjs/builders';
import { ApplicationCommandOptionType } from 'discord-api-types/v10';
import { BaseCommand } from '../base-command.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata } from '../../db/schema.js';

interface CedModPlayer {
  id: string;
  userId: string;
  userName: string;
  firstSeen: string;
  lastSeen: string;
  kills: number;
  deaths: number;
  colaDrink: number;
  medkits: number;
  adrenalineShots: number;
  roundsPlayed: number;
}

interface CedModResponse {
  players: CedModPlayer[];
  total: number;
}

export class StatsCommand extends BaseCommand {
  override name = 'stats';
  override name_localizations = { de: 'statistiken' };
  override description = 'Display game statistics!';
  override description_localizations = { de: 'Zeige Spiel-Statistiken!' };

  override options = [
    {
      type: ApplicationCommandOptionType.User,
      name: 'user',
      name_localizations: { de: 'benutzer' },
      description: 'The user whose stats to display (defaults to yourself)',
      description_localizations: {
        de: 'Der Benutzer, dessen Statistiken angezeigt werden sollen (Standard: du selbst)',
      },
      required: false,
    },
  ];

  async execute(
    interaction: any,
    helpers: CommandHelpers,
    env: Env,
    request: Request,
  ) {
    console.log('Executing stats command');

    try {
      const db = drizzle(env.ZEITVERTREIB_DATA);

      let discordId: string;
      let targetUsername: string | undefined;
      let avatarUrl: string | undefined;

      if (interaction.data?.options?.[0]?.value) {
        discordId = interaction.data.options[0].value;
        const user = interaction.data.resolved?.users?.[discordId];
        targetUsername = user?.username;

        // Build avatar URL from Discord CDN
        if (user?.avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`;
        }
      } else {
        discordId = interaction.member?.user?.id || interaction.user?.id;
        const user = interaction.member?.user || interaction.user;

        // Build avatar URL for the command invoker
        if (user?.avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`;
        }
      }

      if (!discordId) throw new Error('Missing Discord user ID');

      // Query the database directly
      let [playerData] = await db
        .select()
        .from(playerdata)
        .where(eq(playerdata.discordId, discordId))
        .limit(1);

      if (!playerData) {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('👤 Kein Account gefunden')
          .setDescription(
            'Dieser Benutzer ist noch **nicht auf Zeitvertreib registriert**.\n\n' +
              'Erstelle jetzt kostenlos deinen Account, um deine Spielstatistiken zu sehen!',
          )
          .setTimestamp();

        await helpers.reply({
          embeds: [notFoundEmbed.toJSON()],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: 'Jetzt registrieren 🕹️',
                  url: 'https://dev.zeitvertreib.vip/login',
                },
              ],
            },
          ],
        });
        return;
      }

      // Auto-migration logic: Check if user hasn't migrated yet
      let migrationMessage: string | null = null;
      if (playerData.migratedCedmod === null) {
        console.log(
          `User ${discordId} hasn't migrated yet, attempting auto-migration...`,
        );

        try {
          const steamId = playerData.id;
          const cedmodUrl = `https://cedmod.zeitvertreib.vip/Api/Player/Query?q=${encodeURIComponent(steamId)}&create=true&moderationData=true&basicStats=true&staffOnly=False&max=1&page=0&sortLabel=id_field&sortDirection=Descending&activityMin=1826`;

          const cedmodResponse = await fetch(cedmodUrl, {
            headers: {
              Authorization: `Bearer ${env.CEDMOD_API_KEY}`,
            },
          });

          if (cedmodResponse.ok) {
            const cedmodData: CedModResponse = await cedmodResponse.json();

            if (cedmodData.players && cedmodData.players.length > 0) {
              const cedmodPlayer = cedmodData.players[0];

              if (!cedmodPlayer) {
                console.log(
                  'CedMod player data is undefined, skipping migration',
                );
              } else {
                // Store old values for comparison
                const oldStats = {
                  kills: playerData.killcount ?? 0,
                  deaths: playerData.deathcount ?? 0,
                  colas: playerData.usedcolas ?? 0,
                  medkits: playerData.usedmedkits ?? 0,
                  adrenaline: playerData.usedadrenaline ?? 0,
                  rounds: playerData.roundsplayed ?? 0,
                };

                // Prepare update data
                const updateData: any = {
                  killcount: cedmodPlayer.kills,
                  deathcount: cedmodPlayer.deaths,
                  usedcolas: cedmodPlayer.colaDrink,
                  usedmedkits: cedmodPlayer.medkits,
                  usedadrenaline: cedmodPlayer.adrenalineShots,
                  roundsplayed: cedmodPlayer.roundsPlayed,
                  migratedCedmod: new Date(Date.now()),
                };

                // Add firstSeen if available and not already set
                if (cedmodPlayer.firstSeen) {
                  updateData.firstSeen = new Date(cedmodPlayer.firstSeen);
                }

                // Update database
                await db
                  .update(playerdata)
                  .set(updateData)
                  .where(eq(playerdata.discordId, discordId));

                // Refresh playerData with updated values
                const updatedPlayerData = await db
                  .select()
                  .from(playerdata)
                  .where(eq(playerdata.discordId, discordId))
                  .limit(1);

                if (updatedPlayerData[0]) {
                  playerData = updatedPlayerData[0];
                }

                // Create comparison strings for migration message
                const createComparisonLine = (
                  label: string,
                  oldValue: number,
                  newValue: number | undefined,
                ) => {
                  if (newValue === undefined || newValue === null) {
                    return `${label}: ${oldValue} → ❌`;
                  }
                  return `${label}: ${oldValue} → **${newValue}** ✅`;
                };

                const comparisons = [
                  createComparisonLine(
                    'Kills',
                    oldStats.kills,
                    cedmodPlayer.kills,
                  ),
                  createComparisonLine(
                    'Deaths',
                    oldStats.deaths,
                    cedmodPlayer.deaths,
                  ),
                  createComparisonLine(
                    'Colas',
                    oldStats.colas,
                    cedmodPlayer.colaDrink,
                  ),
                  createComparisonLine(
                    'Medkits',
                    oldStats.medkits,
                    cedmodPlayer.medkits,
                  ),
                  createComparisonLine(
                    'Adrenalin',
                    oldStats.adrenaline,
                    cedmodPlayer.adrenalineShots,
                  ),
                  createComparisonLine(
                    'Runden',
                    oldStats.rounds,
                    cedmodPlayer.roundsPlayed,
                  ),
                ];

                migrationMessage =
                  '🎉 **CedMod-Daten erfolgreich migriert!**\n' +
                  'Deine alten Statistiken wurden automatisch importiert:\n' +
                  comparisons.join('\n') +
                  '\n\n';
              }
            } else {
              console.log('No CedMod data found for user, skipping migration');
            }
          } else {
            console.log(
              `CedMod API returned status ${cedmodResponse.status}, skipping migration`,
            );
          }
        } catch (migrationError) {
          console.error('Auto-migration error (non-fatal):', migrationError);
          // Continue to show stats even if migration fails
        }
      }

      const stats = playerData;

      const kd =
        (stats.deathcount ?? 0) > 0
          ? ((stats.killcount ?? 0) / (stats.deathcount ?? 0)).toFixed(2)
          : (stats.killcount ?? 0).toFixed(2);
      const playtimeHours = Math.floor((stats.playtime ?? 0) / 3600);
      const playtimeMinutes = Math.floor(((stats.playtime ?? 0) % 3600) / 60);
      const displayName =
        stats.username || targetUsername || 'Unbekannter Spieler';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📊 Statistiken für ${displayName}`)
        .setDescription(
          (migrationMessage || '') +
            'Deine aktuellen Spielstatistiken auf **Zeitvertreib** 🎮',
        );

      // Set user avatar as thumbnail if available
      if (avatarUrl) {
        embed.setThumbnail(avatarUrl);
      }

      const fields = [
        {
          name: '⚔️ Skill',
          value: `**Kills:** ${stats.killcount ?? 0}\n**Deaths:** ${stats.deathcount ?? 0}\n**K/D:** ${kd}`,
          inline: true,
        },
        {
          name: '🎮 Gaming',
          value: `**Runden:** ${stats.roundsplayed ?? 0}\n**ZVC:** ${stats.experience ?? 0}\n**Pocket Escapes:** ${stats.pocketescapes ?? 0}`,
          inline: true,
        },
        {
          name: '⏱️ Spielzeit',
          value: `**${playtimeHours}h ${playtimeMinutes}m**`,
          inline: true,
        },
        {
          name: '💉 Drogen',
          value: `**Medkits:** ${stats.usedmedkits ?? 0}\n**Colas:** ${stats.usedcolas ?? 0}\n**Adrenalin:** ${stats.usedadrenaline ?? 0}`,
          inline: true,
        },
        {
          name: '🎰 Slots',
          value: `**Spins:** ${stats.slotSpins ?? 0}\n**Profit:** ${stats.slotWins ?? 0}\n-# **Verlust:** ${stats.slotLosses ?? 0}`,
          inline: true,
        },
        {
          name: '🐍 Snake',
          value: `**Highscore:** ${stats.snakehighscore ?? 0}`,
          inline: true,
        },
      ];

      embed
        .addFields(fields)
        .setFooter({ text: `Steam ID: ${stats.id}` })
        .setTimestamp();

      await helpers.reply({ embeds: [embed.toJSON()] });
    } catch (error) {
      console.error('Stats command error:', error);
      let title = '❌ Fehler';
      let description =
        'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später erneut.';
      let color = 0xff0000;

      if (error instanceof Error) {
        if (error.message.startsWith('ServerError:')) {
          description =
            'Der Statistik-Server konnte deine Daten derzeit nicht abrufen.\n' +
            'Bitte versuche es später erneut. (Fehlercode ' +
            error.message.split(':')[1] +
            ')';
        } else if (error.message.includes('EmptyData')) {
          description =
            'Für diesen Benutzer wurden **noch keine Statistiken gefunden**.\n' +
            'Spiele ein paar Runden, um Daten zu sammeln!';
          color = 0xffa500;
        } else if (error.message.includes('fetch')) {
          description =
            'Der Statistik-Server ist momentan nicht erreichbar.\nBitte versuche es später erneut.';
        }
      }

      const errorEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

      await helpers.reply({ embeds: [errorEmbed.toJSON()] });
    }
  }
}
