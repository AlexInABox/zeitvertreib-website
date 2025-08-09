interface Env {
  SESSIONS: KVNamespace;
  FRONTEND_URL: string;
  BACKEND_URL: string;
  'zeitvertreib-data': D1Database;
  STEAM_API_KEY: string;
  OPENAI_API_KEY: string;
  SPRAY_MOD_WEBHOOK: string;
  LEADERBOARD_WEBHOOK: string;
  LEADERBOARD_MESSAGE_ID: string;
}

interface PlayerStats {
  id: string;
  experience: number;
  playtime: number;
  roundsplayed: number;
  usedmedkits: number;
  usedcolas: number;
  pocketescapes: number;
  usedadrenaline: number;
  fakerank: string | null;
  snakehighscore: number;
  kills: number;
}

interface LeaderboardEntry {
  name: string;
  value: number;
  rank: number;
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

    const response = await fetch(steamApiUrl);
    if (!response.ok) {
      console.error(`Steam API Anfrage fehlgeschlagen: ${response.status}`);
      return 'Unbekannt';
    }

    const data: SteamApiResponse = await response.json();

    if (!data.response?.players || data.response.players.length === 0) {
      console.error(`Keine Spielerdaten gefunden für Steam ID: ${steamId}`);
      return 'Unbekannt';
    }

    const playerName = data.response.players[0].personaname;

    // Cache the username for 24 hours
    await env.SESSIONS.put(cacheKey, playerName, {
      expirationTtl: STEAM_USERNAME_CACHE_TTL,
    });

    return playerName;
  } catch (error) {
    console.error(
      `Fehler beim Abrufen des Steam Benutzernamens für ${steamId}:`,
      error,
    );
    return 'Unbekannt';
  }
}

async function getLeaderboardData(env: Env): Promise<{
  snake: LeaderboardEntry[];
  kills: LeaderboardEntry[];
  deaths: LeaderboardEntry[];
  experience: LeaderboardEntry[];
  playtime: LeaderboardEntry[];
  rounds: LeaderboardEntry[];
}> {
  const db = env['zeitvertreib-data'];

  // Get top 3 snake scores
  const snakeQuery = await db
    .prepare(
      `
    SELECT id, snakehighscore 
    FROM playerdata 
    WHERE snakehighscore > 0 
    ORDER BY snakehighscore DESC 
    LIMIT 3
  `,
    )
    .all();

  // Get top 3 by experience
  const experienceQuery = await db
    .prepare(
      `
    SELECT id, experience 
    FROM playerdata 
    WHERE experience > 0 
    ORDER BY experience DESC 
    LIMIT 3
  `,
    )
    .all();

  // Get top 3 by playtime
  const playtimeQuery = await db
    .prepare(
      `
    SELECT id, playtime 
    FROM playerdata 
    WHERE playtime > 0 
    ORDER BY playtime DESC 
    LIMIT 3
  `,
    )
    .all();

  // Get top 3 by rounds played
  const roundsQuery = await db
    .prepare(
      `
    SELECT id, roundsplayed 
    FROM playerdata 
    WHERE roundsplayed > 0 
    ORDER BY roundsplayed DESC 
    LIMIT 3
  `,
    )
    .all();

  // Get top 3 by kill count
  const killsQuery = await db
    .prepare(
      `
    SELECT id, killcount 
    FROM playerdata 
    WHERE killcount > 0 
    ORDER BY killcount DESC 
    LIMIT 3
  `,
    )
    .all();

  // Get top 3 by death count
  const deathsQuery = await db
    .prepare(
      `
    SELECT id, deathcount 
    FROM playerdata 
    WHERE deathcount > 0 
    ORDER BY deathcount DESC 
    LIMIT 3
  `,
    )
    .all(); // Helper function to format leaderboard entries
  const formatLeaderboard = async (
    data: any[],
    valueKey: string,
  ): Promise<LeaderboardEntry[]> => {
    const entries = await Promise.all(
      data.map(async (item, index) => ({
        name: await getSteamUsername(item.id || '', env),
        value: item[valueKey] || 0,
        rank: index + 1,
      })),
    );
    return entries;
  };

  return {
    snake: await formatLeaderboard(snakeQuery.results, 'snakehighscore'),
    kills: await formatLeaderboard(killsQuery.results, 'killcount'),
    deaths: await formatLeaderboard(deathsQuery.results, 'deathcount'),
    experience: await formatLeaderboard(experienceQuery.results, 'experience'),
    playtime: await formatLeaderboard(playtimeQuery.results, 'playtime'),
    rounds: await formatLeaderboard(roundsQuery.results, 'roundsplayed'),
  };
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
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

  return entries
    .map((entry, index) => {
      const prefix = index === 0 ? '**' : '-# ';
      const suffix = index === 0 ? '**' : '';
      return `${prefix}${entry.rank}. ${entry.name} (${entry.value})${suffix}`;
    })
    .join('\n');
}

