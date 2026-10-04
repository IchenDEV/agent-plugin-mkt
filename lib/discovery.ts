import type { RepoMetadata } from "@/lib/github";

export interface SearchWindow {
  /** Inclusive Unix seconds; adjacent windows never overlap. */
  from: number;
  to: number;
}

export interface RepositoryTraversal {
  /** The first window is active; the rest survive pagination and run budgets. */
  windows: SearchWindow[];
}

export function newRepositoryTraversal(now = Date.now()): RepositoryTraversal {
  return { windows: [{ from: 0, to: Math.floor(now / 1000) }] };
}

export function repositoryWindowQuery(query: string, window: SearchWindow): string {
  const timestamp = (seconds: number) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
  return `${query} created:${timestamp(window.from)}..${timestamp(window.to)}`;
}

/** Oldest first: a busy recent window cannot indefinitely starve older sources. */
export function splitSearchWindow(window: SearchWindow): SearchWindow[] | null {
  if (window.from >= window.to) return null;
  const middle = Math.floor((window.from + window.to) / 2);
  return [{ from: window.from, to: middle }, { from: middle + 1, to: window.to }];
}

export interface EmptyRepository {
  pushedAt: string;
  defaultBranch: string;
  checkedAt: string;
}

export const EMPTY_REPOSITORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cache only a complete, empty tree inspection, never HTTP/validation errors. */
export function canSkipEmptyRepository(repo: RepoMetadata, empty: EmptyRepository | undefined, now = Date.now()): boolean {
  if (!empty || !repo.pushedAt) return false;
  const age = now - Date.parse(empty.checkedAt);
  return age >= 0 && age < EMPTY_REPOSITORY_TTL_MS &&
    empty.pushedAt === repo.pushedAt.toISOString() && empty.defaultBranch === repo.defaultBranch;
}
