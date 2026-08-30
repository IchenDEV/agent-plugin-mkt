import { Buffer } from "node:buffer";
import { manifestLocation } from "@/lib/protocols";

// Minimal GitHub REST client on global fetch. Talks to https://api.github.com
// ONLY — every URL is constructed against that base and origin-checked before
// fetching. Auth token (optional) comes from GITHUB_TOKEN and is never logged
// or included in thrown errors.

const BASE_URL = "https://api.github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "agent-plugin-marketplace-indexer";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_5XX_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 120_000;
const MAX_RATE_LIMIT_WAITS = 3;
// Authenticated code search is limited to 10 requests per minute. Throttle all
// search passes globally instead of only pausing between pages so changing sort
// direction or manifest family cannot accidentally burst past that limit.
const CODE_SEARCH_MIN_INTERVAL_MS = 6_500;
// Repository search has a separate 30 requests/minute authenticated limit.
const REPOSITORY_SEARCH_MIN_INTERVAL_MS = 2_100;
const SEARCH_RESULT_CAP = 1_000;
let nextCodeSearchAt = 0;
let nextRepositorySearchAt = 0;

export const DEFAULT_SEARCH_QUERIES = [
  "filename:plugin.json path:.codex-plugin",
  "filename:plugin.json path:.claude-plugin",
  'filename:plugin.json "agent-plugins.org/schemas"',
] as const;

/**
 * Protocol signals used to discover candidate repositories through repository
 * metadata, topics, and README text. GitHub's REST Code Search uses a legacy
 * index which can omit an entire active repository; repository search followed
 * by canonical Git-tree filtering provides a vendor-neutral compatibility path.
 */
export const DEFAULT_REPOSITORY_SEARCH_QUERIES = [
  '"claude code" plugins in:name,description,readme',
  '".claude-plugin/plugin.json" in:readme',
  '"claude plugin marketplace add" in:readme',
  '".codex-plugin/plugin.json" in:readme',
  '"agent-plugins.org" in:readme',
  "topic:claude-code-plugin",
  "topic:claude-code-plugins",
  "topic:codex-plugin",
  "topic:agent-plugins",
] as const;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/** Thrown when a rate-limit wait would exceed the 120s cap; abort the run. */
export class RateLimitAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitAbortError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": USER_AGENT,
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Core request. Retries 408/5xx/network errors up to 3x with backoff; on primary
 * or secondary rate limits waits until reset (capped at 120s, else throws
 * RateLimitAbortError). Throws GitHubApiError on other failures. Error
 * messages contain only the path and status — never headers or the token.
 */
async function githubJson<T>(
  path: string,
  searchParams?: Record<string, string>
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (url.origin !== BASE_URL) {
    throw new GitHubApiError(`refusing to fetch non-GitHub origin for ${path}`);
  }
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  let serverFailures = 0;
  let rateLimitWaits = 0;

  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      serverFailures++;
      if (serverFailures > MAX_5XX_RETRIES) {
        const detail = err instanceof Error ? err.message : "network error";
        throw new GitHubApiError(
          `GitHub request ${url.pathname} failed after ${MAX_5XX_RETRIES} retries: ${detail}`
        );
      }
      await sleep(1_000 * 2 ** (serverFailures - 1));
      continue;
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    // Rate limits: primary (x-ratelimit-remaining: 0) or secondary (retry-after).
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const retryAfter = res.headers.get("retry-after");
      let waitMs: number | null = null;
      if (remaining === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        if (Number.isFinite(reset)) {
          waitMs = Math.max(0, reset * 1_000 - Date.now()) + 1_000;
        }
      } else if (retryAfter !== null) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) waitMs = seconds * 1_000 + 1_000;
      }
      if (waitMs !== null) {
        if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
          throw new RateLimitAbortError(
            `GitHub rate limit hit; it resets in ~${Math.ceil(waitMs / 1_000)}s, ` +
              `beyond the 120s wait cap. Aborting this run — re-run later, or set ` +
              `GITHUB_TOKEN for a higher limit.`
          );
        }
        rateLimitWaits++;
        if (rateLimitWaits > MAX_RATE_LIMIT_WAITS) {
          throw new RateLimitAbortError(
            "GitHub rate limit hit repeatedly on the same request; aborting this run."
          );
        }
        console.warn(
          `rate limited by GitHub; waiting ${Math.ceil(waitMs / 1_000)}s before retrying`
        );
        await sleep(waitMs);
        continue;
      }
    }

    if (res.status === 408 || res.status >= 500) {
      serverFailures++;
      if (serverFailures > MAX_5XX_RETRIES) {
        throw new GitHubApiError(
          `GitHub request ${url.pathname} failed after ${MAX_5XX_RETRIES} retries (last status ${res.status})`,
          res.status
        );
      }
      await sleep(1_000 * 2 ** (serverFailures - 1));
      continue;
    }

    throw new GitHubApiError(
      `GitHub API ${url.pathname} responded ${res.status}`,
      res.status
    );
  }
}

