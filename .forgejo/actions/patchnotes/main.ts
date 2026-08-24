const IS_COMPONENTS_V2 = 1 << 15;
const MAX_TEXT_LENGTH = 4000;

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')!;
const ROLE_ID = (Deno.env.get('DISCORD_ROLE_ID') ?? '').trim();
const MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';
const ACCENT = parseColor(Deno.env.get('ACCENT_COLOR') ?? '#B41B85');
const BOT_NAME = Deno.env.get('BOT_USERNAME') ?? '';
const AVATAR = Deno.env.get('AVATAR_URL') ?? '';

if (ROLE_ID && !/^\d{17,20}$/.test(ROLE_ID)) throw new Error(`Invalid role id: ${ROLE_ID}`);

const AI_FIELDS: Record<string, { list: boolean; hint: string }> = {
  NEUERUNGEN: {
    list: true,
    hint: 'Die neuen Features. Ein Eintrag pro Feature als kurzer, verständlicher Satz. Gibt es keine, genau ein Eintrag: "Keine Neuerungen in diesem Update."',
  },
  AENDERUNGEN: {
    list: true,
    hint: 'Anpassungen, Balancing und Fehlerbehebungen. Ein Eintrag pro Änderung als kurzer, verständlicher Satz. Gibt es keine, genau ein Eintrag: "Keine Anpassungen in diesem Update."',
  },
};

const SYSTEM_PROMPT = `Du bist der Patchnote-Autor der Zeitvertreib-Community, einem deutschen SCP: Secret Laboratory Gameserver.
Verwandle technische Changelogs in kurzweilige, spielerfreundliche Ankündigungen auf Deutsch.

Regeln:
- Ausschließlich Deutsch, lockere "Du"-Ansprache.
- Fasse aus Sicht der Spieler zusammen; keine CI-, Dependency- oder Technik-Details.
- Erfinde keine Änderungen, die nicht im Changelog stehen.
- Plugin-/Feature-Namen (z. B. "Toolkit", "Flipped") sind Codenamen: beschreibe konkret, was sie bewirken, nenne den Namen nur beiläufig. Behandle Namen nie wörtlich.
- Listenfelder sind JSON-Arrays: ein Eintrag pro Änderung, jeder ein ganzer Satz ohne Markdown, Emojis oder Zeilenumbrüche.
- Textfelder enthalten kein Markdown, keine Emojis, keine Zeilenumbrüche.
- Antworte ausschließlich mit einem strikten JSON-Objekt mit exakt den geforderten Schlüsseln.`;

function parseColor(value: string): number {
  const parsed = Number.parseInt(value.replace(/^#/, ''), 16);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xffffff) throw new Error(`Invalid color: ${value}`);
  return parsed;
}

function readRelease(): { tag_name: string; body?: string; html_url?: string } {
  const path = Deno.env.get('GITHUB_EVENT_PATH');
  if (!path) throw new Error('Missing GITHUB_EVENT_PATH');
  const event = JSON.parse(Deno.readTextFileSync(path)) as {
    action: string;
    release: { tag_name: string; body?: string; html_url?: string };
  };
  if (event.action !== 'published' || !event.release?.tag_name) throw new Error(`Unsupported event: ${event.action}`);
  return event.release;
}

function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]))];
}

async function fillWithAi(keys: string[], version: string, changelog: string): Promise<Record<string, string>> {
  const properties = Object.fromEntries(
    keys.map((key) => [
      key,
      AI_FIELDS[key].list
        ? { type: 'array', items: { type: 'string' }, description: AI_FIELDS[key].hint }
        : { type: 'string', description: AI_FIELDS[key].hint },
    ]),
  );

  const userPrompt = `Version: Build ${version}\n\nChangelog:\n${changelog}\n\nFelder:\n${keys.map((k) => `- ${k}: ${AI_FIELDS[k].hint}`).join('\n')}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'patchnotes',
          strict: true,
          schema: { type: 'object', properties, required: keys, additionalProperties: false },
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI failed: ${response.status} ${await response.text()}`);

  const raw = JSON.parse((await response.json()).choices[0].message.content) as Record<string, string[] | string>;
  const out: Record<string, string> = {};
  for (const key of keys) {
    const field = AI_FIELDS[key];
    const value = raw[key];
    if (field.list) {
      if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.trim())) {
        throw new Error(`OpenAI returned no usable content for ${key}`);
      }
      out[key] = (value as string[]).map((v) => `- ${v.trim()}`).join('\n');
    } else {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`OpenAI returned no usable content for ${key}`);
      out[key] = value.trim();
    }
  }
  return out;
}

type Block =
  | { kind: 'section'; text: string; button: { label: string; url: string } }
  | { kind: 'text'; text: string }
  | { kind: 'separator'; divider: boolean; spacing: number };

