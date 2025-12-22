import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { desc, ne } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';

interface LeaderboardEntry {
  name: string;
  value: number;
  rank: number;
  discordId: string | null;
}

interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
}

interface SteamApiResponse {
  response: {
    players: SteamPlayerSummary[];
  };
}

interface DiscordEmbed {
  title: string;
  fields: {
    name: string;
    value: string;
    inline: boolean;
  }[];
  color: number;
  footer?: {
    text: string;
  };
}

interface DiscordMessage {
  embeds: DiscordEmbed[];
  components: {
    type: number;
    components: {
      type: number;
      style: number;
      label: string;
      emoji: {
        name: string;
      };
      url: string;
      custom_id?: string; // Optional for link buttons
    }[];
  }[];
}

// Cache Steam usernames for 24 hours (86400 seconds)
const STEAM_USERNAME_CACHE_TTL = 86400;

async function getSteamUsername(steamId: string, env: Env): Promise<string> {
  try {
    // First, check our KV cache
    const cacheKey = `steam_username_${steamId}`;
    const cachedName = await env.SESSIONS.get(cacheKey);

    if (cachedName) {
      return cachedName;
    }

    // If not in cache, fetch from Steam API
    const steamApiUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${steamId}`;

    const response = await proxyFetch(steamApiUrl, {}, env);
    if (!response.ok) {
      console.error(`Steam API Anfrage fehlgeschlagen: ${response.status}`);
      return 'Unbekannt';
    }

    const data: SteamApiResponse = await response.json();

    if (!data.response?.players || data.response.players.length === 0) {
      console.error(`Keine Spielerdaten gefunden für Steam ID: ${steamId}`);
      return 'Unbekannt';
    }

    const playerName = data.response.players[0]?.personaname || 'Unknown';

    // Cache the username for 24 hours
    await env.SESSIONS.put(cacheKey, playerName, {
      expirationTtl: STEAM_USERNAME_CACHE_TTL,
    });

    return playerName;
  } catch (error) {
    console.error(`Fehler beim Abrufen des Steam Benutzernamens für ${steamId}:`, error);
    return 'Unbekannt';
  }
}

async function getLeaderboardData(
  db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<{
  snake: LeaderboardEntry[];
  kills: LeaderboardEntry[];
  deaths: LeaderboardEntry[];
  zvcoins: LeaderboardEntry[];
  playtime: LeaderboardEntry[];
  rounds: LeaderboardEntry[];
  medkits: LeaderboardEntry[];
  colas: LeaderboardEntry[];
  pocketescapes: LeaderboardEntry[];
  adrenaline: LeaderboardEntry[];
  slotSpins: LeaderboardEntry[];
  slotWins: LeaderboardEntry[];
  luckyWheelWins: LeaderboardEntry[];
}> {
  // Helper function to format leaderboard entries
  const formatLeaderboard = async <T extends { id: string; discordId: string | null }>(
    data: T[],
    valueKey: string,
  ): Promise<LeaderboardEntry[]> => {
    const entries = await Promise.all(
      data.map(async (item, index) => ({
        name: await getSteamUsername(item.id, env),
        value: ((item as any)[valueKey] as number) || 0,
        rank: index + 1,
        discordId: item.discordId,
      })),
    );
    return entries;
  };

  // Get all leaderboard data in parallel
  const [
    snakeData,
    killsData,
    deathsData,
    zvcoinsData,
    playtimeData,
    roundsData,
    medkitsData,
    colasData,
    pocketescapesData,
    adrenalineData,
    slotSpinsData,
    slotWinsData,
    luckyWheelWinsData,
  ] = await Promise.all([
    // Top 3 snake scores
    db
      .select({
        id: playerdata.id,
        snakehighscore: playerdata.snakehighscore,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.snakehighscore))
      .limit(3),

    // Top 3 by kills
    db
      .select({
        id: playerdata.id,
        killcount: playerdata.killcount,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.killcount))
      .limit(3),

    // Top 3 by deaths
    db
      .select({
        id: playerdata.id,
        deathcount: playerdata.deathcount,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.deathcount))
      .limit(3),

    // Top 3 by ZV Coins (experience)
    db
      .select({
        id: playerdata.id,
        experience: playerdata.experience,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.experience))
      .limit(3),

    // Top 3 by playtime
    db
      .select({
        id: playerdata.id,
        playtime: playerdata.playtime,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.playtime))
      .limit(3),

    // Top 3 by rounds played
    db
      .select({
        id: playerdata.id,
        roundsplayed: playerdata.roundsplayed,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.roundsplayed))
      .limit(3),

    // Top 3 by medkits used
    db
      .select({
        id: playerdata.id,
        usedmedkits: playerdata.usedmedkits,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.usedmedkits))
      .limit(3),

    // Top 3 by colas used
    db
      .select({
        id: playerdata.id,
        usedcolas: playerdata.usedcolas,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.usedcolas))
      .limit(3),

    // Top 3 by pocket escapes
    db
      .select({
        id: playerdata.id,
        pocketescapes: playerdata.pocketescapes,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.pocketescapes))
      .limit(3),

    // Top 3 by adrenaline used
    db
      .select({
        id: playerdata.id,
        usedadrenaline: playerdata.usedadrenaline,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.usedadrenaline))
      .limit(3),

    db
      .select({
        id: playerdata.id,
        slotSpins: playerdata.slotSpins,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.slotSpins))
      .limit(3),

    db
      .select({
        id: playerdata.id,
        slotWins: playerdata.slotWins,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.slotWins))
      .limit(3),

    db
      .select({
        id: playerdata.id,
        luckyWheelWins: playerdata.luckyWheelWins,
        discordId: playerdata.discordId,
      })
      .from(playerdata)
      .where(ne(playerdata.id, 'anonymous'))
      .orderBy(desc(playerdata.luckyWheelWins))
      .limit(3),
  ]);

  return {
    snake: await formatLeaderboard(snakeData, 'snakehighscore'),
    kills: await formatLeaderboard(killsData, 'killcount'),
    deaths: await formatLeaderboard(deathsData, 'deathcount'),
    zvcoins: await formatLeaderboard(zvcoinsData, 'experience'),
    playtime: await formatLeaderboard(playtimeData, 'playtime'),
    rounds: await formatLeaderboard(roundsData, 'roundsplayed'),
    medkits: await formatLeaderboard(medkitsData, 'usedmedkits'),
    colas: await formatLeaderboard(colasData, 'usedcolas'),
    pocketescapes: await formatLeaderboard(pocketescapesData, 'pocketescapes'),
    adrenaline: await formatLeaderboard(adrenalineData, 'usedadrenaline'),
    slotSpins: await formatLeaderboard(slotSpinsData, 'slotSpins'),
    slotWins: await formatLeaderboard(slotWinsData, 'slotWins'),
    luckyWheelWins: await formatLeaderboard(luckyWheelWinsData, 'luckyWheelWins'),
  };
}

function formatPlaytime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (remainingHours > 0) {
    return `${days}d ${remainingHours}h`;
  }

  return `${days}d`;
}

function formatLeaderboardField(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return 'Keine Daten verfügbar';
  }

  let response = entries
    .map((entry, index) => {
      // Use Discord mention if discordId is available, otherwise use Steam username
      const displayName = entry.discordId ? `<@${entry.discordId}>` : entry.name;

      if (index === 0) {
        return `**${entry.rank}. ${displayName} (${entry.value})**`;
      } else if (index === 1) {
        return `${entry.rank}. ${displayName} (${entry.value})\n`;
      } else {
        return `-# ${entry.rank}. ${displayName} (${entry.value})\n`;
      }
    })
    .join('')
    .trimEnd();
  console.log('Formatted leaderboard field:', response);
  return response || 'Keine Daten verfügbar';
}

