import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { proxyFetch } from '../../proxy.js';

interface DonationLeaderboardEntry {
  discordId: string;
  totalAmount: number;
}

/**
 * Updates the donations leaderboard Discord message
 * Runs every 15 minutes via Cloudflare Workers scheduled event
 */
export async function updateDonationsLeaderboard(
  db: ReturnType<typeof drizzle<typeof schema>>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  try {
    console.log('Starting donations leaderboard update...');

    // Query the donations table and aggregate by discord_id
    const leaderboardData = await db
      .select({
        discordId: schema.donations.discordId,
        totalAmount: sql<number>`CAST(SUM(${schema.donations.amount}) as REAL)`,
      })
      .from(schema.donations)
      .groupBy(schema.donations.discordId)
      .orderBy(sql`CAST(SUM(${schema.donations.amount}) as REAL) DESC`);

    // Build the leaderboard description with custom formatting
    const leaderboardLines = leaderboardData.map((entry, index) => {
      const place = index + 1;
      const amount = Math.round(entry.totalAmount);
      const mention = `<@${entry.discordId}>`;
      const formatted = `**Platz ${place}:** ${mention} - **(${amount}€)**`;

      if (place === 1) {
        return `# ${formatted}`;
      } else if (place === 2) {
        return `## ${formatted}`;
      } else if (place === 3) {
        return `### ${formatted}`;
      } else if (place <= 5) {
        return formatted;
      } else {
        return `-# ${formatted}`;
      }
    });

    // Insert empty unicode line after top 5
    let description = '';
    if (leaderboardData.length > 0) {
      const topFive = leaderboardLines.slice(0, Math.min(5, leaderboardLines.length));
      const restOfLeaderboard = leaderboardLines.slice(5);

      description = topFive.join('\n');
      if (restOfLeaderboard.length > 0) {
        description += '\n⠀\n' + restOfLeaderboard.join('\n');
      }
    } else {
      description = 'Noch keine Spenden :(';
    }

    // Create the Discord embed
    const embed = {
      title: 'Spendenlegenden',
      description: description,
      color: 0xff5e5b, // Warm coral/salmon color
      fields: [
        {
          name: 'Hää, wie kann ich auch spenden??',
          value: '<#1274502927028846724>',
          inline: false,
        },
      ],
    };

    // Try to fetch existing messages in the channel and update if found
    const channelId = env.DONATIONS_CHANNEL_ID;
    const botToken = env.DISCORD_TOKEN;

    // Fetch recent messages to find existing leaderboard message
    const messagesResponse = await proxyFetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      },
      env
    );

    if (!messagesResponse.ok) {
      console.error('Failed to fetch messages:', await messagesResponse.text());
      throw new Error('Failed to fetch channel messages');
    }

    const messages = (await messagesResponse.json()) as any[];

    // Find a message from the bot with the leaderboard title
    const existingMessage = messages.find((msg: any) => {
      return (
        msg.author.id === env.DISCORD_APPLICATION_ID &&
        msg.embeds?.[0]?.title === 'Spendenlegenden'
      );
    });

    if (existingMessage) {
      // Update existing message
      console.log('Updating existing leaderboard message:', existingMessage.id);
      const updateResponse = await proxyFetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${existingMessage.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            embeds: [embed],
          }),
        },
        env
      );

      if (!updateResponse.ok) {
        console.error('Failed to update message:', await updateResponse.text());
        throw new Error('Failed to update leaderboard message');
      }

      console.log('Leaderboard message updated successfully');
    } else {
      // Create new message
      console.log('Creating new leaderboard message');
      const createResponse = await proxyFetch(
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
        env
      );

      if (!createResponse.ok) {
        console.error('Failed to create message:', await createResponse.text());
        throw new Error('Failed to create leaderboard message');
      }

      console.log('Leaderboard message created successfully');
    }
  } catch (error) {
    console.error('Error updating donations leaderboard:', error);
    throw error;
  }
}
