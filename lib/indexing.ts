import { prisma } from "@/lib/db";
import { stripControlChars } from "@/lib/format";
import {
  authorDisplayName,
  repositoryUrl,
  type NormalizedPluginManifest,
} from "@/lib/validation";
import type { PluginProtocol } from "@/lib/protocols";
import type { InstallRuntime, UpstreamMarketplace } from "@/lib/marketplaces";

// Shared write path for indexed plugins. Both the live GitHub indexer
// (scripts/index-github.ts) and the fixture seeder (scripts/seed.ts) go
// through upsertPlugin so every row is shaped identically.

export interface SkillInput {
  /** Directory name under skills/ */
  dirName: string;
  /** Plugin-relative path to this skill file. */
  path: string;
  name: string;
  description: string | null;
  /** Parsed SKILL.md frontmatter, stored as JSON. */
  frontmatter: Record<string, unknown>;
}

export interface McpServerInput {
  /** Key in mcp.json's mcpServers map. */
  serverId: string;
  /** "stdio" | "streamable-http" | "sse" */
  transport: string;
  /** Validated server config, stored as JSON. */
  config: Record<string, unknown>;
}

export interface UpsertPluginInput {
  /** Raw canonical plugin manifest text exactly as fetched. */
  manifestRaw: string;
  /** Canonical manifest path inside the repository. */
  manifestPath: string;
  /** All runtime protocols validated for this plugin root. */
  protocols: PluginProtocol[];
  /** Raw manifests keyed by protocol. */
  manifests: Partial<Record<PluginProtocol, { path: string; raw: string }>>;
  upstreamMarketplaces?: Partial<Record<InstallRuntime, UpstreamMarketplace>>;
  /** The already-validated, normalized canonical manifest. */
  manifest: NormalizedPluginManifest;
  repoUrl: string;
  /** Plugin directory within the repo; "" = repo root. */
  pluginPath: string;
  repoStars: number;
  repoForks?: number;
  repoOpenIssues?: number;
  repoPushedAt: Date | null;
  skills: SkillInput[];
  mcpServers: McpServerInput[];
}

/** GitHub owner login from a repo URL; empty string when it cannot be parsed. */
export function repoOwnerFromUrl(repoUrl: string): string {
  const match = /^https:\/\/github\.com\/([^/]+)\//.exec(repoUrl);
  return match && match[1] ? decodeURIComponent(match[1]).toLowerCase() : "";
}

export interface UpsertPluginResult {
  id: string;
  slug: string;
  created: boolean;
}

/**
 * True when a path segment is safe to join under the plugin directory —
 * rejects empty, ".", "..", separators, and control characters (including
 * NUL, newlines, and ANSI escapes) so no component path can escape the
 * plugin directory or inject terminal/clipboard control sequences.
 */
export function isSafePathSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    stripControlChars(segment) === segment
  );
}

// Skill frontmatter requirements per the Agent Skills spec
// (https://agentskills.io/specification): `name` is REQUIRED — 1-64 chars,
// lowercase alphanumeric and hyphens, no leading/trailing/consecutive
// hyphens, and MUST match the skill's parent directory name; `description`
// is REQUIRED — non-empty, at most 1024 chars.
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_NAME_LENGTH = 64;
const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/**
 * Build a SkillInput from a skills/<dirName>/SKILL.md frontmatter object.
 * Returns null when the frontmatter does not conform to the Agent Skills
 * spec (see the rules above) — the Agent Plugins spec delegates SKILL.md
 * validity to that spec and says non-conforming skills MUST be skipped.
 */
export function skillFromFrontmatter(
  dirName: string,
  frontmatter: Record<string, unknown>,
  options: { allowDerivedName?: boolean; path?: string } = {},
): SkillInput | null {
  const declaredName = frontmatter["name"];
  const name =
    options.allowDerivedName && declaredName === undefined ? dirName : declaredName;
  const description = frontmatter["description"];
  if (
    typeof name !== "string" ||
    name.length > MAX_SKILL_NAME_LENGTH ||
    !SKILL_NAME_RE.test(name) ||
    name !== dirName ||
    typeof description !== "string" ||
    description.length === 0 ||
    description.length > MAX_SKILL_DESCRIPTION_LENGTH
  ) {
    return null;
  }
  return {
    dirName,
    path: options.path ?? `skills/${dirName}/SKILL.md`,
    name,
    description,
    frontmatter,
  };
}

