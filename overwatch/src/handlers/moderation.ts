import { Message } from 'discord.js';
import { TEAM_MEMBER_ROLE_IDs } from '../config/constants';
import { openai, buildModerationPrompt } from '../services/openai';

export async function moderateMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.member) return;
  if (message.member.roles.cache.some((r) => TEAM_MEMBER_ROLE_IDs.includes(r.id))) return;

  // Check if the current message has a .txt attachment and fetch its content
  let messageContent = message.content;
  const txtAttachment = message.attachments.find((att) => att.name?.toLowerCase().endsWith('.txt'));

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
  const prevMessages = await message.channel.messages.fetch({
    limit: 7,
    before: message.id,
  });
  const context = Array.from(prevMessages.values())
    .reverse()
    .slice(0, 6)
    .map((m) => {
      const content = m.content.length > 200 ? m.content.substring(0, 200) + ' [CONTENT CUT DUE TO LENGTH]' : m.content;
      return `${m.author.username}: ${content}`;
    })
    .join('\n');

  const prompt = buildModerationPrompt(context, message.author.username, messageContent);

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = resp.choices[0].message.content?.trim();

    if (verdict && verdict.toUpperCase().includes('FLAG')) {
      console.log(`Flagged: ${message.cleanContent} by ${message.author.tag}`);
      await message.delete();

      // Extract explanation after "FLAG:"
      const explanation = verdict.includes(':')
        ? verdict.substring(verdict.indexOf(':') + 1).trim()
        : 'No explanation provided';

      if (message.channel.isSendable()) {
        await message.channel.send(`\`\`\`\n${explanation}\n\`\`\``);
      }
    }
  } catch (err) {
    console.error('Moderation error:', err);
  }
}
