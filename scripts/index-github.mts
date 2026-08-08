// GitHub indexer CLI. Searches GitHub code search for plugin.json manifests
// referencing agent-plugins.org, validates them against the spec, discovers
// skills/ and mcp.json components, and upserts everything into the registry.
//
// Usage (via tsx):
//   tsx scripts/index-github.ts [--max N] [--query "<code search query>"]
//
// Exit code 1 only when the search itself fails entirely; per-plugin
// failures are logged, counted, and skipped.

import { prisma } from "@/lib/db";
import {
  DEFAULT_SEARCH_QUERY,
  GitHubApiError,
  RateLimitAbortError,
  getFileContent,
  getRepo,
  listDirectory,
  searchCode,
  type CodeSearchItem,
  type RepoMetadata,
} from "@/lib/github";
import { parseFrontmatter } from "@/lib/frontmatter";
import { parseMcpConfig, pluginManifestSchema } from "@/lib/validation";
import {
  isSafePathSegment,
  skillFromFrontmatter,
  upsertPlugin,
  type McpServerInput,
  type SkillInput,
} from "@/lib/indexing";

const MAX_MANIFEST_BYTES = 200 * 1024;
const DEFAULT_MAX_PLUGINS = 40;

interface CliOptions {
  max: number;
  query: string;
}

function parseArgs(argv: string[]): CliOptions {
  let max = DEFAULT_MAX_PLUGINS;
  let query = DEFAULT_SEARCH_QUERY;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) max = Math.floor(value);
    } else if (arg.startsWith("--max=")) {
      const value = Number(arg.slice("--max=".length));
      if (Number.isFinite(value) && value > 0) max = Math.floor(value);
    } else if (arg === "--query") {
      const value = argv[++i];
      if (value) query = value;
    } else if (arg.startsWith("--query=")) {
      const value = arg.slice("--query=".length);
      if (value) query = value;
    } else {
      console.warn(`ignoring unknown argument: ${arg}`);
    }
  }
  return { max, query };
}

type HitOutcome = { ok: true; name: string } | { ok: false; reason: string };

const repoCache = new Map<string, RepoMetadata | null>();

async function indexHit(item: CodeSearchItem): Promise<HitOutcome> {
  if (item.name !== "plugin.json") {
    return { ok: false, reason: "hit is not a plugin.json file" };
  }
  // Every segment of the manifest path must be a plain segment; this also
  // guarantees the component paths we derive below stay inside the repo.
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

  const manifestFile = await getFileContent(
    repoFullName,
    item.path,
    repo.defaultBranch
  );
  if (!manifestFile) {
    return { ok: false, reason: "plugin.json unreadable on default branch" };
  }
  if (manifestFile.size > MAX_MANIFEST_BYTES) {
    return {
      ok: false,
      reason: `plugin.json too large (${manifestFile.size} bytes > ${MAX_MANIFEST_BYTES})`,
    };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(manifestFile.text);
  } catch {
    return { ok: false, reason: "plugin.json is not valid JSON" };
  }

  const parsed = pluginManifestSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join(".") : "manifest";
    return {
      ok: false,
      reason: `invalid manifest: ${where}: ${issue?.message ?? "schema mismatch"}`,
    };
  }
  const manifest = parsed.data;

  // Plugin directory = directory of the manifest within the repo ("" = root).
  const pluginPath = item.path.includes("/")
    ? item.path.slice(0, item.path.lastIndexOf("/"))
    : "";
  const prefix = pluginPath ? `${pluginPath}/` : "";

  // --- skills/<dir>/SKILL.md ------------------------------------------------
  const skills: SkillInput[] = [];
  const skillsDir = await listDirectory(
    repoFullName,
    `${prefix}skills`,
    repo.defaultBranch
  );
  if (skillsDir) {
    for (const entry of skillsDir) {
      if (entry.type !== "dir") continue;
      if (!isSafePathSegment(entry.name)) {
        console.log(`  skipped skill ${JSON.stringify(entry.name)}: unsafe directory name`);
        continue;
      }
      const skillPath = `${prefix}skills/${entry.name}/SKILL.md`;
      const skillFile = await getFileContent(
        repoFullName,
        skillPath,
        repo.defaultBranch
      );
      if (!skillFile) {
        console.log(`  skipped skill "${entry.name}": no SKILL.md`);
        continue;
      }
      const frontmatter = parseFrontmatter(skillFile.text);
      if (!frontmatter) {
        console.log(`  skipped skill "${entry.name}": missing or malformed frontmatter`);
        continue;
      }
      skills.push(skillFromFrontmatter(entry.name, frontmatter.data));
    }
  }

  // --- mcp.json -------------------------------------------------------------
  const mcpServers: McpServerInput[] = [];
  const mcpFile = await getFileContent(
    repoFullName,
    `${prefix}mcp.json`,
    repo.defaultBranch
  );
  if (mcpFile) {
    let mcpJson: unknown = null;
    let mcpJsonOk = false;
    try {
      mcpJson = JSON.parse(mcpFile.text);
      mcpJsonOk = true;
    } catch {
      console.log("  skipped mcp.json: not valid JSON");
    }
    if (mcpJsonOk) {
      const { servers, skipped } = parseMcpConfig(mcpJson);
      for (const s of skipped) {
        console.log(`  skipped MCP server "${s.serverId}": ${s.reason}`);
      }
      for (const s of servers) {
        mcpServers.push({
          serverId: s.serverId,
          transport: s.config.type,
          config: s.config,
        });
      }
    }
  }

  await upsertPlugin({
    manifestRaw: manifestFile.text,
    manifest,
    repoUrl: repo.htmlUrl,
    pluginPath,
    repoStars: repo.stars,
    repoPushedAt: repo.pushedAt,
    skills,
    mcpServers,
  });

  return { ok: true, name: manifest.name };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { max, query } = parseArgs(process.argv.slice(2));

console.log(`searching GitHub code: ${query}`);
console.log(`processing up to ${max} plugin manifests`);

let processed = 0;
let indexed = 0;
let skipped = 0;
let errors = 0;
let gotFirstPage = false;
let exitCode = 0;

const seen = new Set<string>();

try {
  outer: for await (const items of searchCode(query, {
    perPage: Math.min(100, max),
  })) {
    gotFirstPage = true;
    for (const item of items) {
      if (processed >= max) break outer;
      const key = `${item.repository.full_name}#${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      processed++;
      try {
        const outcome = await indexHit(item);
        if (outcome.ok) {
          indexed++;
          console.log(`indexed ${outcome.name}@${item.repository.full_name}`);
        } else {
          skipped++;
          console.log(`skipped ${key}: ${outcome.reason}`);
        }
      } catch (err) {
        if (err instanceof RateLimitAbortError) throw err;
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`error ${key}: ${message}`);
      }
    }
    if (processed >= max) break;
  }
} catch (err) {
  if (err instanceof RateLimitAbortError) {
    // Graceful abort: keep what was indexed so far, exit 0.
    console.error(`aborted: ${err.message}`);
  } else {
    const message =
      err instanceof GitHubApiError || err instanceof Error
        ? err.message
        : String(err);
    if (!gotFirstPage) {
      console.error(`search failed: ${message}`);
      exitCode = 1;
    } else {
      console.error(`search stopped early: ${message}`);
      errors++;
    }
  }
}

console.log(
  `done: processed ${processed}, indexed ${indexed}, skipped ${skipped}, errors ${errors}`
);

await prisma.$disconnect();
process.exit(exitCode);