/**
 * Slug = manifest name, uniquified with -2/-3... when that slug already
 * belongs to a DIFFERENT repoUrl+pluginPath. Re-runs of the same source
 * resolve to the same slug, keeping the pipeline idempotent.
 */
async function resolveSlug(
  base: string,
  repoUrl: string,
  pluginPath: string
): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const existing = await prisma.plugin.findUnique({
      where: { slug: candidate },
      select: { repoUrl: true, pluginPath: true },
    });
    if (!existing) return candidate;
    if (existing.repoUrl === repoUrl && existing.pluginPath === pluginPath) {
      return candidate;
    }
  }
  // Pathological collision count; fall back to a time-based suffix.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Insert or update a plugin row (keyed by the unique repoUrl+pluginPath
 * pair) and atomically replace its Skill/McpServer child rows. Idempotent:
 * re-running with the same input leaves the same rows in place.
 */
export async function upsertPlugin(
  input: UpsertPluginInput
): Promise<UpsertPluginResult> {
  const { manifest } = input;
  const sourceKey = {
    repoUrl: input.repoUrl,
    pluginPath: input.pluginPath,
  };

  const existing = await prisma.plugin.findUnique({
    where: { repoUrl_pluginPath: sourceKey },
    select: { id: true },
  });

  const slug = await resolveSlug(manifest.name, input.repoUrl, input.pluginPath);

  // Defensive de-dupe on child unique keys (last entry wins).
  const skills = [...new Map(input.skills.map((s) => [s.dirName, s])).values()];
  const mcpServers = [
    ...new Map(input.mcpServers.map((s) => [s.serverId, s])).values(),
  ];

  const data = {
    slug,
    name: manifest.name,
    version: manifest.version ?? null,
    description: manifest.description ?? null,
    authorName: authorDisplayName(manifest.author),
    homepage: manifest.homepage ?? null,
    repository: repositoryUrl(manifest.repository),
    license: manifest.license ?? null,
    // Normalized (trimmed, lowercased, deduped) so the category filter's
    // quoted-substring match agrees with the categories derived at read time.
    keywords: JSON.stringify([
      ...new Set(
        (manifest.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean)
      ),
    ]),
    manifest: input.manifestRaw,
    manifestPath: input.manifestPath,
    protocols: JSON.stringify([...new Set(input.protocols)]),
    manifests: JSON.stringify(input.manifests),
    upstreamMarketplaces: JSON.stringify(input.upstreamMarketplaces ?? {}),
    repoUrl: input.repoUrl,
    repoOwner: repoOwnerFromUrl(input.repoUrl),
    pluginPath: input.pluginPath,
    repoStars: input.repoStars,
    repoForks: input.repoForks ?? 0,
    repoOpenIssues: input.repoOpenIssues ?? 0,
    repoPushedAt: input.repoPushedAt,
    skillCount: skills.length,
    mcpCount: mcpServers.length,
  };

  const plugin = await prisma.$transaction(async (tx) => {
    const row = await tx.plugin.upsert({
      where: { repoUrl_pluginPath: sourceKey },
      create: data,
      update: data,
    });

    await tx.skill.deleteMany({ where: { pluginId: row.id } });
    if (skills.length > 0) {
      await tx.skill.createMany({
        data: skills.map((s) => ({
          pluginId: row.id,
          dirName: s.dirName,
          path: s.path,
          name: s.name,
          description: s.description,
          frontmatter: JSON.stringify(s.frontmatter),
        })),
      });
    }

    await tx.mcpServer.deleteMany({ where: { pluginId: row.id } });
    if (mcpServers.length > 0) {
      await tx.mcpServer.createMany({
        data: mcpServers.map((s) => ({
          pluginId: row.id,
          serverId: s.serverId,
          transport: s.transport,
          config: JSON.stringify(s.config),
        })),
      });
    }

    return row;
  });

  return { id: plugin.id, slug: plugin.slug, created: !existing };
}
