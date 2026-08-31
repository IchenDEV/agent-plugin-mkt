import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REPOSITORY_SEARCH_QUERIES,
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
import {
  MARKETPLACE_NAME,
  buildClaudeMarketplace,
  buildCodexMarketplace,
  findUpstreamMarketplace,
  installCompatibility,
  installCommands,
  type MarketplacePluginInput,
} from "@/lib/marketplaces";

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

test("generated marketplaces expose only runtime-compatible plugins", () => {
  const plugins: MarketplacePluginInput[] = [
    {
      slug: "root-plugin",
      name: "root-plugin",
      repoUrl: "https://github.com/example/root-plugin",
      pluginPath: "",
      protocols: ["codex", "claude-code"],
    },
    {
      slug: "nested-plugin",
      name: "nested-plugin",
      repoUrl: "https://github.com/example/plugin-pack",
      pluginPath: "plugins/nested-plugin",
      protocols: ["claude-code"],
    },
    {
      slug: "generic-plugin",
      name: "generic-plugin",
      repoUrl: "https://github.com/example/generic-plugin",
      pluginPath: "",
      protocols: ["agent-plugins"],
    },
  ];

  const codex = buildCodexMarketplace(plugins);
  const claude = buildClaudeMarketplace(plugins);
  assert.deepEqual(
    codex.plugins.map((plugin) => plugin.name),
    [MARKETPLACE_NAME, "root-plugin"],
  );
  assert.deepEqual(
    claude.plugins.map((plugin) => plugin.name),
    [MARKETPLACE_NAME, "nested-plugin", "root-plugin"],
  );
  assert.deepEqual(codex.plugins[1]?.source, {
    source: "url",
    url: "https://github.com/example/root-plugin.git",
  });
  assert.deepEqual(claude.plugins[1]?.source, {
    source: "git-subdir",
    url: "example/plugin-pack",
    path: "plugins/nested-plugin",
  });
});

test("generated marketplaces never alias duplicate manifest names", () => {
  const plugins: MarketplacePluginInput[] = [
    {
      slug: "github-2",
      name: "github",
      repoUrl: "https://github.com/openai/plugins",
      pluginPath: "plugins/github",
      protocols: ["codex"],
    },
    {
      slug: "github-3",
      name: "github",
      repoUrl: "https://github.com/example/community-plugins",
      pluginPath: "plugins/github",
      protocols: ["codex"],
    },
  ];

  const codex = buildCodexMarketplace(plugins);
  assert.deepEqual(
    codex.plugins.map((plugin) => plugin.name),
    [MARKETPLACE_NAME, "github"],
  );
  assert.deepEqual(codex.plugins[1]?.source, {
    source: "git-subdir",
    url: "https://github.com/openai/plugins.git",
    path: "./plugins/github",
  });
});

test("Codex preserves the manifest name while Claude Code may use a marketplace alias", () => {
  const plugins: MarketplacePluginInput[] = [
    {
      slug: "shared-tools",
      name: "shared-tools",
      runtimeNames: {
        codex: "codex-tools",
        "claude-code": "claude-tools",
      },
      repoUrl: "https://github.com/example/shared-tools",
      pluginPath: "",
      protocols: ["codex", "claude-code"],
    },
  ];

  assert.deepEqual(
    buildCodexMarketplace(plugins).plugins.map((plugin) => plugin.name),
    [MARKETPLACE_NAME, "codex-tools"],
  );
  assert.deepEqual(
    buildClaudeMarketplace(plugins).plugins.map((plugin) => plugin.name),
    [MARKETPLACE_NAME, "shared-tools"],
  );
});

