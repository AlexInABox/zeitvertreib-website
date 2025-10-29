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

interface VerificationResult {
    isValid: boolean;
    interaction?: APIInteraction;
}

async function verifyDiscordRequest(
    request: Request,
    env: Env,
): Promise<VerificationResult> {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    const isValidRequest =
        signature &&
        timestamp &&
        (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));

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
        (rest as any).fetch = (url: string, init: any) =>
            proxyFetch(url, init, env);

        const helpers = {
            reply: async (content: string | any) => {
                const body = typeof content === 'string' ? { content } : content;
                await rest.patch(
                    Routes.webhookMessage(env.DISCORD_APPLICATION_ID, interaction.token),
                    { body },
                );
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

    return createResponse(
        { error: 'Unknown interaction type' },
        400,
        origin,
    );
}