// GitHub indexer CLI. Searches canonical Codex, Claude Code, and Agent Plugins
// manifest locations, merges manifests that share one plugin root, discovers
// common skills/MCP components, and upserts one logical registry entry.

import { prisma } from "@/lib/db";
import {
  DEFAULT_OWNER_FANOUT_MAX_REPOS,
  DEFAULT_REPOSITORY_SEARCH_QUERIES,
  DEFAULT_SEARCH_QUERIES,
  GitHubApiError,
  configureGitHubRequests,
  githubRequestMetrics,
  assertGitHubBudget,
  RateLimitAbortError,
  allocateSearchBudget,
  getFileContent,
  getRepo,
  listDirectory,
  listOwnerPublicRepositories,
  listRepositoryManifestFiles,
  ownerFromFullName,
  searchCode,
  searchRepositories,
  type CodeSearchItem,
  type RepoMetadata,
} from "@/lib/github";
import { parseFrontmatter } from "@/lib/frontmatter";
import { stripControlChars } from "@/lib/format";
import {
  PLUGIN_PROTOCOLS,
  defaultMcpPathForRoot,
  manifestLocation,
  manifestPathForRoot,
  type PluginProtocol,
} from "@/lib/protocols";
import {
  parseMcpConfig,
  parsePluginManifest,
  type NormalizedPluginManifest,
} from "@/lib/validation";
import {
  isSafePathSegment,
  skillFromFrontmatter,
  upsertPlugin,
  type McpServerInput,
  type SkillInput,
} from "@/lib/indexing";
import {
  CODEX_UPSTREAM_MARKETPLACE_PATH,
  findUpstreamMarketplace,
  type UpstreamMarketplace,
} from "@/lib/marketplaces";

import { configHash, loadCheckpoint, nextTask, restoreRepo, saveCheckpoint, storeRepo, type IndexTask } from "@/lib/index-checkpoint";

const MAX_MANIFEST_BYTES = 200 * 1024;
const MAX_COMPONENT_FILE_BYTES = 200 * 1024;
const MAX_MARKETPLACE_BYTES = 1024 * 1024;
const MAX_SKILLS_PER_PLUGIN = 50;
const MAX_MCP_SERVERS_PER_PLUGIN = 50;
const DEFAULT_MAX_PLUGINS = 40;
const DEFAULT_MAX_REPOSITORIES = 40;
const SEARCH_ORDERS = ["desc", "asc"] as const;
// Repository search runs a recently-updated pass before a best-match pass.
// Best-match ranks by relevance, which buries new, low-star repositories under
// established ones; the updated window surfaces them while they are still
// active and is weighted higher because best-match results are dominated by
// already-indexed repositories that only need a metadata refresh.
const REPOSITORY_SEARCH_PASSES = [
  { label: "recently-updated window", sort: "updated", order: "desc", weight: 2 },
  { label: "best-match window", sort: undefined, order: undefined, weight: 1 },
] as const;
const MAX_RESULTS_PER_SEARCH = 1_000;

function safeLog(value: string): string {
  return stripControlChars(value);
}

interface CliOptions {
  max: number;
  requestBudget: number;
  timeBudgetSeconds: number;
  queries: string[];
  repositoryMax: number;
  repositoryQueries: string[];
  searchPage?: number;
  searchPageSize?: number;
  allowPartial: boolean;
  skipCodeSearch: boolean;
  skipRepositorySearch: boolean;
  skipOwnerFanout: boolean;
  ownerFanoutMax: number;
  directRepositories: string[];
  directOwners: string[];
}

