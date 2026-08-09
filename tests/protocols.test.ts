import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRIORITY_REPOSITORIES,
  manifestFilesFromTree,
} from "@/lib/github";
import { skillFromFrontmatter } from "@/lib/indexing";
import { parseEnums, PROTOCOLS } from "@/lib/api-helpers";
import {
  MCP_SCHEMA_URL,
  PLUGIN_SCHEMA_URL,
  parseMcpConfig,
  parsePluginManifest,
} from "@/lib/validation";
import { manifestLocation } from "@/lib/protocols";

test("canonical manifest paths resolve to one plugin root", () => {
  assert.deepEqual(manifestLocation("plugins/demo/.codex-plugin/plugin.json"), {
    protocol: "codex",
    pluginPath: "plugins/demo",
    manifestPath: "plugins/demo/.codex-plugin/plugin.json",
  });
  assert.equal(
    manifestLocation("plugins/demo/.claude-plugin/plugin.json")?.pluginPath,
    "plugins/demo",
  );
  assert.equal(manifestLocation("plugins/demo/plugin.json")?.protocol, "agent-plugins");
  assert.equal(manifestLocation("package.json"), null);
});

test("first-party Claude repositories bypass incomplete GitHub Code Search", () => {
  assert.ok(DEFAULT_PRIORITY_REPOSITORIES.includes("anthropics/claude-code"));
  assert.ok(
    DEFAULT_PRIORITY_REPOSITORIES.includes("anthropics/claude-plugins-official"),
  );
  assert.ok(
    DEFAULT_PRIORITY_REPOSITORIES.includes("anthropics/knowledge-work-plugins"),
  );

  assert.deepEqual(
    manifestFilesFromTree([
      {
        path: "plugins/code-review/.claude-plugin/plugin.json",
        type: "blob",
        sha: "claude-sha",
      },
      {
        path: "plugins/review/.codex-plugin/plugin.json",
        type: "blob",
        sha: "codex-sha",
      },
      {
        path: ".claude-plugin/marketplace.json",
        type: "blob",
        sha: "marketplace-sha",
      },
      { path: "plugin.json", type: "tree", sha: "tree-sha" },
    ]),
    [
      {
        name: "plugin.json",
        path: "plugins/code-review/.claude-plugin/plugin.json",
        sha: "claude-sha",
      },
      {
        name: "plugin.json",
        path: "plugins/review/.codex-plugin/plugin.json",
        sha: "codex-sha",
      },
    ],
  );
});

test("Codex and Claude Code manifests use their runtime minimums", () => {
  const codex = parsePluginManifest(
    { name: "review-tools", version: "1.0.0", description: "Review code" },
    "codex",
  );
  assert.equal(codex.ok, true);

  const claude = parsePluginManifest({ name: "review-tools" }, "claude-code");
  assert.equal(claude.ok, true);

  const invalid = parsePluginManifest({ name: "Review Tools" }, "codex");
  assert.equal(invalid.ok, false);
});

test("repeatable protocol parameters are deduplicated and accept comma-separated values", () => {
  const parsed = parseEnums(
    ["codex", "claude-code,agent-plugins", "codex"],
    "protocol",
    PROTOCOLS,
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, ["codex", "claude-code", "agent-plugins"]);
  }
});

test("Agent Plugins v1 keeps its exact schema requirement", () => {
  assert.equal(
    parsePluginManifest({ name: "review-tools" }, "agent-plugins").ok,
    false,
  );
  assert.equal(
    parsePluginManifest(
      { $schema: PLUGIN_SCHEMA_URL, name: "review-tools" },
      "agent-plugins",
    ).ok,
    true,
  );
});

test("portable MCP wrappers normalize HTTP and inferred stdio transports", () => {
  const parsed = parseMcpConfig(
    {
      mcpServers: {
        remote: { type: "http", url: "https://example.com/mcp" },
        local: { command: "node", args: ["server.js"] },
      },
    },
    "claude-code",
  );
  assert.deepEqual(
    parsed.servers.map((server) => [server.serverId, server.config.type]),
    [
      ["remote", "streamable-http"],
      ["local", "stdio"],
    ],
  );
});

test("Agent Plugins MCP still rejects an invalid top level", () => {
  const parsed = parseMcpConfig(
    { $schema: MCP_SCHEMA_URL, mcpServers: {}, extra: true },
    "agent-plugins",
  );
  assert.match(parsed.mcpDisabled ?? "", /unrecognized key/i);
});

test("Claude Code skills may derive the name from the directory", () => {
  const skill = skillFromFrontmatter(
    "review",
    { description: "Review a change" },
    { allowDerivedName: true },
  );
  assert.equal(skill?.name, "review");
  assert.equal(skill?.path, "skills/review/SKILL.md");
  assert.equal(
    skillFromFrontmatter("review", { description: "Review a change" }),
    null,
  );
});
