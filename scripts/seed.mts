// Seed the registry from fixtures/plugins.json. Every fixture entry flows
// through the SAME validation (pluginManifestSchema, parseMcpConfig) and the
// same upsertPlugin write path as the live GitHub indexer, with the same
// non-fatal boundaries: an invalid plugin is skipped with a log line; an
// invalid skill or MCP server is skipped without failing its plugin.
//
// Usage (via tsx):
//   tsx scripts/seed.ts [--reset]
//
// --reset deletes all Plugin rows (children cascade) before seeding.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  manifestWarnings,
  parseMcpConfig,
  pluginManifestSchema,
} from "@/lib/validation";
import {
  isSafePathSegment,
  skillFromFrontmatter,
  upsertPlugin,
  type McpServerInput,
  type SkillInput,
} from "@/lib/indexing";

const FIXTURE_PATH = path.resolve(process.cwd(), "fixtures", "plugins.json");

const fixtureSkillSchema = z.object({
  dirName: z.string().min(1),
  frontmatter: z.record(z.string(), z.unknown()),
});

const fixtureEntrySchema = z.object({
  repoUrl: z.string().min(1),
  pluginPath: z.string().default(""),
  repoStars: z.number().int().nonnegative().default(0),
  repoPushedAt: z.string().nullable().default(null),
  manifest: z.unknown(),
  skills: z.array(z.unknown()).default([]),
  mcp: z.unknown().optional(),
});

const fixtureFileSchema = z.object({
  plugins: z.array(z.unknown()),
});

function parsePushedAt(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const reset = process.argv.slice(2).includes("--reset");

try {
  const raw = await readFile(FIXTURE_PATH, "utf8");
  const file = fixtureFileSchema.parse(JSON.parse(raw));

  if (reset) {
    const { count } = await prisma.plugin.deleteMany({});
    console.log(`reset: deleted ${count} existing plugins`);
  }

  let seededPlugins = 0;
  let seededSkills = 0;
  let seededServers = 0;
  let skippedPlugins = 0;

  for (const [index, rawEntry] of file.plugins.entries()) {
    const label = `fixture #${index + 1}`;

    const entryParsed = fixtureEntrySchema.safeParse(rawEntry);
    if (!entryParsed.success) {
      skippedPlugins++;
      const issue = entryParsed.error.issues[0];
      console.log(
        `skipped ${label}: invalid fixture entry (${issue?.path.join(".") || "entry"}: ${issue?.message ?? "invalid"})`
      );
      continue;
    }
    const entry = entryParsed.data;

    const manifestParsed = pluginManifestSchema.safeParse(entry.manifest);
    if (!manifestParsed.success) {
      skippedPlugins++;
      const issue = manifestParsed.error.issues[0];
      const where =
        issue && issue.path.length > 0 ? issue.path.join(".") : "manifest";
      console.log(
        `skipped ${label} (${entry.repoUrl}): invalid manifest: ${where}: ${issue?.message ?? "schema mismatch"}`
      );
      continue;
    }
    const manifest = manifestParsed.data;

    // Non-fatal issues the spec says to report and ignore.
    for (const warning of manifestWarnings(entry.manifest as Record<string, unknown>)) {
      console.log(`  ${warning}`);
    }

    // Skills: same boundary as the indexer — a bad skill skips only itself.
    const skills: SkillInput[] = [];
    for (const rawSkill of entry.skills) {
      const skillParsed = fixtureSkillSchema.safeParse(rawSkill);
      if (!skillParsed.success) {
        console.log(`  skipped skill in ${manifest.name}: invalid fixture skill`);
        continue;
      }
      const { dirName, frontmatter } = skillParsed.data;
      if (!isSafePathSegment(dirName)) {
        console.log(
          `  skipped skill ${JSON.stringify(dirName)} in ${manifest.name}: unsafe directory name`
        );
        continue;
      }
      const skill = skillFromFrontmatter(dirName, frontmatter);
      if (!skill) {
        console.log(
          `  skipped skill ${JSON.stringify(dirName)} in ${manifest.name}: frontmatter does not conform to the Agent Skills spec`
        );
        continue;
      }
      skills.push(skill);
    }

    // MCP servers: parseMcpConfig already skips invalid servers non-fatally.
    const mcpServers: McpServerInput[] = [];
    if (entry.mcp !== undefined && entry.mcp !== null) {
      const { servers, skipped, mcpDisabled } = parseMcpConfig(entry.mcp);
      if (mcpDisabled) {
        console.log(
          `  mcp.json invalid in ${manifest.name} (${mcpDisabled}) — MCP disabled for this plugin per the spec`
        );
      }
      for (const s of skipped) {
        console.log(
          `  skipped MCP server "${s.serverId}" in ${manifest.name}: ${s.reason}`
        );
      }
      for (const s of servers) {
        mcpServers.push({
          serverId: s.serverId,
          transport: s.config.type,
          config: s.config,
        });
      }
    }

    const result = await upsertPlugin({
      manifestRaw: JSON.stringify(manifest, null, 2),
      manifest,
      repoUrl: entry.repoUrl,
      pluginPath: entry.pluginPath,
      repoStars: entry.repoStars,
      repoPushedAt: parsePushedAt(entry.repoPushedAt),
      skills,
      mcpServers,
    });

    seededPlugins++;
    seededSkills += skills.length;
    seededServers += mcpServers.length;
    console.log(
      `${result.created ? "created" : "updated"} ${manifest.name} (slug: ${result.slug})`
    );
  }

  if (skippedPlugins > 0) {
    console.log(`skipped ${skippedPlugins} invalid fixture entries`);
  }
  console.log(
    `seeded ${seededPlugins} plugins (${seededSkills} skills, ${seededServers} MCP servers)`
  );
  await prisma.$disconnect();
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`seed failed: ${message}`);
  await prisma.$disconnect();
  process.exit(1);
}