function parseArgs(argv: string[]): CliOptions {
  let max = DEFAULT_MAX_PLUGINS;
  let requestBudget = 3500;
  let timeBudgetSeconds = 2400;
  let repositoryMax = DEFAULT_MAX_REPOSITORIES;
  let customQuery: string | undefined;
  let customRepositoryQuery: string | undefined;
  let searchPage: number | undefined;
  let searchPageSize: number | undefined;
  let allowPartial = false;
  let skipCodeSearch = false;
  let skipRepositorySearch = false;
  let skipOwnerFanout = false;
  let ownerFanoutMax = DEFAULT_OWNER_FANOUT_MAX_REPOS;
  const directRepositories: string[] = [];
  const directOwners: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--request-budget" || arg.startsWith("--request-budget=")) {
      const value = Number(arg.includes("=") ? arg.split("=")[1] : argv[++i]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error("--request-budget must be a positive integer");
      requestBudget = value;
    } else if (arg === "--time-budget-seconds" || arg.startsWith("--time-budget-seconds=")) {
      const value = Number(arg.includes("=") ? arg.split("=")[1] : argv[++i]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error("--time-budget-seconds must be a positive integer");
      timeBudgetSeconds = value;
    } else if (arg === "--max") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) max = Math.floor(value);
    } else if (arg.startsWith("--max=")) {
      const value = Number(arg.slice("--max=".length));
      if (Number.isFinite(value) && value > 0) max = Math.floor(value);
    } else if (arg === "--repository-max") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) repositoryMax = Math.floor(value);
    } else if (arg.startsWith("--repository-max=")) {
      const value = Number(arg.slice("--repository-max=".length));
      if (Number.isFinite(value) && value > 0) repositoryMax = Math.floor(value);
    } else if (arg === "--query") {
      const value = argv[++i];
      if (value) customQuery = value;
    } else if (arg.startsWith("--query=")) {
      const value = arg.slice("--query=".length);
      if (value) customQuery = value;
    } else if (arg === "--repository-query") {
      const value = argv[++i];
      if (value) customRepositoryQuery = value;
    } else if (arg.startsWith("--repository-query=")) {
      const value = arg.slice("--repository-query=".length);
      if (value) customRepositoryQuery = value;
    } else if (arg === "--search-page") {
      const value = Number(argv[++i]);
      if (Number.isInteger(value) && value > 0) searchPage = value;
    } else if (arg.startsWith("--search-page=")) {
      const value = Number(arg.slice("--search-page=".length));
      if (Number.isInteger(value) && value > 0) searchPage = value;
    } else if (arg === "--search-page-size") {
      const value = Number(argv[++i]);
      if (Number.isInteger(value) && value > 0 && value <= 100) searchPageSize = value;
    } else if (arg.startsWith("--search-page-size=")) {
      const value = Number(arg.slice("--search-page-size=".length));
      if (Number.isInteger(value) && value > 0 && value <= 100) searchPageSize = value;
    } else if (arg === "--allow-partial") {
      allowPartial = true;
    } else if (arg === "--skip-code-search" || arg === "--priority-only") {
      // --priority-only is retained as a compatibility alias for one release.
      skipCodeSearch = true;
    } else if (arg === "--skip-repository-search" || arg === "--skip-priority") {
      // --skip-priority is retained as a compatibility alias for one release.
      skipRepositorySearch = true;
    } else if (arg === "--skip-owner-fanout") {
      skipOwnerFanout = true;
    } else if (arg === "--owner-fanout-max") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) ownerFanoutMax = Math.floor(value);
    } else if (arg.startsWith("--owner-fanout-max=")) {
      const value = Number(arg.slice("--owner-fanout-max=".length));
      if (Number.isFinite(value) && value > 0) ownerFanoutMax = Math.floor(value);
    } else if (arg === "--repo") {
      const value = argv[++i];
      if (value && /^[^/\s]+\/[^/\s]+$/.test(value)) {
        directRepositories.push(value);
      }
    } else if (arg.startsWith("--repo=")) {
      const value = arg.slice("--repo=".length);
      if (/^[^/\s]+\/[^/\s]+$/.test(value)) directRepositories.push(value);
    } else if (arg === "--owner") {
      const value = argv[++i];
      if (value && /^[^/\s]+$/.test(value)) directOwners.push(value);
    } else if (arg.startsWith("--owner=")) {
      const value = arg.slice("--owner=".length);
      if (/^[^/\s]+$/.test(value)) directOwners.push(value);
    } else {
      console.warn(`ignoring unknown argument: ${arg}`);
    }
  }
  return {
    max,
    requestBudget,
    timeBudgetSeconds,
    queries: customQuery ? [customQuery] : [...DEFAULT_SEARCH_QUERIES],
    repositoryMax,
    repositoryQueries: customRepositoryQuery
      ? [customRepositoryQuery]
      : [...DEFAULT_REPOSITORY_SEARCH_QUERIES],
    searchPage,
    searchPageSize,
    allowPartial,
    skipCodeSearch,
    skipRepositorySearch,
    skipOwnerFanout,
    ownerFanoutMax,
    directRepositories: [...new Set(directRepositories)],
    directOwners: [...new Set(directOwners)],
  };
}

