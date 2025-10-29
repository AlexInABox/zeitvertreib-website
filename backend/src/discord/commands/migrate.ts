import { EmbedBuilder } from '@discordjs/builders';
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

export class MigrateCommand extends BaseCommand {
  override name = 'migrate';
  override name_localizations = { de: 'migrieren' };
  override description =
    'Migrate your CedMod stats to Zeitvertreib (one-time only)';
  override description_localizations = {
    de: 'Migriere deine CedMod-Statistiken zu Zeitvertreib (einmalig)',
  };

  override options = [];

  async execute(
    interaction: any,
    helpers: CommandHelpers,
    env: Env,
    request: Request,
  ) {
    console.log('Executing migrate command');

    try {
      const db = drizzle(env.ZEITVERTREIB_DATA);

      // Get Discord ID
      const discordId = interaction.member?.user?.id || interaction.user?.id;
      if (!discordId) throw new Error('Missing Discord user ID');

      // Query the database to check if user exists and is linked to Steam ID
      const discordIdNum = Number(discordId);
      const [playerData] = await db
        .select()
        .from(playerdata)
        .where(eq(playerdata.discordId, discordIdNum))
        .limit(1);

      // User not found in database - redirect to login
      if (!playerData) {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('👤 Kein Account gefunden')
          .setDescription(
            'Du bist noch **nicht auf Zeitvertreib registriert**.\n\n' +
            'Erstelle jetzt kostenlos deinen Account, um deine Statistiken zu migrieren!',
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

      // Check if already migrated
      if (playerData.migratedCedmod !== null) {
        const migratedDate = new Date(playerData.migratedCedmod);
        const formattedDate = migratedDate.toLocaleDateString('de-DE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const alreadyMigratedEmbed = new EmbedBuilder()
          .setColor(0xff6b6b)
          .setTitle('⚠️ Migration bereits durchgeführt')
          .setDescription(
            `Du hast deine CedMod-Statistiken bereits am **${formattedDate}** migriert.\n\n` +
            'Die Migration kann nur **einmal** durchgeführt werden, um Datenkonsistenz zu gewährleisten.',
          )
          .setTimestamp();

        await helpers.reply({ embeds: [alreadyMigratedEmbed.toJSON()] });
        return;
      }

      // Fetch data from CedMod API
      const steamId = playerData.id; // Steam ID stored in database (format: "76561198354414854@steam")
      const cedmodUrl = `https://cedmod.zeitvertreib.vip/Api/Player/Query?q=${encodeURIComponent(steamId)}&create=true&moderationData=true&basicStats=true&staffOnly=False&max=1&page=0&sortLabel=id_field&sortDirection=Descending&activityMin=1826`;

      console.log(`Fetching CedMod data for Steam ID: ${steamId}`);
      const cedmodResponse = await fetch(cedmodUrl, {
        headers: {
          Authorization: `Bearer ${env.CEDMOD_API_KEY}`,
        },
      });

      if (!cedmodResponse.ok) {
        throw new Error(`CedMod API returned status ${cedmodResponse.status}`);
      }

      const cedmodData: CedModResponse = await cedmodResponse.json();

      if (!cedmodData.players || cedmodData.players.length === 0) {
        const noDataEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('❌ Keine CedMod-Daten gefunden')
          .setDescription(
            'Für deinen Account wurden keine Statistiken bei CedMod gefunden.\n\n' +
            'Möglicherweise hast du noch nicht auf dem Server gespielt oder deine Daten wurden nicht erfasst.',
          )
          .setTimestamp();

        await helpers.reply({ embeds: [noDataEmbed.toJSON()] });
        return;
      }

      const cedmodPlayer = cedmodData.players[0];

      // TypeScript safety check (we already verified players exist above)
      if (!cedmodPlayer) {
        throw new Error('Unexpected: CedMod player data is undefined');
      }

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
        migratedCedmodAt: Date.now(),
      };

      // Add firstSeen if available and not already set
      if (cedmodPlayer.firstSeen) {
        const firstSeenTimestamp = new Date(cedmodPlayer.firstSeen).getTime();
        updateData.firstSeen = firstSeenTimestamp;
      }

      // Update database
      await db
        .update(playerdata)
        .set(updateData)
        .where(eq(playerdata.discordId, discordIdNum));

      // Create comparison strings
      const createComparisonLine = (
        label: string,
        oldValue: number,
        newValue: number | undefined,
      ) => {
        if (newValue === undefined || newValue === null) {
          return `${label}: ${oldValue} → ❌ *Keine Daten von CedMod*`;
        }
        return `${label}: ${oldValue} → **${newValue}** ✅`;
      };

      const comparisons = [
        createComparisonLine('Kills', oldStats.kills, cedmodPlayer.kills),
        createComparisonLine('Deaths', oldStats.deaths, cedmodPlayer.deaths),
        createComparisonLine('Colas', oldStats.colas, cedmodPlayer.colaDrink),
        createComparisonLine('Medkits', oldStats.medkits, cedmodPlayer.medkits),
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

      const successEmbed = new EmbedBuilder()
        .setColor(0x51cf66)
        .setTitle('✅ Migration erfolgreich!')
        .setDescription(
          'Deine CedMod-Statistiken wurden erfolgreich zu Zeitvertreib migriert!\n\n' +
          '**Migrierte Statistiken:**\n' +
          comparisons.join('\n') +
          '\n\n*Diese Migration kann nicht rückgängig gemacht werden.*',
        )
        .setFooter({ text: `Steam ID: ${steamId}` })
        .setTimestamp();

      await helpers.reply({ embeds: [successEmbed.toJSON()] });
    } catch (error) {
      console.error('Migrate command error:', error);

      let title = '❌ Migrationsfehler';
      let description =
        'Es ist ein Fehler bei der Migration aufgetreten. Bitte versuche es später erneut.';
      let color = 0xff0000;

      if (error instanceof Error) {
        if (
          error.message.includes('fetch') ||
          error.message.includes('CedMod API')
        ) {
          description =
            'Der CedMod-Server ist momentan nicht erreichbar.\n' +
            'Bitte versuche es später erneut oder kontaktiere einen Administrator.';
        } else if (error.message.includes('JSON')) {
          description =
            'Die Antwort vom CedMod-Server konnte nicht verarbeitet werden.\n' +
            'Bitte kontaktiere einen Administrator.';
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
