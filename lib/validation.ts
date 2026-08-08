import { z } from "zod";

// Validation per the Agent Plugins v1 spec (https://agent-plugins.org/specification).
// Canonical schemas: https://agent-plugins.org/schemas/1.0.0/{plugin,mcp}.schema.json
// Mirrors the spec's failure boundaries: an invalid plugin.json rejects the plugin;
// invalid individual components (a skill, an MCP server) are skipped, not fatal;
// an invalid top-level mcp.json disables MCP for the plugin entirely.

export const PLUGIN_SCHEMA_URL =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA_URL =
  "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

// The official plugin.schema.json name pattern: 1-64 chars, lowercase
// alphanumeric plus "-"/".", must start and end alphanumeric, and only the
// sequences "--" and ".." are forbidden (mixed adjacent separators are legal).
export const PLUGIN_NAME_RE =
  /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(PLUGIN_NAME_RE, {
    message:
      "name must be lowercase alphanumeric with '-' or '.' separators, starting and ending alphanumeric, without '--' or '..'",
  });

// The official schema defines author as a closed object (name/email/url only)
// and repository as a plain string; any other shape is a fatal schema
// violation, so the manifest is rejected.
const personSchema = z.strictObject({
  name: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const pluginManifestSchema = z
  .object({
    $schema: z.literal(PLUGIN_SCHEMA_URL),
    name: nameSchema,
    version: z.string().optional(),
    description: z.string().optional(),
    author: personSchema.optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    // Client-specific data under reverse-domain namespaces. Per the spec, a
    // non-object `extensions` is NON-fatal (report and ignore — the
    // preprocess drops it), while a non-object namespace VALUE is fatal.
    extensions: z.preprocess(
      (value) => (value === undefined || isPlainObject(value) ? value : undefined),
      z.record(z.string(), z.looseObject({})).optional()
    ),
  })
  // The spec's schema is closed; unknown top-level fields are reported but
  // non-fatal. passthrough + manifestWarnings lets callers surface them.
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

/**
 * Non-fatal manifest issues the spec requires clients to report and ignore:
 * unknown top-level fields and a non-object `extensions` value. Call with the
 * raw parsed JSON after a successful pluginManifestSchema parse.
 */
export function manifestWarnings(raw: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const unknown = unknownManifestKeys(raw);
  if (unknown.length > 0) {
    warnings.push(`ignored unknown manifest field(s): ${unknown.join(", ")}`);
  }
  if ("extensions" in raw && !isPlainObject(raw.extensions)) {
    warnings.push('ignored non-object "extensions" field');
  }
  return warnings;
}

// --- MCP server entry validity (spec section 7.2.1) -------------------------

// command MUST be a bare executable name (no path separators) or a
// ./-relative plugin path; placeholders are not expanded in command.
const commandSchema = z
  .string()
  .min(1)
  .refine((command) => !command.includes("${"), {
    message: "command must not contain ${...} placeholders",
  })
  .refine((command) => /^(?:[^/\\]+|\.\/[^\\]+)$/.test(command), {
    message: "command must be a bare executable name or a ./-relative path",
  });

// cwd pattern from the official mcp.schema.json.
const CWD_RE = /^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/;

const cwdSchema = z.string().regex(CWD_RE, {
  message:
    'cwd must start with "./", "${PLUGIN_ROOT}", or "${PLUGIN_DATA}"',
});

// An env object containing PLUGIN_ROOT or PLUGIN_DATA keys makes the server
// entry invalid.
const envSchema = z
  .record(z.string(), z.string())
  .refine((env) => !("PLUGIN_ROOT" in env) && !("PLUGIN_DATA" in env), {
    message: "env must not define PLUGIN_ROOT or PLUGIN_DATA",
  });

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

// url MUST be an absolute HTTP(S) URL without userinfo or fragment; non-
// loopback hosts require HTTPS. No placeholder expansion happens in url.
const urlSchema = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "url must be an absolute URL" });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "url must use http or https" });
      return;
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: "custom", message: "url must not contain userinfo credentials" });
    }
    if (url.hash) {
      ctx.addIssue({ code: "custom", message: "url must not contain a fragment" });
    }
    if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
      ctx.addIssue({ code: "custom", message: "non-loopback url must use https" });
    }
  });

// Strict per the official schema (additionalProperties: false): an unknown
// field makes the entry invalid (skipped), never silently stripped.
const stdioServerSchema = z.strictObject({
  type: z.literal("stdio"),
  command: commandSchema,
  args: z.array(z.string()).optional(),
  env: envSchema.optional(),
  cwd: cwdSchema.optional(),
});

const httpServerSchema = z.strictObject({
  type: z.literal("streamable-http"),
  url: urlSchema,
  headers: z.record(z.string(), z.string()).optional(),
});

const sseServerSchema = z.strictObject({
  type: z.literal("sse"),
  url: urlSchema,
  headers: z.record(z.string(), z.string()).optional(),
});

export const mcpServerSchema = z.discriminatedUnion("type", [
  stdioServerSchema,
  httpServerSchema,
  sseServerSchema,
]);

export type McpServerConfig = z.infer<typeof mcpServerSchema>;

// Spec section 7.2.2: $schema is REQUIRED with this exact value and the top
// level is closed; any top-level violation disables MCP for the plugin.
export const mcpConfigSchema = z.strictObject({
  $schema: z.literal(MCP_SCHEMA_URL),
  mcpServers: z.record(z.string(), z.unknown()),
});

/**
 * Parse an mcp.json body. Invalid individual servers are skipped (per the
 * spec's non-fatal component boundary) and reported in `skipped`. A top-level
 * failure (missing/wrong $schema, unknown top-level key, wrong shape) sets
 * `mcpDisabled` — per the spec, clients disable MCP for the plugin entirely.
 */
export function parseMcpConfig(json: unknown): {
  servers: { serverId: string; config: McpServerConfig }[];
  skipped: { serverId: string; reason: string }[];
  mcpDisabled?: string;
} {
  const servers: { serverId: string; config: McpServerConfig }[] = [];
  const skipped: { serverId: string; reason: string }[] = [];
  const parsed = mcpConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join(".") : "mcp.json";
    return {
      servers,
      skipped,
      mcpDisabled: `${where}: ${issue?.message ?? "invalid"}`,
    };
  }
  for (const [serverId, raw] of Object.entries(parsed.data.mcpServers)) {
    const server = mcpServerSchema.safeParse(raw);
    if (server.success) servers.push({ serverId, config: server.data });
    else skipped.push({ serverId, reason: server.error.issues[0]?.message ?? "invalid" });
  }
  return { servers, skipped };
}

export function authorDisplayName(author: PluginManifest["author"]): string | null {
  return author?.name ?? null;
}

export function repositoryUrl(repository: PluginManifest["repository"]): string | null {
  return repository ?? null;
}
