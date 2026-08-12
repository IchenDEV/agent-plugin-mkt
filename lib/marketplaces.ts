import type { PluginProtocol } from "@/lib/protocols";

export const MARKETPLACE_NAME = "agent-plugin-marketplace";
export const MARKETPLACE_REPOSITORY = "IchenDEV/agent-plugin-mkt";
export const MARKETPLACE_REPOSITORY_URL =
  `https://github.com/${MARKETPLACE_REPOSITORY}`;

export type InstallRuntime = "codex" | "claude-code";

export interface MarketplacePluginInput {
  slug: string;
  repoUrl: string;
  pluginPath: string;
  protocols: PluginProtocol[];
}

interface CodexMarketplaceEntry {
  name: string;
  source:
    | { source: "local"; path: string }
    | { source: "url"; url: string }
    | { source: "git-subdir"; url: string; path: string };
  policy: {
    installation: "AVAILABLE";
    authentication: "ON_INSTALL";
  };
  category: "Developer Tools";
}

interface ClaudeMarketplaceEntry {
  name: string;
  source:
    | string
    | { source: "github"; repo: string }
    | { source: "url"; url: string }
    | { source: "git-subdir"; url: string; path: string };
  description?: string;
}

export interface CodexMarketplace {
  name: string;
  interface: { displayName: string };
  plugins: CodexMarketplaceEntry[];
}

export interface ClaudeMarketplace {
  name: string;
  description: string;
  owner: { name: string; url: string };
  plugins: ClaudeMarketplaceEntry[];
}

const PLUGIN_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertInstallName(name: string): void {
  if (name.length > 64 || !PLUGIN_NAME_RE.test(name)) {
    throw new Error(`Invalid marketplace plugin name: ${JSON.stringify(name)}`);
  }
}

function githubRepository(repoUrl: string): string | null {
  try {
    const url = new URL(repoUrl);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const segments = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    return segments.length === 2 ? `${segments[0]}/${segments[1]}` : null;
  } catch {
    return null;
  }
}

function gitUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`;
}

function codexEntry(plugin: MarketplacePluginInput): CodexMarketplaceEntry {
  assertInstallName(plugin.slug);
  return {
    name: plugin.slug,
    source: plugin.pluginPath
      ? {
          source: "git-subdir",
          url: gitUrl(plugin.repoUrl),
          path: `./${plugin.pluginPath}`,
        }
      : { source: "url", url: gitUrl(plugin.repoUrl) },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Developer Tools",
  };
}

function claudeEntry(plugin: MarketplacePluginInput): ClaudeMarketplaceEntry {
  assertInstallName(plugin.slug);
  const repository = githubRepository(plugin.repoUrl);
  if (plugin.pluginPath) {
    return {
      name: plugin.slug,
      source: {
        source: "git-subdir",
        url: repository ?? gitUrl(plugin.repoUrl),
        path: plugin.pluginPath,
      },
    };
  }
  return {
    name: plugin.slug,
    source: repository
      ? { source: "github", repo: repository }
      : { source: "url", url: gitUrl(plugin.repoUrl) },
  };
}

function runtimePlugins(
  plugins: MarketplacePluginInput[],
  runtime: InstallRuntime,
): MarketplacePluginInput[] {
  return plugins
    .filter(
      (plugin) =>
        plugin.slug !== MARKETPLACE_NAME && plugin.protocols.includes(runtime),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function buildCodexMarketplace(
  plugins: MarketplacePluginInput[],
): CodexMarketplace {
  return {
    name: MARKETPLACE_NAME,
    interface: { displayName: "Agent Plugin Marketplace" },
    plugins: [
      {
        name: MARKETPLACE_NAME,
        source: { source: "local", path: "./" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      },
      ...runtimePlugins(plugins, "codex").map(codexEntry),
    ],
  };
}

export function buildClaudeMarketplace(
  plugins: MarketplacePluginInput[],
): ClaudeMarketplace {
  return {
    name: MARKETPLACE_NAME,
    description:
      "Install source-indexed Claude Code plugins discovered by Agent Plugin Marketplace.",
    owner: { name: "IchenDEV", url: "https://github.com/IchenDEV" },
    plugins: [
      {
        name: MARKETPLACE_NAME,
        source: ".",
        description:
          "Search a registry of Codex and Claude Code plugins through MCP.",
      },
      ...runtimePlugins(plugins, "claude-code").map(claudeEntry),
    ],
  };
}

export function installCommands(
  pluginName: string,
  runtime: InstallRuntime,
): string {
  assertInstallName(pluginName);
  const selector = `${pluginName}@${MARKETPLACE_NAME}`;
  if (runtime === "codex") {
    return [
      `codex plugin marketplace add ${MARKETPLACE_REPOSITORY}`,
      `codex plugin marketplace upgrade ${MARKETPLACE_NAME}`,
      `codex plugin add ${selector}`,
    ].join("\n");
  }
  return [
    `claude plugin marketplace add ${MARKETPLACE_REPOSITORY}`,
    `claude plugin marketplace update ${MARKETPLACE_NAME}`,
    `claude plugin install ${selector}`,
  ].join("\n");
}
