import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { CodeSearchItem, RepoMetadata } from "@/lib/github";
import { emptyRequestMetrics, type RequestMetrics } from "@/lib/github-request-policy";

export type StoredRepo = Omit<RepoMetadata, "pushedAt"> & { pushedAt: string | null };
export const storeRepo = (repo: RepoMetadata): StoredRepo => ({ ...repo, pushedAt: repo.pushedAt?.toISOString() ?? null });
export const restoreRepo = (repo: StoredRepo): RepoMetadata => ({ ...repo, pushedAt: repo.pushedAt ? new Date(repo.pushedAt) : null });
export interface IndexTask {
  id: string;
  kind: "repository-search" | "code-search" | "owner" | "direct";
  query: string;
  page: number;
  endPage: number;
  perPage: number;
  remaining: number;
  sort?: "indexed" | "updated";
  order?: "asc" | "desc";
  repos: StoredRepo[];
  hits: CodeSearchItem[];
  exhausted: boolean;
  done: boolean;
  lastError?: string;
}
export interface IndexCheckpoint {
  schemaVersion: 1;
  cycleId: string;
  configHash: string;
  status: "running" | "partial" | "completed";
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  reason: string | null;
  /** Completion describes only this configured bounded cycle, not all GitHub. */
  coverage: "configured-cycle";
  cursor: number;
  tasks: IndexTask[];
  seenRoots: string[];
  seenRepositories: string[];
  requestMetrics: RequestMetrics;
}
const count = z.number().int().nonnegative();
const storedRepo = z.object({ fullName: z.string(), htmlUrl: z.string(), stars: count, forks: count, openIssues: count, pushedAt: z.string().datetime().nullable(), license: z.string().nullable(), defaultBranch: z.string() });
const hit = z.object({ name: z.string(), path: z.string(), sha: z.string(), html_url: z.string(), repository: z.object({ full_name: z.string(), html_url: z.string(), fork: z.boolean().optional() }) });
const task = z.object({ id: z.string(), kind: z.enum(["repository-search", "code-search", "owner", "direct"]), query: z.string(), page: count, endPage: count, perPage: z.number().int().min(1).max(100), remaining: count, sort: z.enum(["indexed", "updated"]).optional(), order: z.enum(["asc", "desc"]).optional(), repos: z.array(storedRepo), hits: z.array(hit), exhausted: z.boolean(), done: z.boolean(), lastError: z.string().optional() });
const checkpoint = z.object({ schemaVersion: z.literal(1), cycleId: z.string(), configHash: z.string(), status: z.enum(["running", "partial", "completed"]), startedAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(), reason: z.string().nullable(), coverage: z.literal("configured-cycle"), cursor: count, tasks: z.array(task), seenRoots: z.array(z.string()), seenRepositories: z.array(z.string()), requestMetrics: z.object({ requests: count, byResource: z.object({ core: count, search: count, code_search: count }), rateLimitResponses: count, waitedMs: z.number().nonnegative(), buckets: z.record(z.string(), z.object({ remaining: count, resetAt: z.number().nullable() })) }) });
export function configHash(config: unknown): string { return createHash("sha256").update(JSON.stringify(config)).digest("hex"); }
export function loadCheckpoint(path: string, hash: string, tasks: IndexTask[]): IndexCheckpoint {
  if (existsSync(path)) {
    const parsed = checkpoint.parse(JSON.parse(readFileSync(path, "utf8"))) as IndexCheckpoint;
    if (parsed.status !== "completed") {
      if (parsed.configHash !== hash) throw new Error("Unfinished index checkpoint uses different discovery options. Resume with the original options, or explicitly use a different INDEX_STATE_PATH.");
      return parsed;
    }
  }
  const now = new Date().toISOString();
  return { schemaVersion: 1, cycleId: randomUUID(), configHash: hash, status: "running", startedAt: now, updatedAt: now, completedAt: null, reason: null, coverage: "configured-cycle", cursor: 0, tasks, seenRoots: [], seenRepositories: [], requestMetrics: emptyRequestMetrics() };
}
/** Atomic replace: an interrupted write leaves the previous valid checkpoint. */
export function saveCheckpoint(path: string, state: IndexCheckpoint): void {
  state.updatedAt = new Date().toISOString();
  const directory = dirname(resolve(path));
  mkdirSync(directory, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, "w", 0o600);
  try { writeFileSync(fd, JSON.stringify(state) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const dir = openSync(directory, "r");
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
/** Advance before executing: after an interruption, the next family goes first. */
export function nextTask(state: IndexCheckpoint, blocked: ReadonlySet<string>): IndexTask | undefined {
  for (let scanned = 0; scanned < state.tasks.length; scanned++) {
    const index = state.cursor % state.tasks.length;
    state.cursor = (index + 1) % state.tasks.length;
    const candidate = state.tasks[index];
    if (!candidate.done && !blocked.has(candidate.id)) return candidate;
  }
  return undefined;
}
