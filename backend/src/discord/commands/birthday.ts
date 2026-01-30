import { EmbedBuilder } from '@discordjs/builders';
import { ApplicationCommandOptionType } from 'discord-api-types/v10';
import { BaseCommand } from '../base-command.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { playerdata, birthdays, birthdayUpdates } from '../../db/schema.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const MONTH_NAMES: Record<number, string> = {
  1: 'Januar',
  2: 'Februar',
  3: 'März',
  4: 'April',
  5: 'Mai',
  6: 'Juni',
  7: 'Juli',
  8: 'August',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Dezember',
};

function isValidDate(day: number, month: number, year: number): boolean {
  const currentYear = new Date().getFullYear();

  if (year < currentYear - 100 || year > currentYear) {
    return false;
  }

  // Create the date. If JS had to fix it, it was invalid.
  const d = new Date(year, month - 1, day);

  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function formatBirthday(day: number, month: number, year: number | null): string {
  const monthName = MONTH_NAMES[month] || month.toString();
  if (year) {
    return `${day}. ${monthName} ${year}`;
  }
  return `${day}. ${monthName}`;
}

export class BirthdayCommand extends BaseCommand {
  override name = 'geburtstag';
  override name_localizations = { 'en-US': 'birthday' };
  override description = 'Verwalte deinen Geburtstag!';
  override description_localizations = { 'en-US': 'Manage your birthday!' };

  override options = [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'setzen',
      name_localizations: { 'en-US': 'set' },
      description: 'Setze deinen Geburtstag',
      description_localizations: { 'en-US': 'Set your birthday' },
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'tag',
          name_localizations: { 'en-US': 'day' },
          description: 'Tag (1-31)',
          description_localizations: { 'en-US': 'Day (1-31)' },
          required: true,
          min_value: 1,
          max_value: 31,
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'monat',
          name_localizations: { 'en-US': 'month' },
          description: 'Monat (1-12)',
          description_localizations: { 'en-US': 'Month (1-12)' },
          required: true,
          min_value: 1,
          max_value: 12,
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'jahr',
          name_localizations: { 'en-US': 'year' },
          description: 'Jahr (optional)',
          description_localizations: { 'en-US': 'Year (optional)' },
          required: false,
        },
      ],
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'löschen',
      name_localizations: { 'en-US': 'delete' },
      description: 'Lösche deinen Geburtstag',
      description_localizations: { 'en-US': 'Delete your birthday' },
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'meiner',
      name_localizations: { 'en-US': 'my' },
      description: 'Zeige deinen Geburtstag',
      description_localizations: { 'en-US': 'Show your birthday' },
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'liste',
      name_localizations: { 'en-US': 'list' },
      description: 'Zeige alle Geburtstage',
      description_localizations: { 'en-US': 'Show all birthdays' },
    },
  ];

  async execute(interaction: any, helpers: CommandHelpers, env: Env, request: Request) {
    const subcommand = interaction.data?.options?.[0]?.name;
    const discordId = interaction.member?.user?.id || interaction.user?.id;

    if (!discordId) {
      await helpers.reply('❌ Konnte Benutzer-ID nicht ermitteln!');
      return;
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    switch (subcommand) {
      case 'setzen':
      case 'set':
        await this.handleSet(interaction, helpers, db, discordId, env);
        break;
      case 'löschen':
      case 'delete':
        await this.handleDelete(interaction, helpers, db, discordId, env);
        break;
      case 'meiner':
      case 'my':
        await this.handleMy(interaction, helpers, db, discordId);
        break;
      case 'liste':
      case 'list':
        await this.handleList(interaction, helpers, db);
        break;
      default:
        await helpers.reply('❌ Unbekannter Befehl!');
    }
  }

  private async handleSet(
    interaction: any,
    helpers: CommandHelpers,
    db: ReturnType<typeof drizzle>,
    discordId: string,
    env: Env,
  ) {
    // Check if user has a linked account
    const playerDataResult = await db
      .select({ id: playerdata.id })
      .from(playerdata)
      .where(eq(playerdata.discordId, discordId))
      .limit(1);

    if (playerDataResult.length === 0) {
      const notFoundEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('👤 Kein Account gefunden')
        .setDescription(
          'Du bist noch **nicht auf Zeitvertreib registriert**.\n\n' +
            'Erstelle jetzt kostenlos deinen Account, um deinen Geburtstag zu setzen!',
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
                url: env.FRONTEND_URL + '/login',
              },
            ],
          },
        ],
      });
      return;
    }

    const steamId = playerDataResult[0]!.id;
    const options = interaction.data?.options?.[0]?.options || [];
    const day = options.find((opt: any) => opt.name === 'tag' || opt.name === 'day')?.value;
    const month = options.find((opt: any) => opt.name === 'monat' || opt.name === 'month')?.value;
    const year = options.find((opt: any) => opt.name === 'jahr' || opt.name === 'year')?.value || null;

    // Validate date
    if (!isValidDate(day, month, year ?? 2000)) {
      await helpers.reply('❌ Ungültiges Datum! Bitte überprüfe Tag, Monat und Jahr.');
      return;
    }

    // Check 30-day cooldown
    const now = Date.now();
    const birthdayLastUpdatedRecord = await db
      .select()
      .from(birthdayUpdates)
      .where(eq(birthdayUpdates.userid, steamId))
      .get();

    if (birthdayLastUpdatedRecord && now - birthdayLastUpdatedRecord.lastUpdated < THIRTY_DAYS_MS) {
      const remainingMs = THIRTY_DAYS_MS - (now - birthdayLastUpdatedRecord.lastUpdated);
      const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

      await helpers.reply(
        `⏳ Du kannst deinen Geburtstag nur alle 30 Tage ändern. Bitte warte noch **${remainingDays} Tag(e)**.`,
      );
      return;
    }

    // Insert or update birthday
    await db
      .insert(birthdays)
      .values({
        userid: steamId,
        day: day,
        month: month,
        year: year,
      })
      .onConflictDoUpdate({
        target: birthdays.userid,
        set: {
          day: day,
          month: month,
          year: year,
        },
      });

    // Update the lastUpdated timestamp
    await db
      .insert(birthdayUpdates)
      .values({
        userid: steamId,
        lastUpdated: now,
      })
      .onConflictDoUpdate({
        target: birthdayUpdates.userid,
        set: {
          lastUpdated: now,
        },
      });

    const formattedBirthday = formatBirthday(day, month, year);

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🎂 Geburtstag gesetzt!')
      .setDescription(`Dein Geburtstag wurde auf **${formattedBirthday}** gesetzt.`)
      .setTimestamp();

    await helpers.reply({
      embeds: [successEmbed.toJSON()],
    });
  }

  private async handleDelete(
    interaction: any,
    helpers: CommandHelpers,
    db: ReturnType<typeof drizzle>,
    discordId: string,
    env: Env,
  ) {
    // Check if user has a linked account
    const playerDataResult = await db
      .select({ id: playerdata.id })
      .from(playerdata)
      .where(eq(playerdata.discordId, discordId))
      .limit(1);

    if (playerDataResult.length === 0) {
      const notFoundEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('👤 Kein Account gefunden')
        .setDescription(
          'Du bist noch **nicht auf Zeitvertreib registriert**.\n\n' + 'Erstelle jetzt kostenlos deinen Account!',
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
                url: env.FRONTEND_URL + '/login',
              },
            ],
          },
        ],
      });
      return;
    }

    const steamId = playerDataResult[0]!.id;

    // Check if user has a birthday set
    const birthdayRecord = await db.select().from(birthdays).where(eq(birthdays.userid, steamId)).get();

    if (!birthdayRecord) {
      await helpers.reply('❌ Du hast keinen Geburtstag gesetzt, den du löschen könntest.');
      return;
    }

    // Delete birthday
    await db.delete(birthdays).where(eq(birthdays.userid, steamId));

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🗑️ Geburtstag gelöscht!')
      .setDescription('Dein Geburtstag wurde erfolgreich gelöscht.')
      .setTimestamp();

    await helpers.reply({
      embeds: [successEmbed.toJSON()],
    });
  }

  private async handleMy(interaction: any, helpers: CommandHelpers, db: ReturnType<typeof drizzle>, discordId: string) {
    // Look up user's steamId from playerdata
    const playerDataResult = await db
      .select({ id: playerdata.id })
      .from(playerdata)
      .where(eq(playerdata.discordId, discordId))
      .limit(1);

    if (playerDataResult.length === 0) {
      await helpers.reply('❌ Du hast keinen verknüpften Account. Daher kann kein Geburtstag gespeichert sein.');
      return;
    }

    const steamId = playerDataResult[0]!.id;
    const birthdayRecord = await db.select().from(birthdays).where(eq(birthdays.userid, steamId)).get();

    if (!birthdayRecord) {
      await helpers.reply('❌ Du hast noch keinen Geburtstag gesetzt. Nutze `/geburtstag setzen` um einen zu setzen!');
      return;
    }

    const formattedBirthday = formatBirthday(birthdayRecord.day, birthdayRecord.month, birthdayRecord.year);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎂 Dein Geburtstag')
      .setDescription(`Dein Geburtstag ist am **${formattedBirthday}**.`)
      .setTimestamp();

    await helpers.reply({
      embeds: [embed.toJSON()],
    });
  }

  private async handleList(interaction: any, helpers: CommandHelpers, db: ReturnType<typeof drizzle>) {
    // Get all birthdays with associated playerdata
    const allBirthdays = await db.select().from(birthdays);

    if (allBirthdays.length === 0) {
      await helpers.reply({
        content: '📅 Es sind noch keine Geburtstage eingetragen.',
      });
      return;
    }

    // Get all player data to map steamId -> discordId/username
    const allPlayerData = await db
      .select({
        id: playerdata.id,
        discordId: playerdata.discordId,
        username: playerdata.username,
      })
      .from(playerdata);

    // Create a map for quick lookup
    const playerMap = new Map<string, { discordId: string | null; username: string | null }>();
    for (const player of allPlayerData) {
      playerMap.set(player.id, { discordId: player.discordId, username: player.username });
    }

    // Sort birthdays by month, then day
    const sortedBirthdays = allBirthdays.sort((a, b) => {
      if (a.month !== b.month) return a.month - b.month;
      return a.day - b.day;
    });

    // Build the list
    const birthdayLines: string[] = [];
    for (const birthday of sortedBirthdays) {
      const playerInfo = playerMap.get(birthday.userid);
      const formattedDate = formatBirthday(birthday.day, birthday.month, birthday.year);

      let userDisplay: string;
      if (playerInfo?.discordId) {
        userDisplay = `<@${playerInfo.discordId}>`;
      } else if (playerInfo?.username) {
        userDisplay = playerInfo.username;
      } else {
        userDisplay = 'Unbekannter Nutzer';
      }

      birthdayLines.push(`**${formattedDate}** - ${userDisplay}`);
    }

    // Split into chunks if too long (Discord has 4096 char limit for embed description)
    const MAX_DESCRIPTION_LENGTH = 4000;
    let description = birthdayLines.join('\n');

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      // Truncate and add indicator
      const lines = birthdayLines.slice(0, 50);
      description = lines.join('\n') + `\n\n... und ${sortedBirthdays.length - 50} weitere`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎂 Alle Geburtstage')
      .setDescription(description)
      .setFooter({ text: `Insgesamt ${sortedBirthdays.length} Geburtstag${sortedBirthdays.length === 1 ? '' : 'e'}` })
      .setTimestamp();

    await helpers.reply({
      embeds: [embed.toJSON()],
    });
  }
}
