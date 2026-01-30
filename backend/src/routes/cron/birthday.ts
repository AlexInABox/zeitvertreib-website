import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { proxyFetch } from '../../proxy.js';
import { birthdays, playerdata, discordInfo } from '../../db/schema.js';
import { increment } from '../../utils.js';

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Sends a birthday notification to Discord and awards the birthday celebrant!
 */
export async function checkForBirthdays(
    db: ReturnType<typeof drizzle<typeof schema>>,
    env: Env,
    ctx: ExecutionContext,
): Promise<void> {
    try {
        console.log('Starting birthday check...');
        const today = new Date(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }));
        let daysToCheck: number[] = [today.getDate()];
        const monthToCheck = today.getMonth() + 1;
        if (isLeapYear(today.getFullYear()) && monthToCheck === 2 && today.getDate() === 28) {
            daysToCheck.push(29);
        }

        const birthdaysToday = await db
            .select()
            .from(birthdays)
            .where(
                and(
                    eq(birthdays.month, monthToCheck),
                    inArray(birthdays.day, daysToCheck)
                )
            )
            .all();
        const channelId = env.DONATIONS_CHANNEL_ID;
        const botToken = env.DISCORD_TOKEN;

        // Award each celebrant with 1000 ZVC
        for (const birthdayRecord of birthdaysToday) {
            console.log(`Awarding birthday ZVC to user ${birthdayRecord.userid}`);
            await db
                .update(playerdata)
                .set({
                    experience: increment(playerdata.experience, 1000),
                })
                .where(eq(playerdata.id, birthdayRecord.userid));

            // Lets send some birthday wishes in Discord too
            const player = await db
                .select()
                .from(playerdata)
                .where(eq(playerdata.id, birthdayRecord.userid))
                .get();

            const mention =
                player?.discordId != null
                    ? `<@${player.discordId}>`
                    : player?.username ?? "Unbekannter Nutzer";

            const age = birthdayRecord.year ? today.getFullYear() - birthdayRecord.year : null;
            const ageText = age ? `zu deinem ${age}.` : 'zum';

            const birthdayWishes = [
                "Alles Gute",
                "Herzlichen Glückwunsch",
                "Happy Birthday",
                "Beste Wünsche",
                "Frohes Fest",
                "Schöne Feier",
                "Feier schön",
                "Party time",
                "Jubel Trubel",
                "Hurra",
                "Hoch sollst du leben",
                "Cheers",
                "Torte ahoi",
                "Geburtstagskind",
                "Glückwunsch",
                "Lass krachen",
                "Spaß pur",
                "Alles klar",
                "Hoch lebe",
                "Feier wild"
            ];


            const randomWish = birthdayWishes[Math.floor(Math.random() * birthdayWishes.length)];
            const embed = {
                title: `🎉 ${randomWish}! 🎉`,
                description: `Herzlichen Glückwunsch ${ageText} Geburtstag, ${mention}! Du hast soeben 1000 ZVC als Geschenk erhalten! 🎂🎁`,
                color: 0x00ff00, // Green color
            };

            ctx.waitUntil(
                proxyFetch(
                    `https://discord.com/api/v10/channels/${channelId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bot ${botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            embeds: [embed],
                        }),
                    },
                    env,
                ),
            );
        }

    } catch (error) {
        console.error('Error doing birthday stuff', error);
        throw error;
    }
}
