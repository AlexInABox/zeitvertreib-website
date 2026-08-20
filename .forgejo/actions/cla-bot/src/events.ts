// ---------------------------------------------------------------------------
// GitHub/Forgejo web event type definitions (minimal, for parsing)
// ---------------------------------------------------------------------------

export interface User {
  login: string;
  type: string; // "User" | "Bot" | etc.
}

export interface PullRequest {
  number: number;
  head: { sha: string; ref: string; user: User };
  base: { ref: string };
  user: User | null;
  pull_request?: { url: string }; // issue_comment events wrap the PR
  title: string;
}

export interface Issue {
  number: number;
  pull_request?: { url: string };
  user: User | null;
}

export interface Comment {
  id: number;
  body: string | null;
  user: User | null;
}

export interface PullRequestEvent {
  action: string;
  pull_request: PullRequest;
  repository: { full_name: string };
  sender: User;
}

export interface PullRequestCommentEvent {
  action: string;
  issue: Issue;
  comment: Comment;
  repository: { full_name: string };
  sender: User;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseEvent(event: Record<string, unknown>): PullRequestEvent | PullRequestCommentEvent | null {
  if ('pull_request' in event && 'action' in event) {
    const e = event as Record<string, unknown>;
    return {
      action: (e.action as string) ?? '',
      pull_request: e.pull_request as PullRequest,
      repository: e.repository as { full_name: string },
      sender: e.sender as User,
    } satisfies PullRequestEvent;
  }

  if ('issue' in event && 'comment' in event && (event.issue as Record<string, unknown>)?.pull_request) {
    const e = event as Record<string, unknown>;
    return {
      action: (e.action as string) ?? '',
      issue: e.issue as Issue,
      comment: e.comment as Comment,
      repository: e.repository as { full_name: string },
      sender: e.sender as User,
    } satisfies PullRequestCommentEvent;
  }

  return null;
}

export const commentTag = '<!-- cla-bot -->';