type HitOutcome =
  | { ok: true; name: string; status: "indexed" | "metadata" | "unchanged" }
  | { ok: false; reason: string };

interface LoadedManifest {
  protocol: PluginProtocol;
  path: string;
  rawText: string;
  raw: Record<string, unknown>;
  manifest: NormalizedPluginManifest;
}

const repoCache = new Map<string, RepoMetadata | null>();
const marketplaceFileCache = new Map<string, Promise<unknown | null>>();

function storedProtocols(value: string): PluginProtocol[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? PLUGIN_PROTOCOLS.filter((protocol) => parsed.includes(protocol))
      : [];
  } catch {
    return [];
  }
}

function storedCodexName(
  value: string,
  fallbackName: string,
): string {
  try {
    const manifests = JSON.parse(value);
    if (typeof manifests !== "object" || manifests === null || Array.isArray(manifests)) {
      return fallbackName;
    }
    const entry = (manifests as Record<string, unknown>).codex;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return fallbackName;
    }
    const raw = (entry as Record<string, unknown>).raw;
    if (typeof raw !== "string") return fallbackName;
    const manifest = JSON.parse(raw);
    return typeof manifest?.name === "string" ? manifest.name : fallbackName;
  } catch {
    return fallbackName;
  }
}

async function loadCodexMarketplaceFile(
  repoFullName: string,
  ref: string,
): Promise<unknown | null> {
  const key = `${repoFullName}@${ref}`;
  let pending = marketplaceFileCache.get(key);
  if (!pending) {
    pending = (async () => {
      const file = await getFileContent(
        repoFullName,
        CODEX_UPSTREAM_MARKETPLACE_PATH,
        ref,
      );
      if (!file || file.size > MAX_MARKETPLACE_BYTES) return null;
      try {
        return JSON.parse(file.text);
      } catch {
        return null;
      }
    })();
    marketplaceFileCache.set(key, pending);
  }
  return pending;
}

async function discoverUpstreamMarketplaces(
  repoFullName: string,
  pluginPath: string,
  ref: string,
  pluginName: string,
  protocols: PluginProtocol[],
): Promise<{ codex?: UpstreamMarketplace }> {
  if (!protocols.includes("codex")) return {};
  const value = await loadCodexMarketplaceFile(repoFullName, ref);
  const marketplace = findUpstreamMarketplace(
    value,
    repoFullName,
    pluginPath,
    pluginName,
  );
  return marketplace ? { codex: marketplace } : {};
}

function pluginPrefix(pluginPath: string): string {
  return pluginPath ? `${pluginPath}/` : "";
}

function componentPaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function resolveComponentPath(pluginPath: string, value: string): string | null {
  if (!value.startsWith("./")) return null;
  const relative = value.slice(2).replace(/\/+$/g, "");
  if (!relative || relative.split("/").some((segment) => !isSafePathSegment(segment))) {
    return null;
  }
  return `${pluginPrefix(pluginPath)}${relative}`;
}

async function loadManifests(
  repoFullName: string,
  pluginPath: string,
  ref: string,
): Promise<LoadedManifest[]> {
  const loaded: LoadedManifest[] = [];
  for (const protocol of PLUGIN_PROTOCOLS) {
    const path = manifestPathForRoot(pluginPath, protocol);
    const file = await getFileContent(repoFullName, path, ref);
    if (!file) continue;
    if (file.size > MAX_MANIFEST_BYTES) {
      console.log(
        `  skipped ${path}: too large (${file.size} bytes > ${MAX_MANIFEST_BYTES})`,
      );
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(file.text);
    } catch {
      console.log(`  skipped ${path}: not valid JSON`);
      continue;
    }
    const parsed = parsePluginManifest(raw, protocol);
    if (!parsed.ok) {
      console.log(`  skipped ${path}: ${safeLog(parsed.reason)}`);
      continue;
    }
    for (const warning of parsed.warnings) console.log(`  ${safeLog(warning)}`);
    loaded.push({
      protocol,
      path,
      rawText: file.text,
      raw: parsed.raw,
      manifest: parsed.manifest,
    });
  }
  return loaded;
}

