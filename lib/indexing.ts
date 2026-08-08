import { prisma } from "@/lib/db";
import {
  authorDisplayName,
  repositoryUrl,
  type PluginManifest,
} from "@/lib/validation";

// Shared write path for indexed plugins. Both the live GitHub indexer
// (scripts/index-github.ts) and the fixture seeder (scripts/seed.ts) go
// through upsertPlugin so every row is shaped identically.

export interface SkillInput {
  /** Directory name under skills/ */
  dirName: string;
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
  /** Raw plugin.json text exactly as fetched. */
  manifestRaw: string;
  /** The already-validated manifest (pluginManifestSchema output). */
  manifest: PluginManifest;
  repoUrl: string;
  /** Plugin directory within the repo; "" = repo root. */
  pluginPath: string;
  repoStars: number;
  repoPushedAt: Date | null;
  skills: SkillInput[];
  mcpServers: McpServerInput[];
}

export interface UpsertPluginResult {
  id: string;
  slug: string;
  created: boolean;
}

/**
 * True when a path segment is safe to join under the plugin directory —
 * rejects empty, ".", "..", separators, and NUL so no component path can
 * escape the plugin directory.
 */
export function isSafePathSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !segment.includes("\0")
  );
}

/**
 * Build a SkillInput from a skills/<dirName>/SKILL.md frontmatter object,
 * per the spec: name = frontmatter.name when it is a non-empty string, else
 * the directory name; description = frontmatter.description when a string.
 */
export function skillFromFrontmatter(
  dirName: string,
  frontmatter: Record<string, unknown>
): SkillInput {
  const rawName = frontmatter["name"];
  const rawDescription = frontmatter["description"];
  return {
    dirName,
    name:
      typeof rawName === "string" && rawName.trim().length > 0
        ? rawName
        : dirName,
    description: typeof rawDescription === "string" ? rawDescription : null,
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
    keywords: JSON.stringify(manifest.keywords ?? []),
    manifest: input.manifestRaw,
    repoUrl: input.repoUrl,
    pluginPath: input.pluginPath,
    repoStars: input.repoStars,
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
