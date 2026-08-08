import { z } from "zod";

// Validation per the Agent Plugins v1 spec (https://agent-plugins.org/specification).
// Canonical schemas: https://agent-plugins.org/schemas/1.0.0/{plugin,mcp}.schema.json
// Mirrors the spec's failure boundaries: an invalid plugin.json rejects the plugin;
// invalid individual components (a skill, an MCP server) are skipped, not fatal.

export const PLUGIN_SCHEMA_URL =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA_URL =
  "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

// 1-64 chars, lowercase alphanumeric with single hyphen/period separators
// (no leading/trailing/consecutive separators).
export const PLUGIN_NAME_RE = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(PLUGIN_NAME_RE, {
    message:
      "name must be lowercase alphanumeric segments separated by single hyphens or periods",
  });

// author/repository may appear as plain strings or npm-style objects in the wild;
// accept both, normalize with helpers below.
const personSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional(),
  }),
]);

const linkSchema = z.union([
  z.string(),
  z.object({ type: z.string().optional(), url: z.string().optional() }),
]);

export const pluginManifestSchema = z
  .object({
    $schema: z.string(),
    name: nameSchema,
    version: z.string().optional(),
    description: z.string().optional(),
    author: personSchema.optional(),
    homepage: z.string().optional(),
    repository: linkSchema.optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    // Client-specific data under reverse-domain namespaces.
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  // The spec's schema is closed; unknown top-level fields are reported but
  // non-fatal. passthrough + a separate check lets callers surface warnings.
  .passthrough();

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

const KNOWN_MANIFEST_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

export function unknownManifestKeys(manifest: Record<string, unknown>): string[] {
  return Object.keys(manifest).filter((k) => !KNOWN_MANIFEST_KEYS.has(k));
}

const stdioServerSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
});

const httpServerSchema = z.object({
  type: z.literal("streamable-http"),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
});

const sseServerSchema = z.object({
  type: z.literal("sse"),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
});

export const mcpServerSchema = z.discriminatedUnion("type", [
  stdioServerSchema,
  httpServerSchema,
  sseServerSchema,
]);

export type McpServerConfig = z.infer<typeof mcpServerSchema>;

export const mcpConfigSchema = z.object({
  $schema: z.string().optional(),
  mcpServers: z.record(z.string(), z.unknown()),
});

/**
 * Parse an mcp.json body. Invalid individual servers are skipped (per the
 * spec's non-fatal component boundary) and reported in `skipped`.
 */
export function parseMcpConfig(json: unknown): {
  servers: { serverId: string; config: McpServerConfig }[];
  skipped: { serverId: string; reason: string }[];
} {
  const servers: { serverId: string; config: McpServerConfig }[] = [];
  const skipped: { serverId: string; reason: string }[] = [];
  const parsed = mcpConfigSchema.safeParse(json);
  if (!parsed.success) return { servers, skipped };
  for (const [serverId, raw] of Object.entries(parsed.data.mcpServers)) {
    const server = mcpServerSchema.safeParse(raw);
    if (server.success) servers.push({ serverId, config: server.data });
    else skipped.push({ serverId, reason: server.error.issues[0]?.message ?? "invalid" });
  }
  return { servers, skipped };
}

export function authorDisplayName(author: PluginManifest["author"]): string | null {
  if (!author) return null;
  if (typeof author === "string") return author;
  return author.name ?? null;
}

export function repositoryUrl(repository: PluginManifest["repository"]): string | null {
  if (!repository) return null;
  if (typeof repository === "string") return repository;
  return repository.url ?? null;
}