function formatPlaytimeLeaderboardField(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return 'Keine Daten verfügbar';
  }

  return entries
    .map((entry, index) => {
      const formattedTime = formatPlaytime(entry.value);
      // Use Discord mention if discordId is available, otherwise use Steam username
      const displayName = entry.discordId ? `<@${entry.discordId}>` : entry.name;

      if (index === 0) {
        return `**${entry.rank}. ${displayName} (${formattedTime})**`;
      } else if (index === 1) {
        return `${entry.rank}. ${displayName} (${formattedTime})\n`;
      } else {
        return `-# ${entry.rank}. ${displayName} (${formattedTime})\n`;
      }
    })
    .join('')
    .trimEnd();
}

function createDiscordMessage(
  leaderboardData: ReturnType<typeof getLeaderboardData> extends Promise<infer T> ? T : never,
  env: Env,
): DiscordMessage {
  // Create timestamp for last update
  const now = new Date();
  const timestamp = now.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return {
    embeds: [
      {
        title: '🏆 Zeitvertreib Bestenliste',
        fields: [
          {
            name: '🐍 Snake Highscore',
            value: formatLeaderboardField(leaderboardData.snake),
            inline: true,
          },
          {
            name: '💀 Kills',
            value: formatLeaderboardField(leaderboardData.kills),
            inline: true,
          },
          {
            name: '☠️ Tode',
            value: formatLeaderboardField(leaderboardData.deaths),
            inline: true,
          },
          {
            name: '🪙 ZV Coins',
            value: formatLeaderboardField(leaderboardData.zvcoins),
            inline: true,
          },
          {
            name: '⏱️ Spielzeit',
            value: formatPlaytimeLeaderboardField(leaderboardData.playtime),
            inline: true,
          },
          {
            name: '🎮 Gespielte Runden',
            value: formatLeaderboardField(leaderboardData.rounds),
            inline: true,
          },
          {
            name: '🩹 Medkits verwendet',
            value: formatLeaderboardField(leaderboardData.medkits),
            inline: true,
          },
          {
            name: '🥤 Colas getrunken',
            value: formatLeaderboardField(leaderboardData.colas),
            inline: true,
          },
          {
            name: '🚪 Pocket Escapes',
            value: formatLeaderboardField(leaderboardData.pocketescapes),
            inline: true,
          },
          {
            name: '💉 Adrenalin verwendet',
            value: formatLeaderboardField(leaderboardData.adrenaline),
            inline: true,
          },
          {
            name: '🎰 Slot Spins',
            value: formatLeaderboardField(leaderboardData.slotSpins),
            inline: true,
          },
          {
            name: '🏆 Slots ZVC Gewinne',
            value: formatLeaderboardField(leaderboardData.slotWins),
            inline: true,
          },
          {
            name: '🏆 Glücksrad ZVC Gewinne',
            value: formatLeaderboardField(leaderboardData.luckyWheelWins),
            inline: true,
          },
          /*
          {
            name: '\u200b', // Empty field for spacing
            value: '\u200b',
            inline: true,
          },
          */
        ],
        footer: {
          text: `Bestenliste aktualisiert sich alle 15 Minuten • Letzte Aktualisierung: ${timestamp}`,
        },
        color: 13568958, // Purple color similar to your example
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Meine eigenen Statistiken?',
            emoji: {
              name: '👾',
            },
            url: env.FRONTEND_URL + '/dashboard',
          },
        ],
      },
    ],
  };
}