function parseLayout(source: string): Block[] {
  const blocks: Block[] = [];
  let mode: 'text' | 'section' = 'text';
  let button: { label: string; url: string } | undefined;
  let lines: string[] = [];
  let inDoc = false;

  const flush = () => {
    const text = lines.join('\n').trim();
    lines = [];
    if (!text) return;
    blocks.push(mode === 'section' && button ? { kind: 'section', text, button } : { kind: 'text', text });
    mode = 'text';
    button = undefined;
  };

  for (const line of source.split('\n')) {
    const t = line.trim();
    if (!inDoc && t === '<!--') {
      inDoc = true;
      continue;
    }
    if (inDoc) {
      if (t.endsWith('-->')) inDoc = false;
      continue;
    }

    const sep = t.match(/^<!--\s*separator:\s*(large|small)\s*-->$/);
    const sec = t.match(/^<!--\s*section\s*\|\s*button:\s*(.+?)\s*->\s*(.+?)\s*-->$/);

    if (t.startsWith('<!--') && t.endsWith('-->')) {
      flush();
      if (sec) {
        mode = 'section';
        button = { label: sec[1].trim(), url: sec[2].trim() };
      } else if (sep) {
        blocks.push({ kind: 'separator', divider: sep[1] === 'large', spacing: sep[1] === 'large' ? 2 : 1 });
      }
      continue;
    }
    lines.push(line);
  }
  flush();

  if (blocks.length === 0) throw new Error('Template produced no content');
  return blocks;
}

function render(template: string, values: Record<string, string>): string {
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => (key in values ? values[key] : `{{${key}}}`));
  const leftover = out.match(/\{\{([A-Z_]+)\}\}/g);
  if (leftover) throw new Error(`Unresolved placeholders: ${leftover.join(', ')}`);
  return out;
}

function buildMessage(blocks: Block[]): Record<string, unknown> {
  if (ROLE_ID) {
    const footer = [...blocks].reverse().find((b) => b.kind === 'text');
    if (footer && footer.kind === 'text') footer.text += ` • <@&${ROLE_ID}>`;
    else blocks.push({ kind: 'text', text: `<@&${ROLE_ID}>` });
  }

  const total = blocks.reduce((sum, b) => sum + (b.kind === 'separator' ? 0 : b.text.length), 0);
  if (total > MAX_TEXT_LENGTH) throw new Error(`Message too long: ${total}/${MAX_TEXT_LENGTH}`);

  const children = blocks.map((b) => {
    if (b.kind === 'separator') return { type: 14, divider: b.divider, spacing: b.spacing };
    if (b.kind === 'section')
      return {
        type: 9,
        components: [{ type: 10, content: b.text }],
        accessory: { type: 2, style: 5, label: b.button.label, url: b.button.url },
      };
    return { type: 10, content: b.text };
  });

  return {
    flags: IS_COMPONENTS_V2,
    components: [{ type: 17, accent_color: ACCENT, spoiler: false, components: children }],
    ...(ROLE_ID ? { allowed_mentions: { parse: [], roles: [ROLE_ID] } } : {}),
    ...(BOT_NAME ? { username: BOT_NAME } : {}),
    ...(AVATAR ? { avatar_url: AVATAR } : {}),
  };
}

async function publish(message: Record<string, unknown>): Promise<void> {
  const url = new URL(WEBHOOK_URL);
  url.searchParams.set('wait', 'true');
  url.searchParams.set('with_components', 'true');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok) throw new Error(`Discord webhook failed: ${response.status} ${await response.text()}`);
  console.log(`Patchnotes published (id: ${(await response.json()).id})`);
}

async function main(): Promise<void> {
  const release = readRelease();
  const version = release.tag_name.replace(/^build-/i, '');
  const changelog = (release.body ?? '').trim();
  if (!changelog) throw new Error(`Release ${release.tag_name} has no notes`);

  const template = await Deno.readTextFile(new URL('./template.md', import.meta.url));
  const codeValues = {
    VERSION: version,
    DATUM: new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date()),
    RELEASE_URL: release.html_url ?? '',
  };

  const aiKeys = placeholders(template).filter((k) => !(k in codeValues));
  const unknown = aiKeys.filter((k) => !(k in AI_FIELDS));
  if (unknown.length > 0) throw new Error(`Unknown placeholders: ${unknown.join(', ')}`);

  const aiValues = aiKeys.length > 0 ? await fillWithAi(aiKeys, version, changelog) : {};
  console.log(`Generated fields: ${Object.keys(aiValues).join(', ')}`);

  await publish(buildMessage(parseLayout(render(template, { ...codeValues, ...aiValues }))));
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
