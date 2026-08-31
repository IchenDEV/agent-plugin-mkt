// GitHub indexer CLI. Searches canonical Codex, Claude Code, and Agent Plugins
// manifest locations, merges manifests that share one plugin root, discovers
// common skills/MCP components, and upserts one logical registry entry.

import { prisma } from "@/lib/db";
import {
  DEFAULT_REPOSITORY_SEARCH_QUERIES,
  DEFAULT_SEARCH_QUERIES,
  GitHubApiError,
  RateLimitAbortError,
  getFileContent,
  getRepo,
  listDirectory,
  listRepositoryManifestFiles,
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

const MAX_MANIFEST_BYTES = 200 * 1024;
const MAX_COMPONENT_FILE_BYTES = 200 * 1024;
const MAX_MARKETPLACE_BYTES = 1024 * 1024;
const MAX_SKILLS_PER_PLUGIN = 50;
const MAX_MCP_SERVERS_PER_PLUGIN = 50;
const DEFAULT_MAX_PLUGINS = 40;
const DEFAULT_MAX_REPOSITORIES = 40;
const SEARCH_ORDERS = ["desc", "asc"] as const;
// Repository search runs one best-match pass plus one recently-updated pass per
// query. Best match buries new, low-star repositories under established ones;
// the updated window surfaces them while they are still active.
const REPOSITORY_SEARCH_PASSES = [
  { label: "best-match window", sort: undefined, order: undefined },
  { label: "recently-updated window", sort: "updated", order: "desc" },
] as const;
const MAX_RESULTS_PER_SEARCH = 1_000;

function safeLog(value: string): string {
  return stripControlChars(value);
}

interface CliOptions {
  max: number;
  queries: string[];
  repositoryMax: number;
  repositoryQueries: string[];
  searchPage?: number;
  searchPageSize?: number;
  allowPartial: boolean;
  skipCodeSearch: boolean;
  skipRepositorySearch: boolean;
  directRepositories: string[];
}

function parseArgs(argv: string[]): CliOptions {
  let max = DEFAULT_MAX_PLUGINS;
  let repositoryMax = DEFAULT_MAX_REPOSITORIES;
  let customQuery: string | undefined;
  let customRepositoryQuery: string | undefined;
  let searchPage: number | undefined;
  let searchPageSize: number | undefined;
  let allowPartial = false;
  let skipCodeSearch = false;
  let skipRepositorySearch = false;
  const directRepositories: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max") {
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
    } else if (arg === "--repo") {
      const value = argv[++i];
      if (value && /^[^/\s]+\/[^/\s]+$/.test(value)) {
        directRepositories.push(value);
      }
    } else if (arg.startsWith("--repo=")) {
      const value = arg.slice("--repo=".length);
      if (/^[^/\s]+\/[^/\s]+$/.test(value)) directRepositories.push(value);
    } else {
      console.warn(`ignoring unknown argument: ${arg}`);
    }
  }
  return {
    max,
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
    directRepositories: [...new Set(directRepositories)],
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

const {
  max,
  queries,
  repositoryMax,
  repositoryQueries,
  searchPage,
  searchPageSize,
  allowPartial,
  skipCodeSearch,
  skipRepositorySearch,
  directRepositories,
} = parseArgs(process.argv.slice(2));
console.log(
  `searching ${skipRepositorySearch ? 0 : repositoryQueries.length} repository families ` +
    `with up to ${repositoryMax} candidates; searching ${skipCodeSearch ? 0 : queries.length} ` +
    `legacy code families with up to ${max} hits`,
);
if (searchPage) {
  console.log(`using rotating search page ${searchPage} with ${searchPageSize ?? 100} results per page`);
}

let processed = 0;
let indexed = 0;
let metadata = 0;
let unchanged = 0;
let skipped = 0;
let errors = 0;
let gotFirstPage = false;
let exitCode = 0;
const seen = new Set<string>();
const seenRepositories = new Set<string>();
let repositoryCandidates = 0;
let repositoryMatches = 0;

async function processHit(item: CodeSearchItem): Promise<void> {
  const location = manifestLocation(item.path);
  const rootKey = location
    ? `${item.repository.full_name}#${location.pluginPath}`
    : `${item.repository.full_name}#${item.path}`;
  if (seen.has(rootKey)) return;
  seen.add(rootKey);
  processed++;
  try {
    const outcome = await indexHit(item);
    if (outcome.ok) {
      if (outcome.status === "indexed") indexed++;
      if (outcome.status === "metadata") metadata++;
      if (outcome.status === "unchanged") unchanged++;
      console.log(`${outcome.status} ${outcome.name}@${safeLog(item.repository.full_name)}`);
    } else {
      skipped++;
      console.log(`skipped ${safeLog(rootKey)}: ${safeLog(outcome.reason)}`);
    }
  } catch (err) {
    if (err instanceof RateLimitAbortError) throw err;
    errors++;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error ${safeLog(rootKey)}: ${safeLog(message)}`);
  }
}

async function processRepository(repo: RepoMetadata): Promise<void> {
  if (seenRepositories.has(repo.fullName)) return;
  seenRepositories.add(repo.fullName);
  repositoryCandidates++;
  repoCache.set(repo.fullName, repo);
  try {
    const inventory = await listRepositoryManifestFiles(repo.fullName, repo.defaultBranch);
    if (inventory.truncated) {
      console.warn(
        `repository tree was truncated; coverage is incomplete: ${safeLog(repo.fullName)}`,
      );
    }
    if (inventory.files.length === 0) return;
    repositoryMatches++;
    console.log(
      `found ${inventory.files.length} canonical manifests in ${safeLog(repo.fullName)}`,
    );
    for (const file of inventory.files) {
      await processHit({
        ...file,
        html_url: `${repo.htmlUrl}/blob/${repo.defaultBranch}/${file.path}`,
        repository: { full_name: repo.fullName, html_url: repo.htmlUrl },
      });
    }
  } catch (err) {
    if (err instanceof RateLimitAbortError) throw err;
    errors++;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`repository scan failed for ${safeLog(repo.fullName)}: ${safeLog(message)}`);
  }
}

try {
  for (const repoFullName of directRepositories) {
    console.log(`scanning requested repository: ${safeLog(repoFullName)}`);
    const repo = await getRepo(repoFullName);
    if (!repo) {
      errors++;
      console.error(`requested repository unavailable: ${safeLog(repoFullName)}`);
      continue;
    }
    await processRepository(repo);
  }

  if (!skipRepositorySearch) {
    // The budget is a single shared pool: each query is guaranteed an even
    // share of what remains, and whatever a query (or one of its passes)
    // cannot spend rolls over to the next one. Repositories already seen via
    // an earlier query or pass do not consume budget.
    let remainingBudget = repositoryMax;
    for (const [queryIndex, query] of repositoryQueries.entries()) {
      const queriesLeft = repositoryQueries.length - queryIndex;
      const queryBudget = Math.floor(remainingBudget / queriesLeft);
      if (queryBudget === 0) continue;
      console.log(`searching GitHub repositories: ${query}`);
      let queryConsumed = 0;
      let queryRemaining = queryBudget;
      for (const [passIndex, pass] of REPOSITORY_SEARCH_PASSES.entries()) {
        const passesLeft = REPOSITORY_SEARCH_PASSES.length - passIndex;
        const passBudget = Math.floor(queryRemaining / passesLeft);
        if (passBudget === 0) continue;
        let passConsumed = 0;
        console.log(`  scanning ${pass.label}`);
        try {
          for await (const repositories of searchRepositories(query, {
            perPage: searchPageSize ?? Math.min(100, passBudget),
            startPage: searchPage,
            maxPages: searchPage ? 1 : undefined,
            sort: pass.sort,
            order: pass.order,
          })) {
            gotFirstPage = true;
            for (const repo of repositories) {
              if (passConsumed >= passBudget) break;
              if (seenRepositories.has(repo.fullName)) continue;
              passConsumed++;
              queryConsumed++;
              await processRepository(repo);
            }
            if (passConsumed >= passBudget) break;
          }
        } catch (err) {
          if (err instanceof RateLimitAbortError) throw err;
          errors++;
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `repository search failed (${pass.label}) for ${safeLog(query)}: ${safeLog(message)}`,
          );
        }
        queryRemaining -= passConsumed;
      }
      remainingBudget -= queryConsumed;
    }
  }

  if (!skipCodeSearch) {
    for (const [queryIndex, query] of queries.entries()) {
      const baseBudget = Math.floor(max / queries.length);
      const queryBudget = baseBudget + (queryIndex < max % queries.length ? 1 : 0);
      if (queryBudget === 0) continue;
      console.log(`searching GitHub code: ${query}`);
      for (const [orderIndex, order] of SEARCH_ORDERS.entries()) {
        const basePassBudget = Math.floor(queryBudget / SEARCH_ORDERS.length);
        const passBudget = Math.min(
          MAX_RESULTS_PER_SEARCH,
          basePassBudget + (orderIndex < queryBudget % SEARCH_ORDERS.length ? 1 : 0),
        );
        if (passBudget === 0) continue;
        let passExamined = 0;
        console.log(`  scanning ${order === "desc" ? "newest" : "oldest"}-indexed window`);
        try {
          for await (const items of searchCode(query, {
            perPage: searchPageSize ?? Math.min(100, passBudget),
            startPage: searchPage,
            maxPages: searchPage ? 1 : undefined,
            sort: "indexed",
            order,
          })) {
            gotFirstPage = true;
            for (const item of items) {
              if (passExamined >= passBudget) break;
              passExamined++;
              await processHit(item);
            }
            if (passExamined >= passBudget) break;
          }
        } catch (err) {
          if (err instanceof RateLimitAbortError) throw err;
          errors++;
          const message = err instanceof Error ? err.message : String(err);
          console.error(`search pass failed (${order}) for ${safeLog(query)}: ${safeLog(message)}`);
        }
      }
    }
  }
} catch (err) {
  if (err instanceof RateLimitAbortError) {
    console.error(`aborted: ${err.message}`);
    if (allowPartial) {
      console.error("keeping fully committed plugin updates from this partial run");
    } else {
      exitCode = 1;
    }
  } else {
    const message =
      err instanceof GitHubApiError || err instanceof Error ? err.message : String(err);
    if (!gotFirstPage) {
      console.error(`discovery failed: ${message}`);
      exitCode = 1;
    } else {
      console.error(`search stopped early: ${message}`);
      errors++;
    }
  }
}

console.log(
  `done: examined ${repositoryCandidates} repositories, matched ${repositoryMatches}; ` +
    `processed ${processed} plugin roots, indexed ${indexed}, metadata ${metadata}, ` +
    `unchanged ${unchanged}, skipped ${skipped}, errors ${errors}`,
);

await prisma.$disconnect();
process.exit(exitCode);
