import { parseEvent, type PullRequestCommentEvent, type PullRequestEvent, commentTag } from './src/events.ts';

// ---------------------------------------------------------------------------
// Config (from action inputs, surfaced as env vars)
// ---------------------------------------------------------------------------

const TOKEN = Deno.env.get('FORGEJO_TOKEN')!;
const API_URL = Deno.env.get('GITHUB_API_URL')!;
const OWNER = Deno.env.get('ORG')!;
const REPO = Deno.env.get('REPO')!;
const CLA_BRANCH = Deno.env.get('CLA_BRANCH')!;
const DOCUMENT_URL =
  Deno.env.get('DOCUMENT_URL') ?? 'https://git.zeitvertreib.vip/zeitvertreib/zeitvertreib/src/branch/main/CLA.md';

const CONTEXT = 'CLA Check';

// Case-insensitive, terminal punctuation / whitespace ignored, mirroring cla.yml
const SIGNATURE_PATTERN =
  /i have read the contributor license agreement and i hereby grant zeitvertreib the rights set out therein with respect to my contributions/i;

const BOT_LOGINS = new Set(['github-actions[bot]', 'dependabot[bot]', 'cursoragent']);

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (resp.status === 204) return undefined as T;
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API ${path} failed: ${resp.status} ${resp.statusText} — ${body}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

interface IssueComment {
  id: number;
  body: string;
  user: { login: string; type?: string };
}

async function listBotComments(prNumber: number): Promise<IssueComment[]> {
  const comments: any[] = await api(`/repos/${OWNER}/${REPO}/issues/${prNumber}/comments`);
  return comments
    .filter((c) => c.user?.type !== 'Bot' && (c.body ?? '').includes(commentTag))
    .map((c) => ({ id: c.id, body: c.body ?? '', user: c.user }));
}