async function discoverSkills(
  repoFullName: string,
  pluginPath: string,
  ref: string,
  protocols: PluginProtocol[],
): Promise<SkillInput[]> {
  const prefix = pluginPrefix(pluginPath);
  const skills: SkillInput[] = [];
  const allowDerivedName = protocols.includes("claude-code");
  const skillsDir = await listDirectory(repoFullName, `${prefix}skills`, ref);
  if (skillsDir) {
    for (const entry of skillsDir) {
      if (entry.type !== "dir") continue;
      if (skills.length >= MAX_SKILLS_PER_PLUGIN) {
        console.log(
          `  skipping remaining skill directories: per-plugin cap of ${MAX_SKILLS_PER_PLUGIN} reached`,
        );
        break;
      }
      if (!isSafePathSegment(entry.name)) {
        console.log(`  skipped skill ${JSON.stringify(entry.name)}: unsafe directory name`);
        continue;
      }
      const relativePath = `skills/${entry.name}/SKILL.md`;
      const skillFile = await getFileContent(repoFullName, `${prefix}${relativePath}`, ref);
      if (!skillFile) {
        console.log(`  skipped skill ${JSON.stringify(entry.name)}: no SKILL.md`);
        continue;
      }
      if (skillFile.size > MAX_COMPONENT_FILE_BYTES) {
        console.log(`  skipped skill ${JSON.stringify(entry.name)}: SKILL.md too large`);
        continue;
      }
      const frontmatter = parseFrontmatter(skillFile.text);
      const skill = frontmatter
        ? skillFromFrontmatter(entry.name, frontmatter.data, {
            allowDerivedName,
            path: relativePath,
          })
        : null;
      if (!skill) {
        console.log(`  skipped skill ${JSON.stringify(entry.name)}: invalid frontmatter`);
        continue;
      }
      skills.push(skill);
    }
  }

  // Claude Code also supports a single SKILL.md directly at the plugin root.
  if (protocols.includes("claude-code") && skills.length < MAX_SKILLS_PER_PLUGIN) {
    const rootSkill = await getFileContent(repoFullName, `${prefix}SKILL.md`, ref);
    if (rootSkill && rootSkill.size <= MAX_COMPONENT_FILE_BYTES) {
      const frontmatter = parseFrontmatter(rootSkill.text);
      const declaredName = frontmatter?.data.name;
      if (frontmatter && typeof declaredName === "string" && isSafePathSegment(declaredName)) {
        const skill = skillFromFrontmatter(declaredName, frontmatter.data, { path: "SKILL.md" });
        if (skill) skills.push(skill);
      }
    }
  }
  return skills;
}

async function discoverMcpServers(
  repoFullName: string,
  pluginPath: string,
  ref: string,
  manifests: LoadedManifest[],
): Promise<McpServerInput[]> {
  const byId = new Map<string, McpServerInput>();

  function addParsed(json: unknown, protocol: PluginProtocol, label: string): void {
    const { servers, skipped, mcpDisabled } = parseMcpConfig(json, protocol);
    if (mcpDisabled) console.log(`  skipped ${label}: ${safeLog(mcpDisabled)}`);
    for (const skippedServer of skipped) {
      console.log(
        `  skipped MCP server ${JSON.stringify(skippedServer.serverId)} in ${label}: ${safeLog(skippedServer.reason)}`,
      );
    }
    for (const server of servers) {
      if (byId.size >= MAX_MCP_SERVERS_PER_PLUGIN || byId.has(server.serverId)) continue;
      byId.set(server.serverId, {
        serverId: server.serverId,
        transport: server.config.type,
        config: server.config,
      });
    }
  }

  const fetched = new Set<string>();
  for (const manifest of manifests) {
    const declared = manifest.raw.mcpServers;
    if (typeof declared === "object" && declared !== null && !Array.isArray(declared)) {
      addParsed(declared, manifest.protocol, `${manifest.path}#mcpServers`);
      continue;
    }

    const paths = componentPaths(declared)
      .map((value) => resolveComponentPath(pluginPath, value))
      .filter((value): value is string => value !== null);
    if (paths.length === 0) {
      paths.push(defaultMcpPathForRoot(pluginPath, manifest.protocol));
    }
    for (const path of paths) {
      const key = `${manifest.protocol}:${path}`;
      if (fetched.has(key)) continue;
      fetched.add(key);
      const file = await getFileContent(repoFullName, path, ref);
      if (!file) continue;
      if (file.size > MAX_COMPONENT_FILE_BYTES) {
        console.log(`  skipped ${path}: too large (${file.size} bytes)`);
        continue;
      }
      try {
        addParsed(JSON.parse(file.text), manifest.protocol, path);
      } catch {
        console.log(`  skipped ${path}: not valid JSON`);
      }
    }
  }
  return [...byId.values()];
}