function formatPlaytimeLeaderboardField(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return 'Keine Daten verfügbar';
  }

  return entries
    .map((entry, index) => {
      const prefix = index === 0 ? '**' : '-# ';
      const suffix = index === 0 ? '**' : '';
      const formattedTime = formatPlaytime(entry.value);
      return `${prefix}${entry.rank}. ${entry.name} (${formattedTime})${suffix}`;
    })
    .join('\n');
}

function createDiscordMessage(
  leaderboardData: ReturnType<typeof getLeaderboardData> extends Promise<
    infer T
  >
    ? T
    : never,
): DiscordMessage {
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
            name: '⭐ XP',
            value: formatLeaderboardField(leaderboardData.experience),
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
        ],
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
            url: 'https://dev.zeitvertreib.vip/dashboard',
          },
        ],
      },
    ],
  };
}

async function sendOrUpdateDiscordMessage(
  env: Env,
  message: DiscordMessage,
): Promise<boolean> {
  try {
    const webhookUrl = env.LEADERBOARD_WEBHOOK;
    const messageId = env.LEADERBOARD_MESSAGE_ID;

    if (!webhookUrl) {
      console.error('LEADERBOARD_WEBHOOK Umgebungsvariable nicht gesetzt');
      return false;
    }

    // First, try to edit the existing message if messageId is provided
    if (messageId) {
      try {
        const editResponse = await fetch(
          `${webhookUrl}/messages/${messageId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          },
        );

        if (editResponse.ok) {
          console.log('Discord Bestenliste erfolgreich aktualisiert');
          return true;
        } else {
          console.log(
            'Nachricht bearbeiten fehlgeschlagen, erstelle neue:',
            editResponse.status,
          );
        }
      } catch (error) {
        console.log(
          'Nachricht bearbeiten fehlgeschlagen, erstelle neue:',
          error,
        );
      }
    }

    // If editing failed or no messageId, send a new message
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (response.ok) {
      const responseData = (await response.json()) as { id: string };
      console.log(
        `Neue Discord Bestenliste gesendet mit ID: ${responseData.id}`,
      );
      console.log(
        'Du möchtest vielleicht LEADERBOARD_MESSAGE_ID aktualisieren zu:',
        responseData.id,
      );
      return true;
    } else {
      console.error(
        'Discord Nachricht senden fehlgeschlagen:',
        response.status,
        await response.text(),
      );
      return false;
    }
  } catch (error) {
    console.error('Fehler beim Senden der Discord Nachricht:', error);
    return false;
  }
}

export async function updateLeaderboard(env: Env): Promise<boolean> {
  try {
    console.log('Starte Bestenliste Update...');

    // Get leaderboard data
    const leaderboardData = await getLeaderboardData(env);

    // Create Discord message
    const discordMessage = createDiscordMessage(leaderboardData);

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
export async function handleLeaderboardUpdate(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const success = await updateLeaderboard(env);

    return new Response(
      JSON.stringify({
        success,
        message: success
          ? 'Bestenliste erfolgreich aktualisiert'
          : 'Bestenliste Update fehlgeschlagen',
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