async function sendOrUpdateDiscordMessage(env: Env, message: DiscordMessage): Promise<boolean> {
  try {
    const webhookUrl = env.LEADERBOARD_WEBHOOK;

    if (!webhookUrl) {
      console.error('LEADERBOARD_WEBHOOK Umgebungsvariable nicht gesetzt');
      return false;
    }

    // First, try to get the latest message in the channel
    try {
      const messagesResponse = await proxyFetch(
        `${webhookUrl}?limit=1`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        env,
      );

      if (messagesResponse.ok) {
        const messages = (await messagesResponse.json()) as Array<{ id: string }> | null;

        if (messages && messages.length > 0) {
          const latestMessageId = messages[0]?.id;

          // Try to edit the latest message
          try {
            const editResponse = await proxyFetch(
              `${webhookUrl}/messages/${latestMessageId}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
              },
              env,
            );

            if (editResponse.ok) {
              console.log('Discord Bestenliste erfolgreich aktualisiert');
              return true;
            } else {
              console.log('Nachricht bearbeiten fehlgeschlagen, erstelle neue:', editResponse.status);
            }
          } catch (error) {
            console.log('Nachricht bearbeiten fehlgeschlagen, erstelle neue:', error);
          }
        }
      }
    } catch (error) {
      console.log('Fehler beim Abrufen der letzten Nachricht, erstelle neue:', error);
    }

    // If editing failed, send a new message
    const response = await proxyFetch(
      `${webhookUrl}?wait=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      },
      env,
    );

    if (response.ok) {
      const responseData = (await response.json()) as { id: string };
      console.log(`Neue Discord Bestenliste gesendet mit ID: ${responseData.id}`);
      return true;
    } else {
      console.error('Discord Nachricht senden fehlgeschlagen:', response.status, await response.text());
      return false;
    }
  } catch (error) {
    console.error('Fehler beim Senden der Discord Nachricht:', error);
    return false;
  }
}

export async function updateLeaderboard(db: ReturnType<typeof drizzle>, env: Env): Promise<boolean> {
  try {
    console.log('Starte Bestenliste Update...');

    // Get leaderboard data
    const leaderboardData = await getLeaderboardData(db, env);

    // Create Discord message
    const discordMessage = createDiscordMessage(leaderboardData, env);

    // Send or update Discord message
    const success = await sendOrUpdateDiscordMessage(env, discordMessage);

    if (success) {
      console.log('Bestenliste Update erfolgreich abgeschlossen');
    } else {
      console.error('Bestenliste Update fehlgeschlagen');
    }

    return success;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Bestenliste:', error);
    return false;
  }
}

// HTTP endpoint to manually trigger leaderboard update
export async function handleLeaderboardUpdate(_request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  try {
    const success = await updateLeaderboard(db, env);

    return new Response(
      JSON.stringify({
        success,
        message: success ? 'Bestenliste erfolgreich aktualisiert' : 'Bestenliste Update fehlgeschlagen',
      }),
      {
        status: success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