async function indexHit(item: CodeSearchItem): Promise<HitOutcome> {
  const location = manifestLocation(item.path);
  if (!location || item.name !== "plugin.json") {
    return { ok: false, reason: "hit is not a canonical plugin manifest" };
  }
  if (item.path.split("/").some((segment) => !isSafePathSegment(segment))) {
    return { ok: false, reason: "manifest path contains unsafe segments" };
  }

  const repoFullName = item.repository.full_name;
  let repo = repoCache.get(repoFullName);
  if (repo === undefined) {
    repo = await getRepo(repoFullName);
    repoCache.set(repoFullName, repo);
  }
  if (!repo) return { ok: false, reason: "repo metadata unavailable" };

  // A repository push changes `pushed_at`, so an identical non-null timestamp
  // means its manifests, skills, and MCP files do not need to be downloaded
  // again. This keeps twice-daily broad scans within GitHub API limits while
  // still refreshing star counts, which can change without a repository push.
  const existing = await prisma.plugin.findUnique({
    where: {
      repoUrl_pluginPath: {
        repoUrl: repo.htmlUrl,
        pluginPath: location.pluginPath,
      },
    },
    select: {
      name: true,
      protocols: true,
      manifests: true,
      upstreamMarketplaces: true,
      repoStars: true,
      repoForks: true,
      repoOpenIssues: true,
      repoPushedAt: true,
    },
  });
  const contentUnchanged =
    existing?.repoPushedAt !== null &&
    existing?.repoPushedAt !== undefined &&
    repo.pushedAt !== null &&
    existing.repoPushedAt.getTime() === repo.pushedAt.getTime();
  if (existing && contentUnchanged) {
    const needsMarketplaceDiscovery = existing.upstreamMarketplaces === null;
    const upstreamMarketplaces = needsMarketplaceDiscovery
      ? await discoverUpstreamMarketplaces(
          repoFullName,
          location.pluginPath,
          repo.defaultBranch,
          storedCodexName(existing.manifests, existing.name),
          storedProtocols(existing.protocols),
        )
      : null;
    if (
      needsMarketplaceDiscovery ||
      existing.repoStars !== repo.stars ||
      existing.repoForks !== repo.forks ||
      existing.repoOpenIssues !== repo.openIssues
    ) {
      await prisma.plugin.update({
        where: {
          repoUrl_pluginPath: {
            repoUrl: repo.htmlUrl,
            pluginPath: location.pluginPath,
          },
        },
        data: {
          repoStars: repo.stars,
          repoForks: repo.forks,
          repoOpenIssues: repo.openIssues,
          ...(upstreamMarketplaces
            ? { upstreamMarketplaces: JSON.stringify(upstreamMarketplaces) }
            : {}),
        },
      });
      return { ok: true, name: existing.name, status: "metadata" };
    }
    return { ok: true, name: existing.name, status: "unchanged" };
  }

  const manifests = await loadManifests(repoFullName, location.pluginPath, repo.defaultBranch);
  if (manifests.length === 0) {
    return { ok: false, reason: "no valid Codex, Claude Code, or Agent Plugins manifest" };
  }
  const canonical = manifests[0];
  for (const other of manifests.slice(1)) {
    if (other.manifest.name !== canonical.manifest.name) {
      console.log(
        `  manifest name mismatch: ${canonical.path} uses ${canonical.manifest.name}, ${other.path} uses ${other.manifest.name}; using ${canonical.path}`,
      );
    }
  }
  // Sibling manifests often carry metadata the canonical one omits (Codex
  // manifests rarely declare license/repository). Backfill missing fields
  // from the other manifests, canonical first.
  const mergedManifest: NormalizedPluginManifest = { name: canonical.manifest.name };
  for (const loaded of manifests) {
    for (const [key, value] of Object.entries(loaded.manifest)) {
      if (value !== undefined && !(key in mergedManifest)) {
        Object.assign(mergedManifest, { [key]: value });
      }
    }
  }
  const protocols = manifests.map((manifest) => manifest.protocol);
  const skills = await discoverSkills(
    repoFullName,
    location.pluginPath,
    repo.defaultBranch,
    protocols,
  );
  const mcpServers = await discoverMcpServers(
    repoFullName,
    location.pluginPath,
    repo.defaultBranch,
    manifests,
  );
  const upstreamMarketplaces = await discoverUpstreamMarketplaces(
    repoFullName,
    location.pluginPath,
    repo.defaultBranch,
    manifests.find((manifest) => manifest.protocol === "codex")?.manifest.name ??
      canonical.manifest.name,
    protocols,
  );

  await upsertPlugin({
    manifestRaw: canonical.rawText,
    manifestPath: canonical.path,
    protocols,
    manifests: Object.fromEntries(
      manifests.map((manifest) => [
        manifest.protocol,
        { path: manifest.path, raw: manifest.rawText },
      ]),
    ),
    upstreamMarketplaces,
    manifest: mergedManifest,
    repoUrl: repo.htmlUrl,
    pluginPath: location.pluginPath,
    repoStars: repo.stars,
    repoForks: repo.forks,
    repoOpenIssues: repo.openIssues,
    repoPushedAt: repo.pushedAt,
    skills,
    mcpServers,
  });

  return { ok: true, name: canonical.manifest.name, status: "indexed" };
}