/** Like githubJson but resolves to null on 404 (missing files/dirs are expected). */
async function githubOptional<T>(
  path: string,
  searchParams?: Record<string, string>
): Promise<T | null> {
  try {
    return await githubJson<T>(path, searchParams);
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null;
    throw err;
  }
}

function encodeRepoFullName(fullName: string): string {
  const parts = fullName.split("/");
  if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
    throw new GitHubApiError(`invalid repository full name: ${fullName}`);
  }
  return parts.map(encodeURIComponent).join("/");
}

function encodeFilePath(filePath: string): string {
  return filePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

// ---------------------------------------------------------------------------
// Code search
// ---------------------------------------------------------------------------

export interface CodeSearchItem {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: {
    full_name: string;
    html_url: string;
    fork?: boolean;
  };
}

interface CodeSearchPage {
  total_count: number;
  incomplete_results: boolean;
  items: CodeSearchItem[];
}

/**
 * Paginated code search. Yields one page of items at a time, pausing ~2s
 * between page fetches to stay under GitHub's secondary rate limits.
 */
export async function* searchCode(
  query: string,
  opts: {
    perPage?: number;
    maxPages?: number;
    startPage?: number;
    sort?: "indexed";
    order?: "asc" | "desc";
  } = {}
): AsyncGenerator<CodeSearchItem[], void, void> {
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 50));
  const availablePages = Math.ceil(SEARCH_RESULT_CAP / perPage);
  const startPage = Math.min(availablePages, Math.max(1, opts.startPage ?? 1));
  const maxPages = Math.min(
    availablePages - startPage + 1,
    Math.max(1, opts.maxPages ?? availablePages),
  );
  const endPage = startPage + maxPages - 1;

  for (let page = startPage; page <= endPage; page++) {
    const waitMs = Math.max(0, nextCodeSearchAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextCodeSearchAt = Date.now() + CODE_SEARCH_MIN_INTERVAL_MS;
    let result: CodeSearchPage;
    try {
      const searchParams: Record<string, string> = {
        q: query,
        per_page: String(perPage),
        page: String(page),
      };
      if (opts.sort) searchParams.sort = opts.sort;
      if (opts.order) searchParams.order = opts.order;
      result = await githubJson<CodeSearchPage>("/search/code", searchParams);
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 401) {
        throw new GitHubApiError(
          "GitHub code search requires authentication — set GITHUB_TOKEN and re-run (401)",
          401
        );
      }
      throw err;
    }
    if (!Array.isArray(result.items)) return;
    yield result.items;
    if (
      result.items.length === 0 ||
      page * perPage >= Math.min(result.total_count, SEARCH_RESULT_CAP)
    ) {
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Repo metadata
// ---------------------------------------------------------------------------

export interface RepoMetadata {
  fullName: string;
  htmlUrl: string;
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: Date | null;
  /** SPDX id when available, else the license display name, else null. */
  license: string | null;
  defaultBranch: string;
}

interface RepoResponse {
  full_name: string;
  html_url: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  pushed_at?: string | null;
  license?: { spdx_id?: string | null; name?: string | null } | null;
  default_branch?: string;
}

function repoMetadata(repo: RepoResponse): RepoMetadata {
  let pushedAt: Date | null = null;
  if (repo.pushed_at) {
    const parsed = new Date(repo.pushed_at);
    if (!Number.isNaN(parsed.getTime())) pushedAt = parsed;
  }
  const spdx = repo.license?.spdx_id;
  const license =
    spdx && spdx !== "NOASSERTION" ? spdx : (repo.license?.name ?? null);
  return {
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    pushedAt,
    license,
    defaultBranch: repo.default_branch ?? "main",
  };
}

interface RepositorySearchPage {
  total_count: number;
  incomplete_results: boolean;
  items: RepoResponse[];
}

/**
 * Paginated repository search. Candidate repositories still need Git-tree
 * validation; README/topic matches alone never become marketplace entries.
 * `sort`/`order` map to the GitHub search parameters; omitting them keeps the
 * default best-match ranking. Sorting by "updated" surfaces recently pushed
 * repositories that best-match ranking buries under older, high-star repos.
 */
export async function* searchRepositories(
  query: string,
  opts: {
    perPage?: number;
    maxPages?: number;
    startPage?: number;
    sort?: "stars" | "forks" | "updated";
    order?: "asc" | "desc";
  } = {},
): AsyncGenerator<RepoMetadata[], void, void> {
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 50));
  const availablePages = Math.ceil(SEARCH_RESULT_CAP / perPage);
  const startPage = Math.min(availablePages, Math.max(1, opts.startPage ?? 1));
  const maxPages = Math.min(
    availablePages - startPage + 1,
    Math.max(1, opts.maxPages ?? availablePages),
  );
  const endPage = startPage + maxPages - 1;

  for (let page = startPage; page <= endPage; page++) {
    const waitMs = Math.max(0, nextRepositorySearchAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextRepositorySearchAt = Date.now() + REPOSITORY_SEARCH_MIN_INTERVAL_MS;
    const searchParams: Record<string, string> = {
      q: query,
      per_page: String(perPage),
      page: String(page),
    };
    if (opts.sort) searchParams.sort = opts.sort;
    if (opts.order) searchParams.order = opts.order;
    const result = await githubJson<RepositorySearchPage>(
      "/search/repositories",
      searchParams,
    );
    if (!Array.isArray(result.items)) return;
    yield result.items.map(repoMetadata);
    if (
      result.items.length === 0 ||
      page * perPage >= Math.min(result.total_count, SEARCH_RESULT_CAP)
    ) {
      return;
    }
  }
}

/** Fetch repo metadata; null when the repo is gone (404). */
export async function getRepo(fullName: string): Promise<RepoMetadata | null> {
  const repo = await githubOptional<RepoResponse>(
    `/repos/${encodeRepoFullName(fullName)}`
  );
  if (!repo) return null;
  return repoMetadata(repo);
}

// ---------------------------------------------------------------------------
// Contents API
// ---------------------------------------------------------------------------

interface ContentResponse {
  type?: string;
  name?: string;
  path?: string;
  size?: number;
  content?: string;
  encoding?: string;
}

export interface RepoFile {
  path: string;
  size: number;
  text: string;
}

export interface GitTreeEntry {
  path?: string;
  type?: string;
  sha?: string;
}

export interface RepositoryManifestFile {
  name: "plugin.json";
  path: string;
  sha: string;
}

interface GitTreeResponse {
  tree?: GitTreeEntry[];
  truncated?: boolean;
}

/** Select canonical plugin manifests from a recursive Git tree response. */
export function manifestFilesFromTree(
  entries: readonly GitTreeEntry[],
): RepositoryManifestFile[] {
  return entries
    .filter(
      (entry): entry is Required<Pick<GitTreeEntry, "path" | "type" | "sha">> =>
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        typeof entry.sha === "string" &&
        manifestLocation(entry.path) !== null,
    )
    .map((entry) => ({ name: "plugin.json" as const, path: entry.path, sha: entry.sha }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Enumerate canonical manifests from a repository without Code Search.
 * `truncated` is surfaced so callers never mistake an incomplete Git tree for
 * complete repository coverage.
 */
export async function listRepositoryManifestFiles(
  repoFullName: string,
  ref: string,
): Promise<{ files: RepositoryManifestFile[]; truncated: boolean }> {
  const tree = await githubJson<GitTreeResponse>(
    `/repos/${encodeRepoFullName(repoFullName)}/git/trees/${encodeURIComponent(ref)}`,
    { recursive: "1" },
  );
  return {
    files: manifestFilesFromTree(Array.isArray(tree.tree) ? tree.tree : []),
    truncated: tree.truncated === true,
  };
}

/**
 * Fetch a file's decoded text via the contents API. Returns null when the
 * path is missing, is not a file, or the API cannot inline the content
 * (files over ~1MB).
 */
export async function getFileContent(
  repoFullName: string,
  filePath: string,
  ref?: string
): Promise<RepoFile | null> {
  const encoded = encodeFilePath(filePath);
  const res = await githubOptional<ContentResponse | ContentResponse[]>(
    `/repos/${encodeRepoFullName(repoFullName)}/contents/${encoded}`,
    ref ? { ref } : undefined
  );
  if (!res || Array.isArray(res) || res.type !== "file") return null;
  let text: string;
  if (res.encoding === "base64" && typeof res.content === "string") {
    text = Buffer.from(res.content, "base64").toString("utf8");
  } else if (typeof res.content === "string" && res.encoding !== "none") {
    text = res.content;
  } else {
    return null;
  }
  return {
    path: res.path ?? filePath,
    size: typeof res.size === "number" ? res.size : text.length,
    text,
  };
}

export interface RepoDirEntry {
  name: string;
  path: string;
  type: string; // "file" | "dir" | "symlink" | "submodule"
  size: number;
}

/**
 * List a directory via the contents API. Returns null when the path is
 * missing or is not a directory.
 */
export async function listDirectory(
  repoFullName: string,
  dirPath: string,
  ref?: string
): Promise<RepoDirEntry[] | null> {
  const encoded = encodeFilePath(dirPath);
  const suffix = encoded ? `/${encoded}` : "";
  const res = await githubOptional<ContentResponse | ContentResponse[]>(
    `/repos/${encodeRepoFullName(repoFullName)}/contents${suffix}`,
    ref ? { ref } : undefined
  );
  if (!res || !Array.isArray(res)) return null;
  return res
    .filter((entry) => typeof entry.name === "string")
    .map((entry) => ({
      name: entry.name as string,
      path: entry.path ?? "",
      type: entry.type ?? "file",
      size: typeof entry.size === "number" ? entry.size : 0,
    }));
}
