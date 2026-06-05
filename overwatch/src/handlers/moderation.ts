import { Message } from 'discord.js';
import { TEAM_MEMBER_ROLE_IDs } from '../config/constants';
import { openai, buildModerationPrompt } from '../services/openai';
import { collectMediaFromMessage } from '../services/mediaDownloader';

export async function moderateMessage(message: Message): Promise<void> {
  if (message.author.bot) return;

  // Wait 1 second for Discord embeds to populate
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Fetch the latest message state to get any embeds Discord populated
  const freshMessage = await message.channel.messages.fetch(message.id).catch(() => message);

  if (!freshMessage.member) return;
  if (freshMessage.member.roles.cache.some((r) => TEAM_MEMBER_ROLE_IDs.includes(r.id))) return;

  // Check if the current message has a .txt attachment and fetch its content
  let messageContent = freshMessage.content;
  const txtAttachment = freshMessage.attachments.find((att) => att.name?.toLowerCase().endsWith('.txt'));

  if (txtAttachment) {
    try {
      const response = await fetch(txtAttachment.url);
      const text = await response.text();
      const fileContent = text.substring(0, 200) + (text.length > 200 ? ' [CONTENT CUT DUE TO LENGTH]' : '');

      if (messageContent) {
        messageContent = `${messageContent} [TXT File: ${fileContent}]`;
      } else {
        messageContent = fileContent;
      }
    } catch (err) {
      console.error('Error fetching txt file:', err);
    }
  }

  // fetch last 6 messages before current one for context
  const prevMessages = await freshMessage.channel.messages.fetch({
    limit: 7,
    before: freshMessage.id,
  });
  const context = Array.from(prevMessages.values())
    .reverse()
    .slice(0, 6)
    .map((m) => {
      const content = m.content.length > 200 ? m.content.substring(0, 200) + ' [CONTENT CUT DUE TO LENGTH]' : m.content;
      return `${m.author.username}: ${content}`;
    })
    .join('\n');

  // Collect media elements and metadata (images, gifs, videos, titles/descriptions)
  let mediaItems: { mimeType: string; base64: string }[] = [];
  let metadataList: { title?: string; description?: string }[] = [];
  try {
    const results = await collectMediaFromMessage(freshMessage);
    mediaItems = results.mediaItems;
    metadataList = results.metadata;
  } catch (mediaErr) {
    console.error('Error collecting media items:', mediaErr);
  }

  // Enhanced message content to include media metadata if available
  let enhancedMessageContent = messageContent;
  if (metadataList.length > 0) {
    const metadataStr = metadataList
      .map((meta) => {
        const parts: string[] = [];
        if (meta.title) parts.push(`Title: "${meta.title}"`);
        if (meta.description) parts.push(`Description: "${meta.description.substring(0, 200)}..."`);
        return `[Linked Media Metadata -> ${parts.join(' | ')}]`;
      })
      .join(' ');

    enhancedMessageContent = enhancedMessageContent
      ? `${enhancedMessageContent} ${metadataStr}`
      : metadataStr;
  }

  const prompt = buildModerationPrompt(context, freshMessage.author.username, enhancedMessageContent, mediaItems.length > 0);

  try {
    const messages: any[] = [];
    if (mediaItems.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...mediaItems.map((item) => ({
            type: 'image_url',
            image_url: {
              url: `data:${item.mimeType};base64,${item.base64}`,
            },
          })),
        ],
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const resp = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages,
    });

    const verdict = resp.choices[0].message.content?.trim();

    if (verdict && verdict.toUpperCase().includes('FLAG')) {
      console.log(`Flagged: ${freshMessage.cleanContent} by ${freshMessage.author.tag}`);
      await freshMessage.delete();

      // Extract explanation after "FLAG:"
      const explanation = verdict.includes(':')
        ? verdict.substring(verdict.indexOf(':') + 1).trim()
        : 'No explanation provided';

      if (freshMessage.channel.isSendable()) {
        await freshMessage.channel.send(`\`\`\`\n${explanation}\n\`\`\``);
      }
    }
  } catch (err) {
    console.error('Moderation error:', err);
  }
}