const options = parseArgs(process.argv.slice(2));
const { max, queries, repositoryMax, repositoryQueries, searchPage, searchPageSize,
  allowPartial, skipCodeSearch, skipRepositorySearch, skipOwnerFanout,
  ownerFanoutMax, directRepositories, directOwners, requestBudget, timeBudgetSeconds } = options;
const statePath = process.env.INDEX_STATE_PATH ?? "prisma/index-state.json";
// Invocation limits can change while resuming; discovery bounds cannot.
const { requestBudget: _requestBudget, timeBudgetSeconds: _timeBudget, allowPartial: _allowPartial, ...discoveryOptions } = options;
void _requestBudget; void _timeBudget; void _allowPartial;

function makeTask(kind: IndexTask["kind"], id: string, query: string, budget: number, extra: Partial<IndexTask> = {}): IndexTask {
  const perPage = searchPageSize ?? Math.min(100, Math.max(1, budget));
  return { id, kind, query, page: searchPage ?? 1,
    endPage: searchPage ?? Math.ceil(MAX_RESULTS_PER_SEARCH / perPage), perPage,
    remaining: budget, repos: [], hits: [], exhausted: false, done: budget === 0, ...extra };
}
const initialTasks: IndexTask[] = directRepositories.map((repo) => makeTask("direct", `direct:${repo}`, repo, 1));
for (const owner of directOwners) if (!skipOwnerFanout) initialTasks.push(makeTask("owner", `owner:${owner.toLowerCase()}`, owner, ownerFanoutMax));
// Fixed shares make the checkpoint stable across retries. Each task gets one
// candidate per turn; a large first repository/query cannot starve later families.
const repositoryBudgets = allocateSearchBudget(repositoryMax, repositoryQueries.map(() => 1));
const codeBudgets = allocateSearchBudget(max, queries.map(() => 1));
for (let index = 0; index < Math.max(repositoryQueries.length, queries.length); index++) {
  if (!skipRepositorySearch && index < repositoryQueries.length) {
    const shares = allocateSearchBudget(repositoryBudgets[index], REPOSITORY_SEARCH_PASSES.map((pass) => pass.weight));
    REPOSITORY_SEARCH_PASSES.forEach((pass, passIndex) => initialTasks.push(makeTask("repository-search", `repository:${index}:${passIndex}`, repositoryQueries[index], shares[passIndex], { sort: pass.sort, order: pass.order })));
  }
  if (!skipCodeSearch && index < queries.length) {
    const shares = allocateSearchBudget(codeBudgets[index], SEARCH_ORDERS.map(() => 1));
    SEARCH_ORDERS.forEach((order, passIndex) => initialTasks.push(makeTask("code-search", `code:${index}:${passIndex}`, queries[index], Math.min(MAX_RESULTS_PER_SEARCH, shares[passIndex]), { sort: "indexed", order })));
  }
}
const state = loadCheckpoint(statePath, configHash(discoveryOptions), initialTasks);
const seen = new Set(state.seenRoots);
const seenRepositories = new Set(state.seenRepositories);
let processed = 0;
let indexed = 0;
let metadata = 0;
let unchanged = 0;
let skipped = 0;
let errors = 0;
let repositoryCandidates = 0;
let repositoryMatches = 0;
configureGitHubRequests({ requestBudget, timeBudgetMs: timeBudgetSeconds * 1000 });
state.status = "running";
state.reason = null;
function checkpoint(): void {
  state.seenRoots = [...seen];
  state.seenRepositories = [...seenRepositories];
  state.requestMetrics = githubRequestMetrics();
  saveCheckpoint(statePath, state);
}
checkpoint();
console.log(`cycle ${state.cycleId}: ${state.tasks.filter((task) => !task.done).length} pending tasks; request budget ${requestBudget}, time budget ${timeBudgetSeconds}s`);
console.log(`--max=${max} bounds code hits only; --repository-max=${repositoryMax} bounds repository candidates. Completion covers the configured cycle, not all GitHub.`);