async function upsertBotComment(prNumber: number, body: string): Promise<void> {
  const existing = await listBotComments(prNumber);
  if (existing.length > 0) {
    await api(`/repos/${OWNER}/${REPO}/issues/comments/${existing[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
    return;
  }
  await api(`/repos/${OWNER}/${REPO}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// ---------------------------------------------------------------------------
// Commit status (matches cla.yml `status: check_name`)
// ---------------------------------------------------------------------------

async function setStatus(sha: string, state: 'success' | 'failure', description: string): Promise<void> {
  await api(`/repos/${OWNER}/${REPO}/statuses/${sha}`, {
    method: 'POST',
    body: JSON.stringify({
      state,
      context: CONTEXT,
      description,
      target_url: DOCUMENT_URL,
    }),
  });
}

// ---------------------------------------------------------------------------
// Signatures (one json file per user on the cla-signatures branch)
// ---------------------------------------------------------------------------

interface SignatureEntry {
  cla_version: string;
  signed_at: string;
  document_url: string;
  source_repo: string;
  source_pr_number: number;
  source_comment_id: number;
}

interface UserSignature {
  github_login: string;
  signer_type: string;
  signatures: SignatureEntry[];
}

async function getSignature(login: string): Promise<UserSignature | null> {
  try {
    const file: any = await api(
      `/repos/${OWNER}/${REPO}/contents/signatures/individual/${login.toLowerCase()}.json?ref=${CLA_BRANCH}`,
    );
    if (!file?.content) return null;
    const sig = JSON.parse(atob(file.content)) as UserSignature;
    return sig.signatures?.length ? sig : null;
  } catch {
    return null; // missing or unreadable
  }
}

async function isSigned(login: string): Promise<boolean> {
  if (!login || BOT_LOGINS.has(login)) return true;
  return (await getSignature(login)) !== null;
}

async function recordSignature(login: string, prNumber: number, commentId: number): Promise<void> {
  const existing = await getSignature(login);
  const entry: SignatureEntry = {
    cla_version: 'v1',
    signed_at: new Date().toISOString(),
    document_url: DOCUMENT_URL,
    source_repo: `${OWNER}/${REPO}`,
    source_pr_number: prNumber,
    source_comment_id: commentId,
  };

  const updated: UserSignature = existing ?? {
    github_login: login,
    signer_type: 'individual',
    signatures: [],
  };
  updated.signatures.push(entry);

  const path = `signatures/individual/${login.toLowerCase()}.json`;
  const content = btoa(JSON.stringify(updated, null, 2));

  let sha: string | undefined;
  try {
    const file: any = await api(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${CLA_BRANCH}`);
    sha = file?.sha;
  } catch {
    // new file
  }

  await api(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `chore: record CLA signature for ${login}`,
      content,
      branch: CLA_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

// ---------------------------------------------------------------------------
// PR author collection
// ---------------------------------------------------------------------------

async function collectAuthors(prNumber: number): Promise<string[]> {
  const pr: any = await api(`/repos/${OWNER}/${REPO}/pulls/${prNumber}`);
  const authors = new Set<string>();
  if (pr?.user?.login) authors.add(pr.user.login);
  if (pr?.head?.sha) {
    const commits: any[] = await api(`/repos/${OWNER}/${REPO}/commits?sha=${pr.head.sha}&per_page=100`);
    for (const c of commits) {
      if (c.author?.login) authors.add(c.author.login);
      if (c.committer?.login) authors.add(c.committer.login);
    }
  }
  return [...authors];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handlePullRequest(event: PullRequestEvent): Promise<void> {
  const prNumber = event.pull_request.number;
  const sha = event.pull_request.head.sha;
  const authors = await collectAuthors(prNumber);

  const unsigned = [];
  for (const a of authors) {
    if (!(await isSigned(a))) unsigned.push(a);
  }

  if (unsigned.length === 0) {
    await setStatus(sha, 'success', 'All authors have signed the CLA');
    return;
  }

  const mention = unsigned.map((a) => `@${a}`).join(', ');
  const body =
    `Hi ${mention}! This pull request requires a signed Contributor License Agreement before it can be reviewed.\n\n` +
    `Please reply to this comment with the following exact phrase to sign:\n\n` +
    `> I have read the Contributor License Agreement and I hereby grant Zeitvertreib the rights set out therein with respect to my contributions.\n\n` +
    `${commentTag}`;

  await upsertBotComment(prNumber, body);
  await setStatus(sha, 'failure', 'CLA signature required');
}

async function handleComment(event: PullRequestCommentEvent): Promise<void> {
  const prUrl = event.issue.pull_request?.url;
  if (!prUrl) return; // not a PR comment
  const match = prUrl.match(/\/(\d+)$/);
  if (!match) return;
  const prNumber = parseInt(match[1], 10);

  const commenter = event.comment.user?.login;
  const body = event.comment.body ?? '';
  if (!commenter || !SIGNATURE_PATTERN.test(body)) return;

  const authors = await collectAuthors(prNumber);
  if (!authors.includes(commenter) || (await isSigned(commenter))) return;

  const pr: any = await api(`/repos/${OWNER}/${REPO}/pulls/${prNumber}`);
  const sha = pr?.head?.sha;

  await recordSignature(commenter, prNumber, event.comment.id);
  await upsertBotComment(
    prNumber,
    `Thanks @${commenter}! Your CLA signature has been recorded. This PR is now eligible for review. 🎉\n\n${commentTag}`,
  );
  if (sha) await setStatus(sha, 'success', 'CLA signed');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const eventType = Deno.env.get('GITHUB_EVENT_NAME');
  const eventPath = Deno.env.get('GITHUB_EVENT_PATH');

  if (!eventType || !eventPath) {
    throw new Error('Missing GITHUB_EVENT_NAME / GITHUB_EVENT_PATH');
  }

  const event = JSON.parse(await Deno.readTextFile(eventPath));
  console.log(`Event: ${eventType}`);

  const parsed = parseEvent(event);
  if (!parsed) {
    console.log('No relevant event payload, skipping');
    return;
  }

  if (eventType === 'pull_request_target') {
    await handlePullRequest(parsed as PullRequestEvent);
  } else if (eventType === 'issue_comment') {
    await handleComment(parsed as PullRequestCommentEvent);
  } else {
    console.log(`Event ${eventType} not handled, skipping`);
  }
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