test("Claude Code keeps unique marketplace aliases for same-name manifests", () => {
  const plugins: MarketplacePluginInput[] = [
    {
      slug: "github",
      name: "github",
      repoUrl: "https://github.com/anthropics/claude-plugins-official",
      pluginPath: "plugins/github",
      protocols: ["claude-code"],
    },
    {
      slug: "github-3",
      name: "github",
      repoUrl: "https://github.com/motlin/claude-code-plugins",
      pluginPath: "plugins/github",
      protocols: ["claude-code"],
    },
  ];

  assert.deepEqual(
    buildClaudeMarketplace(plugins).plugins.map((plugin) => plugin.name),
    [MARKETPLACE_NAME, "github", "github-3"],
  );
});

test("upstream marketplaces namespace same-name plugins without aliases", () => {
  const marketplace = {
    name: "openai-plugins",
    plugins: [
      {
        name: "github",
        source: { source: "local", path: "./plugins/github" },
      },
    ],
  };

  assert.deepEqual(
    findUpstreamMarketplace(
      marketplace,
      "openai/plugins",
      "plugins/github",
      "github",
    ),
    { name: "openai-plugins", repository: "openai/plugins" },
  );
  assert.equal(
    findUpstreamMarketplace(
      marketplace,
      "openai/plugins",
      "plugins/github",
      "github-2",
    ),
    null,
  );
});

test("install commands add the shared marketplace before the selected plugin", () => {
  assert.equal(
    installCommands("root-plugin", "codex"),
    [
      "codex plugin marketplace add IchenDEV/agent-plugin-mkt",
      "codex plugin marketplace upgrade agent-plugin-marketplace",
      "codex plugin add root-plugin@agent-plugin-marketplace",
    ].join("\n"),
  );
  assert.match(
    installCommands("root-plugin", "claude-code"),
    /claude plugin install root-plugin@agent-plugin-marketplace$/,
  );
  assert.throws(() => installCommands("bad;command", "codex"));
});

test("install commands preserve the manifest name in an upstream namespace", () => {
  assert.equal(
    installCommands("github", "codex", {
      kind: "upstream",
      marketplace: { name: "openai-plugins", repository: "openai/plugins" },
    }),
    [
      "codex plugin marketplace add openai/plugins",
      "codex plugin marketplace upgrade openai-plugins",
      "codex plugin add github@openai-plugins",
    ].join("\n"),
  );
  assert.throws(() =>
    installCommands("github", "codex", {
      kind: "upstream",
      marketplace: {
        name: "openai-plugins",
        repository: "openai/plugins;echo-pwned",
      },
    }),
  );
});

test("legacy install selectors expose a deterministic compatibility migration", () => {
  assert.deepEqual(
    installCompatibility("github-2", "github", {
      kind: "upstream",
      marketplace: { name: "openai-curated", repository: "openai/plugins" },
    }),
    {
      status: "migrated",
      legacySelector: "github-2@agent-plugin-marketplace",
      replacementSelector: "github@openai-curated",
    },
  );
  assert.deepEqual(installCompatibility("github-3", "github"), {
    status: "source-only",
    legacySelector: "github-3@agent-plugin-marketplace",
    replacementSelector: null,
  });
  assert.deepEqual(installCompatibility("github", "github", { kind: "shared" }), {
    status: "unchanged",
    legacySelector: "github@agent-plugin-marketplace",
    replacementSelector: "github@agent-plugin-marketplace",
  });
});

test("repository discovery is protocol-based rather than vendor-special-cased", () => {
  assert.ok(DEFAULT_REPOSITORY_SEARCH_QUERIES.length > 0);
  assert.ok(
    DEFAULT_REPOSITORY_SEARCH_QUERIES.every(
      (query) => !query.includes("anthropics/") && !query.includes("openai/"),
    ),
  );
  assert.ok(
    DEFAULT_REPOSITORY_SEARCH_QUERIES.some((query) =>
      query.includes(".claude-plugin/plugin.json"),
    ),
  );
  assert.ok(
    DEFAULT_REPOSITORY_SEARCH_QUERIES.some((query) =>
      query.includes(".codex-plugin/plugin.json"),
    ),
  );
  assert.ok(
    DEFAULT_REPOSITORY_SEARCH_QUERIES.some((query) => query.includes("agent-plugins.org")),
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
