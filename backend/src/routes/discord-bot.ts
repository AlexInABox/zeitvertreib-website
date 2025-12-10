/**
 * Discord bot interaction handler for Cloudflare Workers
 */

import { InteractionResponseType, verifyKey } from 'discord-interactions';
import { REST } from '@discordjs/rest';
import { Routes, InteractionType } from 'discord-api-types/v10';
import { commandManager } from '../discord/commands.js';
import { proxyFetch } from '../proxy.js';
import { createResponse } from '../utils.js';
import type { APIInteraction } from 'discord-api-types/v10';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import { playerdata } from '../db/schema.js';

interface VerificationResult {
  isValid: boolean;
  interaction?: APIInteraction;
}

async function verifyDiscordRequest(request: Request, env: Env): Promise<VerificationResult> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();

  const isValidRequest =
    signature && timestamp && (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));

  if (!isValidRequest) return { isValid: false };

  try {
    return { interaction: JSON.parse(body), isValid: true };
  } catch {
    return { isValid: false };
  }
}

export async function handleDiscordBotInteractions(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  const { isValid, interaction } = await verifyDiscordRequest(request, env);

  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.Ping) {
    return createResponse({ type: InteractionResponseType.PONG }, 200, origin);
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    const command = commandManager.find(interaction.data.name);

    if (!command) {
      return createResponse({ error: 'Unknown Command' }, 400, origin);
    }

    // Configure REST with custom fetch for proxying
    const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

    // Override the internal fetch method by monkey-patching
    (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

    const helpers = {
      reply: async (content: string | any) => {
        const body = typeof content === 'string' ? { content } : content;
        await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), { body });
      },
    };

    if (ctx) {
      ctx.waitUntil(
        (async () => {
          try {
            await command.execute(interaction, helpers, env, request);
          } catch (error) {
            console.error('Command error:', error);
            await helpers.reply('❌ Command failed!');
          }
        })(),
      );
    }

    return createResponse(
      {
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      },
      200,
      origin,
    );
  }

  if (interaction.type === InteractionType.MessageComponent) {
    const customId = interaction.data.custom_id;

    if (customId.startsWith('coinflip_cancel:')) {
      const parts = customId.split(':');
      if (parts.length >= 3) {
        const challengerId = parts[1];
        const clickerId = interaction.member?.user?.id || interaction.user?.id;

        if (clickerId !== challengerId) {
          return createResponse(
            {
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: '❌ Nur der Ersteller der Challenge kann sie abbrechen!',
                flags: 64, // Ephemeral
              },
            },
            200,
            origin,
          );
        }

        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
        (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

        if (ctx) {
          ctx.waitUntil(
            (async () => {
              try {
                await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                  body: {
                    content: '❌ **Münzwurf-Challenge abgebrochen!**',
                    embeds: [],
                    components: [],
                  },
                });
              } catch (error) {
                console.error('Cancel error:', error);
              }
            })(),
          );
        }

        return createResponse(
          {
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          },
          200,
          origin,
        );
      }
    }

    if (customId.startsWith('coinflip:')) {
      const parts = customId.split(':');
      if (parts.length >= 3) {
        const challengerId = parts[1];
        const amountStr = parts[2];
        if (!amountStr) {
          return createResponse({ error: 'Invalid amount' }, 400, origin);
        }
        const amount = parseInt(amountStr);
        const participantId = interaction.member?.user?.id || interaction.user?.id;

        if (!participantId || !challengerId || !amount) {
          return createResponse({ error: 'Invalid coinflip data' }, 400, origin);
        }

        if (participantId === challengerId) {
          return createResponse(
            {
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'Du kannst nicht gegen dich selbst spielen!',
                flags: 64, // Ephemeral
              },
            },
            200,
            origin,
          );
        }

        // Rest client for database operations
        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
        (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

        if (ctx) {
          ctx.waitUntil(
            (async () => {
              try {
                // Initialize Drizzle database
                const db = drizzle(env.ZEITVERTREIB_DATA);

                // Check both players' balances using Drizzle ORM
                const challengerBalanceResult = await db
                  .select({
                    experience: playerdata.experience,
                    discordId: playerdata.discordId,
                  })
                  .from(playerdata)
                  .where(eq(playerdata.discordId, challengerId))
                  .limit(1);

                const participantBalanceResult = await db
                  .select({
                    experience: playerdata.experience,
                    discordId: playerdata.discordId,
                  })
                  .from(playerdata)
                  .where(eq(playerdata.discordId, participantId))
                  .limit(1);

                const challengerBalance = challengerBalanceResult[0];
                const participantBalance = participantBalanceResult[0];

                // Check if challenger account is still linked
                if (!challengerBalance) {
                  await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                    body: {
                      embeds: [
                        {
                          title: '🔗 Challenger-Account nicht verknüpft!',
                          description: 'Der Ersteller der Challenge hat keinen verknüpften Zeitvertreib-Account mehr.',
                          color: 0xff6b6b,
                        },
                      ],
                      components: [],
                    },
                  });
                  return;
                }

                // Check if participant account is linked
                if (!participantBalance) {
                  await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                    body: {
                      embeds: [
                        {
                          title: '🔗 Discord-Account nicht verknüpft!',
                          description:
                            'Du musst deinen Discord-Account erst mit Zeitvertreib verknüpfen, um ZVC-Features nutzen zu können.',
                          color: 0xff6b6b,
                          fields: [
                            {
                              name: '👆 Hier verknüpfen:',
                              value: 'https://dev.zeitvertreib.vip/login',
                            },
                          ],
                        },
                      ],
                      components: [],
                    },
                  });
                  return;
                }

                if ((challengerBalance.experience || 0) < amount) {
                  await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                    body: {
                      content: '❌ Challenger hat nicht genügend ZVC!',
                      components: [],
                    },
                  });
                  return;
                }

                if ((participantBalance.experience || 0) < amount) {
                  await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                    body: {
                      content: '❌ Du hast nicht genügend ZVC für diesen Münzwurf!',
                      components: [],
                    },
                  });
                  return;
                }

                // Determine winner randomly
                const isParticipantWinner = Math.random() < 0.5;
                const winnerId = isParticipantWinner ? participantId : challengerId;
                const loserId = isParticipantWinner ? challengerId : participantId;

                // Calculate amounts (5% tax, but only if >= 1 ZVC - fair taxation)
                const tax = Math.floor(amount * 0.05); // Only tax if 5% results in at least 1 ZVC
                const winnerReceives = amount - tax;

                // Update balances using Drizzle ORM
                await db
                  .update(playerdata)
                  .set({ experience: sql`${playerdata.experience} + ${winnerReceives}` })
                  .where(eq(playerdata.discordId, winnerId));

                await db
                  .update(playerdata)
                  .set({ experience: sql`${playerdata.experience} - ${amount}` })
                  .where(eq(playerdata.discordId, loserId));

                // Get updated balances and usernames using Drizzle ORM
                const winnerDataResult = await db
                  .select({
                    experience: playerdata.experience,
                    username: playerdata.username,
                  })
                  .from(playerdata)
                  .where(eq(playerdata.discordId, winnerId))
                  .limit(1);

                const loserDataResult = await db
                  .select({
                    experience: playerdata.experience,
                    username: playerdata.username,
                  })
                  .from(playerdata)
                  .where(eq(playerdata.discordId, loserId))
                  .limit(1);

                const winnerData = winnerDataResult[0];
                const loserData = loserDataResult[0];

                const winnerUser =
                  winnerId === participantId
                    ? interaction.member?.user || interaction.user
                    : ((await rest.get(Routes.user(challengerId))) as any);

                const loserUser =
                  loserId === participantId
                    ? interaction.member?.user || interaction.user
                    : ((await rest.get(Routes.user(challengerId))) as any);

                const winnerDisplayName = winnerUser?.global_name || winnerUser?.username || 'Unknown';
                const loserDisplayName = loserUser?.global_name || loserUser?.username || 'Unknown';

                // Get Steam usernames if available
                const winnerSteamName = winnerData?.username ? ` (${winnerData.username})` : '';
                const loserSteamName = loserData?.username ? ` (${loserData.username})` : '';

                // Format numbers with commas and backticks
                const formatBalance = (num: number) => `\`${num.toLocaleString('de-DE')}\``;

                const resultEmbed = {
                  title: '🪙 Münzwurf Ergebnis!',
                  description: `**${winnerDisplayName}** hat den Münzwurf gegen **${loserDisplayName}** gewonnen!`,
                  color: 0xf1c40f,
                  fields: [
                    {
                      name: `🏆 Gewinner: ${winnerDisplayName}${winnerSteamName}`,
                      value: `${formatBalance((winnerId === participantId ? participantBalance.experience : challengerBalance.experience) || 0)} ➜ ${formatBalance(winnerData?.experience || 0)}`,
                      inline: false,
                    },
                    {
                      name: `💸 Verlierer: ${loserDisplayName}${loserSteamName}`,
                      value: `${formatBalance((loserId === participantId ? participantBalance.experience : challengerBalance.experience) || 0)} ➜ ${formatBalance(loserData?.experience || 0)}`,
                      inline: false,
                    },
                    {
                      name: '💰 Einsatz',
                      value: `${amount.toLocaleString('de-DE')} ZVC`,
                      inline: true,
                    },
                    {
                      name: '🏦 Steuer (5%)',
                      value: `${tax.toLocaleString('de-DE')} ZVC`,
                      inline: true,
                    },
                    {
                      name: '✨ Gewinner erhält',
                      value: `${winnerReceives.toLocaleString('de-DE')} ZVC`,
                      inline: true,
                    },
                  ],
                };

                await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                  body: {
                    content: '',
                    embeds: [resultEmbed],
                    components: [],
                  },
                });
              } catch (error) {
                console.error('Coinflip error:', error);
                await rest.patch(Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token), {
                  body: {
                    content: '❌ Ein Fehler ist beim Münzwurf aufgetreten!',
                    components: [],
                  },
                });
              }
            })(),
          );
        }

        // Acknowledge the interaction
        return createResponse(
          {
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          },
          200,
          origin,
        );
      }
    }

    return createResponse({ error: 'Unknown component interaction' }, 400, origin);
  }

  return createResponse({ error: 'Unknown interaction type' }, 400, origin);
}