function queueOwnerFanout(repoFullName: string): void {
  if (skipOwnerFanout) return;
  const owner = ownerFromFullName(repoFullName).toLowerCase();
  if (owner && !state.tasks.some((task) => task.id === `owner:${owner}`)) state.tasks.push(makeTask("owner", `owner:${owner}`, owner, ownerFanoutMax));
}
async function processHit(item: CodeSearchItem): Promise<void> {
  const location = manifestLocation(item.path);
  const rootKey = `${item.repository.full_name.toLowerCase()}#${location?.pluginPath ?? item.path}`;
  if (seen.has(rootKey)) return;
  const outcome = await indexHit(item);
  // Mark only after the DB transaction/metadata update finishes. Replaying a
  // committed root after a crash is harmless; pre-marking would lose updates.
  seen.add(rootKey);
  processed++;
  if (outcome.ok) {
    if (outcome.status === "indexed") indexed++;
    if (outcome.status === "metadata") metadata++;
    if (outcome.status === "unchanged") unchanged++;
    queueOwnerFanout(item.repository.full_name);
    console.log(`${outcome.status} ${outcome.name}@${safeLog(item.repository.full_name)}`);
  } else {
    skipped++;
    console.log(`skipped ${safeLog(rootKey)}: ${safeLog(outcome.reason)}`);
  }
  checkpoint();
}
async function processRepository(repo: RepoMetadata): Promise<void> {
  const key = repo.fullName.toLowerCase();
  if (seenRepositories.has(key)) return;
  repoCache.set(repo.fullName, repo);
  const inventory = await listRepositoryManifestFiles(repo.fullName, repo.defaultBranch);
  if (inventory.files.length) {
    repositoryMatches++;
    queueOwnerFanout(repo.fullName);
    for (const file of inventory.files) await processHit({ ...file, html_url: `${repo.htmlUrl}/blob/${repo.defaultBranch}/${file.path}`, repository: { full_name: repo.fullName, html_url: repo.htmlUrl } });
  }
  // Known roots may be committed, but a truncated tree is never full coverage.
  if (inventory.truncated) throw new GitHubApiError(`Truncated repository tree: ${repo.fullName}`);
  seenRepositories.add(key);
  repositoryCandidates++;
  checkpoint();
}
async function step(task: IndexTask): Promise<void> {
  if (task.kind === "direct") {
    const repo = await getRepo(task.query);
    if (!repo) throw new GitHubApiError(`Requested repository unavailable: ${task.query}`, 404);
    await processRepository(repo);
    task.done = true;
    return;
  }
  if (task.kind === "owner" && !task.exhausted) {
    task.repos = (await listOwnerPublicRepositories(task.query, { max: ownerFanoutMax })).map(storeRepo);
    task.exhausted = true;
    checkpoint();
  }
  if (task.kind === "repository-search" || task.kind === "code-search") {
    if (!task.repos.length && !task.hits.length && !task.exhausted && task.remaining > 0) {
      let hasMore = false;
      let incomplete = false;
      const onPage = (info: { hasMore: boolean; incomplete: boolean }) => { hasMore = info.hasMore; incomplete = info.incomplete; };
      if (task.kind === "repository-search") {
        for await (const repos of searchRepositories(task.query, { perPage: task.perPage, startPage: task.page, maxPages: 1, sort: task.sort === "updated" ? "updated" : undefined, order: task.order, onPage })) {
          if (incomplete) throw new GitHubApiError("GitHub repository search returned incomplete results; page retained for retry");
          task.repos = repos.map(storeRepo);
        }
      } else {
        for await (const hits of searchCode(task.query, { perPage: task.perPage, startPage: task.page, maxPages: 1, sort: "indexed", order: task.order, onPage })) {
          if (incomplete) throw new GitHubApiError("GitHub code search returned incomplete results; page retained for retry");
          task.hits = hits;
        }
      }
      task.page++;
      task.exhausted = !hasMore || task.page > task.endPage;
      // Persist the exact page, not just its offset: rankings can change between runs.
      checkpoint();
    }
  }
  if (task.hits.length && task.remaining > 0) {
    await processHit(task.hits[0]);
    task.hits.shift();
    task.remaining--;
  } else if (task.repos.length && task.remaining > 0) {
    const repo = restoreRepo(task.repos[0]);
    const duplicate = seenRepositories.has(repo.fullName.toLowerCase());
    await processRepository(repo);
    task.repos.shift();
    if (!duplicate) task.remaining--;
  }
  if (task.remaining === 0 || (task.exhausted && !task.hits.length && !task.repos.length)) {
    task.done = true;
    task.hits = [];
    task.repos = [];
  }
}
const blocked = new Set<string>();
let exitCode = 0;
let fatal = false;
try {
  for (;;) {
    const task = nextTask(state, blocked);
    if (!task) break;
    // The cursor is saved before work. Even a budget interruption during an
    // expensive root gives the next family priority when the cycle resumes.
    checkpoint();
    try {
      assertGitHubBudget();
      await step(task);
      delete task.lastError;
      checkpoint();
    } catch (err) {
      if (err instanceof RateLimitAbortError || !(err instanceof GitHubApiError)) throw err;
      errors++;
      task.lastError = safeLog(err instanceof Error ? err.message : "Unknown task error");
      blocked.add(task.id);
      console.error(`task ${task.id} paused: ${task.lastError}`);
      checkpoint();
    }
  }
  const pending = state.tasks.filter((task) => !task.done);
  state.status = pending.length ? "partial" : "completed";
  state.reason = pending.length ? `${pending.length} tasks need retry` : null;
  state.completedAt = pending.length ? null : new Date().toISOString();
} catch (err) {
  fatal = !(err instanceof RateLimitAbortError);
  state.status = "partial";
  state.reason = safeLog(err instanceof Error ? err.message : "Unknown indexing error");
  console.error(`paused: ${state.reason}`);
} finally {
  checkpoint();
  await prisma.$disconnect();
}
if (fatal || (state.status !== "completed" && !allowPartial)) exitCode = 1;
console.log(`${state.status}: examined ${repositoryCandidates} repositories, matched ${repositoryMatches}; processed ${processed} roots, indexed ${indexed}, metadata ${metadata}, unchanged ${unchanged}, skipped ${skipped}, errors ${errors}`);
console.log(`requests: ${JSON.stringify(state.requestMetrics)}; checkpoint: ${statePath}`);
process.exit(exitCode);
