/**
 * Discord bot interaction handler for Cloudflare Workers
 */

import { InteractionResponseType, verifyKey } from 'discord-interactions';
import { REST } from '@discordjs/rest';
import { Routes, InteractionType } from 'discord-api-types/v10';
import { commandManager } from '../discord/commands.js';
import { proxyFetch } from '../proxy.js';
import { AwsClient } from 'aws4fetch';
import { createResponse } from '../utils.js';
import type { APIInteraction } from 'discord-api-types/v10';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import { playerdata, sprays, sprayBans, deletedSprays } from '../db/schema.js';

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
                              value: env.FRONTEND_URL + '/login',
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

    // Handle spray ban button - show modal
    if (customId.startsWith('spray_ban:')) {
      const parts = customId.split(':');
      const sha256Hash = parts[1] || '';
      const userId = parts[2] || '';

      return createResponse(
        {
          type: InteractionResponseType.MODAL,
          data: {
            custom_id: `spray_ban_modal:${sha256Hash}:${userId}`,
            title: 'Ban User from Sprays',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'ban_reason',
                    label: 'Reason for ban',
                    style: 2,
                    min_length: 1,
                    max_length: 500,
                    placeholder: 'Enter the reason for banning this user...',
                    required: true,
                  },
                ],
              },
            ],
          },
        },
        200,
        origin,
      );
    }

    // Handle spray unban button - show modal
    if (customId.startsWith('spray_unban:')) {
      const parts = customId.split(':');
      const userId = parts[1] || '';

      return createResponse(
        {
          type: InteractionResponseType.MODAL,
          data: {
            custom_id: `spray_unban_modal:${userId}`,
            title: 'Unban User from Sprays',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'unban_reason',
                    label: 'Reason for unban',
                    style: 2,
                    min_length: 1,
                    max_length: 500,
                    placeholder: 'Enter the reason for unbanning this user...',
                    required: true,
                  },
                ],
              },
            ],
          },
        },
        200,
        origin,
      );
    }

    // Handle spray delete/undelete button
    if (customId.startsWith('spray_delete:') || customId.startsWith('spray_undelete:')) {
      const parts = customId.split(':');
      console.log(`🔍 Spray delete/undelete interaction, parts:`, parts);

      if (parts.length < 3) {
        console.error(`❌ Invalid custom_id format, expected at least 3 parts, got ${parts.length}:`, customId);
        return createResponse({ error: 'Invalid spray moderation data - missing parts' }, 400, origin);
      }

      const action = parts[0]; // 'spray_delete' or 'spray_undelete'
      const sha256Hash = parts[1] || '';
      const userId = parts[2] || '';

      const moderatorId = interaction.member?.user?.id || interaction.user?.id;

      if (!moderatorId) {
        console.error(`❌ Missing moderatorId:`, { moderatorId });
        return createResponse({ error: 'Invalid spray moderation data' }, 400, origin);
      }

      if (!sha256Hash) {
        console.error(`❌ Missing sha256Hash in custom_id:`, customId);
        return createResponse({ error: 'Invalid spray moderation data - missing hash' }, 400, origin);
      }

      // For spray_delete, show modal to require deletion reason
      if (action === 'spray_delete') {
        return createResponse(
          {
            type: InteractionResponseType.MODAL,
            data: {
              title: 'Delete Spray',
              custom_id: `spray_delete_modal:${sha256Hash}:${userId}`,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: 'delete_reason',
                      label: 'Reason for deletion',
                      style: 2, // Paragraph
                      required: true,
                      max_length: 500,
                      placeholder: 'Why are you deleting this spray?',
                    },
                  ],
                },
              ],
            },
          },
          200,
          origin,
        );
      }

      // For spray_undelete, show modal to require restoration reason
      if (action === 'spray_undelete') {
        return createResponse(
          {
            type: InteractionResponseType.MODAL,
            data: {
              title: 'Unblock Spray Hash',
              custom_id: `spray_undelete_modal:${sha256Hash}:${userId}`,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 4,
                      custom_id: 'restore_reason',
                      label: 'Reason for unblocking',
                      style: 2, // Paragraph
                      required: true,
                      max_length: 500,
                      placeholder: 'Why are you unblocking this hash?',
                    },
                  ],
                },
              ],
            },
          },
          200,
          origin,
        );
      }
    }

    return createResponse({ error: 'Unknown component interaction' }, 400, origin);
  }

  // Handle modal submissions
  if (interaction.type === InteractionType.ModalSubmit) {
    const customId = interaction.data.custom_id;
    console.log('📥 ModalSubmit received, custom_id=', customId);
    try {
      console.log('📥 Modal data:', JSON.stringify(interaction.data));
    } catch (e) {
      console.log('📥 Modal data (non-serializable)');
    }

    // Handle spray delete modal submission
    if (customId.startsWith('spray_delete_modal:')) {
      const parts = customId.split(':');
      if (parts.length >= 3) {
        const sha256Hash = parts[1] || '';
        const userId = parts[2] || '';

        const moderatorId = interaction.member?.user?.id || interaction.user?.id;
        console.log('🗑️ spray_delete_modal submit parsed:', { userId, sha256Hash, moderatorId });

        // Extract reason from modal submission
        let deleteReason = 'No reason provided';
        if ('components' in interaction.data && interaction.data.components) {
          const components = interaction.data.components as any;
          deleteReason = components[0]?.components?.[0]?.value || 'No reason provided';
        }

        if (!moderatorId) {
          console.error('❌ Missing moderator id on modal submit');
          return createResponse({ error: 'Invalid spray moderation data' }, 400, origin);
        }
        if (!sha256Hash) {
          console.error('❌ Missing sha256 hash on modal submit');
          return createResponse({ error: 'Missing hash' }, 400, origin);
        }

        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
        (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

        if (ctx) {
          ctx.waitUntil(
            (async () => {
              try {
                const db = drizzle(env.ZEITVERTREIB_DATA);

                // Get moderator info
                let moderatorName = 'Unknown Moderator';
                try {
                  const moderatorData: any = await rest.get(Routes.user(moderatorId));
                  moderatorName = moderatorData.global_name || moderatorData.username || 'Unknown Moderator';
                } catch (error) {
                  console.error('Failed to fetch moderator info:', error);
                }

                // Delete spray(s) matching the hash (hard delete) and remove their S3 files
                const sprayRows = await db.select().from(sprays).where(eq(sprays.sha256, sha256Hash));
                const aws = new AwsClient({
                  accessKeyId: env.MINIO_ACCESS_KEY,
                  secretAccessKey: env.MINIO_SECRET_KEY,
                  service: 's3',
                  region: 'us-east-1',
                });
                const BUCKET = 'test';
                const SPRAY_FOLDER = 'sprays';

                if (sprayRows.length === 0) {
                  console.log(`ℹ️ No spray rows found for hash ${sha256Hash}, skipping S3 deletions`);
                } else {
                  for (const row of sprayRows) {
                    const idToDelete = row.id;
                    const basePath = `${SPRAY_FOLDER}/${idToDelete}`;
                    const txtPath = `${basePath}.txt`;
                    const base64Path = `${basePath}.base64`;

                    // Delete .txt file
                    try {
                      const txtUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${txtPath}`;
                      const txtRequest = await aws.sign(txtUrl, { method: 'DELETE' });
                      const txtResponse = await fetch(txtRequest);
                      if (!txtResponse.ok) {
                        console.warn(`Failed to delete .txt file for spray ${idToDelete}:`, await txtResponse.text());
                      }
                    } catch (e) {
                      console.warn(`Failed to delete .txt for spray ${idToDelete}:`, e);
                    }

                    // Delete .base64 file
                    try {
                      const base64Url = `https://s3.zeitvertreib.vip/${BUCKET}/${base64Path}`;
                      const base64Request = await aws.sign(base64Url, { method: 'DELETE' });
                      const base64Response = await fetch(base64Request);
                      if (!base64Response.ok) {
                        console.warn(
                          `Failed to delete .base64 file for spray ${idToDelete}:`,
                          await base64Response.text(),
                        );
                      }
                    } catch (e) {
                      console.warn(`Failed to delete .base64 for spray ${idToDelete}:`, e);
                    }
                  }

                  // Delete rows from sprays table for this hash
                  await db.delete(sprays).where(eq(sprays.sha256, sha256Hash));
                }

                // Add hash to deletedSprays blocklist to prevent future uploads
                await db
                  .insert(deletedSprays)
                  .values({
                    sha256: sha256Hash,
                    uploadedByUserid: userId,
                    deletedByDiscordId: moderatorId,
                    reason: deleteReason,
                  })
                  .onConflictDoUpdate({
                    target: deletedSprays.sha256,
                    set: {
                      deletedByDiscordId: moderatorId,
                      reason: deleteReason,
                    },
                  });

                // Update Discord message
                if (!interaction.channel?.id || !interaction.message?.id) {
                  console.error('Missing channel or message ID');
                  return;
                }

                const currentMessage: any = await rest.get(
                  Routes.channelMessage(interaction.channel.id, interaction.message.id),
                );

                const updatedEmbed = currentMessage.embeds[0];
                updatedEmbed.title = '🗑️ Spray deleted!';
                updatedEmbed.color = 0xef4444; // Red
                const epochTimestamp = Math.floor(Date.now() / 1000);
                const formattedDeleteReason = deleteReason
                  .split('\n')
                  .map((line: string) => '> ' + line)
                  .join('\n');
                updatedEmbed.description += `\n–––––––––––\n**Deleted** by: <@${moderatorId}> (${moderatorName}) - <t:${epochTimestamp}:s>\n${formattedDeleteReason}`;

                await rest.patch(Routes.channelMessage(interaction.channel.id, interaction.message.id), {
                  body: {
                    embeds: [updatedEmbed],
                    attachements: [],
                    components: [
                      {
                        type: 1,
                        components: [
                          {
                            type: 2,
                            style: 3, // Green
                            label: 'Unblock Hash',
                            custom_id: `spray_undelete:${sha256Hash}:${userId}`,
                          },
                          {
                            type: 2,
                            style: 4, // Red
                            label: 'Ban User',
                            custom_id: `spray_ban:${sha256Hash}:${userId}`,
                          },
                        ],
                      },
                    ],
                  },
                });
              } catch (error) {
                console.error('Spray deletion error:', error);
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

    // Handle spray undelete modal submission
    if (customId.startsWith('spray_undelete_modal:')) {
      const parts = customId.split(':');
      if (parts.length >= 3) {
        const sha256Hash = parts[1] || '';
        const userId = parts[2] || '';

        const moderatorId = interaction.member?.user?.id || interaction.user?.id;

        // Extract reason from modal submission
        let restoreReason = 'No reason provided';
        if ('components' in interaction.data && interaction.data.components) {
          const components = interaction.data.components as any;
          restoreReason = components[0]?.components?.[0]?.value || 'No reason provided';
        }

        if (!moderatorId) {
          return createResponse({ error: 'Invalid spray moderation data' }, 400, origin);
        }

        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
        (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

        if (ctx) {
          ctx.waitUntil(
            (async () => {
              try {
                const db = drizzle(env.ZEITVERTREIB_DATA);

                // Get moderator info
                let moderatorName = 'Unknown Moderator';
                try {
                  const moderatorData: any = await rest.get(Routes.user(moderatorId));
                  moderatorName = moderatorData.global_name || moderatorData.username || 'Unknown Moderator';
                } catch (error) {
                  console.error('Failed to fetch moderator info:', error);
                }

                // Remove hash from deletedSprays blocklist to allow future uploads
                await db.delete(deletedSprays).where(eq(deletedSprays.sha256, sha256Hash));

                // Update Discord message
                if (!interaction.channel?.id || !interaction.message?.id) {
                  console.error('Missing channel or message ID');
                  return;
                }

                const currentMessage: any = await rest.get(
                  Routes.channelMessage(interaction.channel.id, interaction.message.id),
                );

                const updatedEmbed = currentMessage.embeds[0];
                updatedEmbed.title = '✅ Hash unblocked!';
                updatedEmbed.color = 0x10b981; // Green
                const epochTimestamp = Math.floor(Date.now() / 1000);
                const formattedRestoreReason = restoreReason
                  .split('\n')
                  .map((line: string) => '> ' + line)
                  .join('\n');
                updatedEmbed.description += `\n–––––––––––\n**Unblocked** by: <@${moderatorId}> (${moderatorName}) - <t:${epochTimestamp}:s>\n${formattedRestoreReason}`;

                await rest.patch(Routes.channelMessage(interaction.channel.id, interaction.message.id), {
                  body: {
                    embeds: [updatedEmbed],
                    components: [
                      {
                        type: 1,
                        components: [
                          {
                            type: 2,
                            style: 4, // Red
                            label: 'Delete Spray',
                            custom_id: `spray_delete:${sha256Hash}:${userId}`,
                          },
                          {
                            type: 2,
                            style: 4, // Red
                            label: 'Ban User',
                            custom_id: `spray_ban:${sha256Hash}:${userId}`,
                          },
                        ],
                      },
                    ],
                  },
                });
              } catch (error) {
                console.error('Spray restoration error:', error);
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

    // Handle spray ban modal submission
    if (customId.startsWith('spray_ban_modal:')) {
      const parts = customId.split(':');
      if (parts.length >= 3) {
        const sha256Hash = parts[1] || '';
        const userId = parts[2] || '';
        const moderatorId = interaction.member?.user?.id || interaction.user?.id;
        // Extract reason from modal submission
        const modalData = interaction.data as any;
        const reason = modalData.components?.[0]?.components?.[0]?.value || 'No reason provided';

        if (!moderatorId || !userId) {
          return createResponse({ error: 'Invalid spray ban data' }, 400, origin);
        }

        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
        (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

        if (ctx) {
          ctx.waitUntil(
            (async () => {
              try {
                const db = drizzle(env.ZEITVERTREIB_DATA);

                // Get moderator info
                let moderatorName = 'Unknown Moderator';
                try {
                  const moderatorData: any = await rest.get(Routes.user(moderatorId));
                  moderatorName = moderatorData.global_name || moderatorData.username || 'Unknown Moderator';
                } catch (error) {
                  console.error('Failed to fetch moderator info:', error);
                }

                // Delete any sprays matching the hash (hard delete)
                const sprayRows = await db.select().from(sprays).where(eq(sprays.sha256, sha256Hash));

                const aws = new AwsClient({
                  accessKeyId: env.MINIO_ACCESS_KEY,
                  secretAccessKey: env.MINIO_SECRET_KEY,
                  service: 's3',
                  region: 'us-east-1',
                });
                const BUCKET = 'test';
                const SPRAY_FOLDER = 'sprays';

                for (const row of sprayRows) {
                  const idToDelete = row.id;
                  const basePath = `${SPRAY_FOLDER}/${idToDelete}`;
                  const txtPath = `${basePath}.txt`;
                  const base64Path = `${basePath}.base64`;
                  try {
                    const txtUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${txtPath}`;
                    const txtRequest = await aws.sign(txtUrl, { method: 'DELETE' });
                    await fetch(txtRequest);
                  } catch (e) {
                    console.warn('Failed deleting txt', e);
                  }
                  try {
                    const base64Url = `https://s3.zeitvertreib.vip/${BUCKET}/${base64Path}`;
                    const base64Request = await aws.sign(base64Url, { method: 'DELETE' });
                    await fetch(base64Request);
                  } catch (e) {
                    console.warn('Failed deleting base64', e);
                  }
                }

                if (sprayRows.length > 0) {
                  await db.delete(sprays).where(eq(sprays.sha256, sha256Hash));
                }

                // Add hash to deletedSprays blocklist
                await db
                  .insert(deletedSprays)
                  .values({
                    sha256: sha256Hash,
                    uploadedByUserid: userId,
                    deletedByDiscordId: moderatorId,
                    reason: reason,
                  })
                  .onConflictDoUpdate({
                    target: deletedSprays.sha256,
                    set: {
                      deletedByDiscordId: moderatorId,
                      reason: reason,
                    },
                  });

                // Add user to ban table with provided reason
                const currentTimestamp = Math.floor(Date.now() / 1000);
                await db
                  .insert(sprayBans)
                  .values({
                    userid: userId,
                    bannedAt: currentTimestamp,
                    reason: reason,
                    bannedByDiscordId: moderatorId,
                  })
                  .onConflictDoNothing();

                // Update Discord message
                if (!interaction.channel?.id || !interaction.message?.id) {
                  console.error('Missing channel or message ID');
                  return;
                }

                const currentMessage: any = await rest.get(
                  Routes.channelMessage(interaction.channel.id, interaction.message.id),
                );

                const updatedEmbed = currentMessage.embeds[0];
                updatedEmbed.title = '🔨 User banned from sprays!';
                updatedEmbed.color = 0x7c2d12; // Dark red
                const epochTimestamp = Math.floor(Date.now() / 1000);
                const formattedReason = reason
                  .split('\n')
                  .map((line: string) => '> ' + line)
                  .join('\n');
                updatedEmbed.description += `\n–––––––––––\n**Banned** by: <@${moderatorId}> (${moderatorName}) - <t:${epochTimestamp}:s>\n${formattedReason}`;

                await rest.patch(Routes.channelMessage(interaction.channel.id, interaction.message.id), {
                  body: {
                    embeds: [updatedEmbed],
                    components: [
                      {
                        type: 1,
                        components: [
                          {
                            type: 2,
                            style: 2,
                            label: 'Unban User',
                            custom_id: `spray_unban:${userId}`,
                          },
                        ],
                      },
                    ],
                  },
                });
              } catch (error) {
                console.error('Spray ban error:', error);
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

    // Handle spray unban modal submission
    if (customId.startsWith('spray_unban_modal:')) {
      const parts = customId.split(':');
      if (parts.length >= 2) {
        const userId = parts[1] || '';
        const moderatorId = interaction.member?.user?.id || interaction.user?.id;
        // Extract reason from modal submission
        const modalData = interaction.data as any;
        const reason = modalData.components?.[0]?.components?.[0]?.value || 'No reason provided';

        if (!moderatorId || !userId) {
          return createResponse({ error: 'Invalid spray unban data' }, 400, origin);
        }

        const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
        (rest as any).fetch = (url: string, init: any) => proxyFetch(url, init, env);

        if (ctx) {
          ctx.waitUntil(
            (async () => {
              try {
                const db = drizzle(env.ZEITVERTREIB_DATA);

                // Get moderator info
                let moderatorName = 'Unknown Moderator';
                try {
                  const moderatorData: any = await rest.get(Routes.user(moderatorId));
                  moderatorName = moderatorData.global_name || moderatorData.username || 'Unknown Moderator';
                } catch (error) {
                  console.error('Failed to fetch moderator info:', error);
                }

                // Remove from ban table
                await db.delete(sprayBans).where(eq(sprayBans.userid, userId));

                // Update Discord message
                if (!interaction.channel?.id || !interaction.message?.id) {
                  console.error('Missing channel or message ID');
                  return;
                }

                const currentMessage: any = await rest.get(
                  Routes.channelMessage(interaction.channel.id, interaction.message.id),
                );

                const updatedEmbed = currentMessage.embeds[0];
                updatedEmbed.title = '✅ User unbanned from sprays!';
                updatedEmbed.color = 0x10b981; // Green
                const epochTimestamp = Math.floor(Date.now() / 1000);
                const formattedReason = reason
                  .split('\n')
                  .map((line: string) => '> ' + line)
                  .join('\n');
                updatedEmbed.description += `\n–––––––––––\n**Unbanned** by: <@${moderatorId}> (${moderatorName}) - <t:${epochTimestamp}:s>\n${formattedReason}`;

                // Get sha256 hash from the original embed to enable unblock button
                const originalDescription = updatedEmbed.description || '';
                const sha256Match = originalDescription.match(/SHA256: `([a-f0-9]+)`/);
                const sha256Hash = sha256Match ? sha256Match[1] : '';

                await rest.patch(Routes.channelMessage(interaction.channel.id, interaction.message.id), {
                  body: {
                    embeds: [updatedEmbed],
                    components: sha256Hash
                      ? [
                          {
                            type: 1,
                            components: [
                              {
                                type: 2,
                                style: 3, // Green
                                label: 'Unblock Hash',
                                custom_id: `spray_undelete:${sha256Hash}:${userId}`,
                              },
                              {
                                type: 2,
                                style: 4, // Red
                                label: 'Ban User',
                                custom_id: `spray_ban:${sha256Hash}:${userId}`,
                              },
                            ],
                          },
                        ]
                      : [],
                  },
                });
              } catch (error) {
                console.error('Spray unban error:', error);
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

    return createResponse({ error: 'Unknown modal submission' }, 400, origin);
  }

  return createResponse({ error: 'Unknown interaction type' }, 400, origin);
}
