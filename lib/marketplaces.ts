import type { PluginProtocol } from "@/lib/protocols";

export const MARKETPLACE_NAME = "agent-plugin-marketplace";
export const MARKETPLACE_REPOSITORY = "IchenDEV/agent-plugin-mkt";
export const MARKETPLACE_REPOSITORY_URL =
  `https://github.com/${MARKETPLACE_REPOSITORY}`;

export type InstallRuntime = "codex" | "claude-code";

export const CODEX_UPSTREAM_MARKETPLACE_PATH = ".agents/plugins/marketplace.json";

export interface UpstreamMarketplace {
  name: string;
  /** GitHub owner/repository containing the marketplace file. */
  repository: string;
}

export type InstallSource =
  | { kind: "shared" }
  | { kind: "upstream"; marketplace: UpstreamMarketplace };

export interface InstallCompatibility {
  status: "unchanged" | "migrated" | "source-only";
  legacySelector: string;
  replacementSelector: string | null;
}

export interface MarketplacePluginInput {
  slug: string;
  /** Canonical display identity used by the registry. */
  name: string;
  /** Exact install identity declared by each runtime's source manifest. */
  runtimeNames?: Partial<Record<InstallRuntime, string>>;
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
const GITHUB_REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

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

function repositoryIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const shorthand = value.replace(/\.git$/, "");
  if (GITHUB_REPOSITORY_RE.test(shorthand)) return shorthand.toLowerCase();
  return githubRepository(value)?.toLowerCase() ?? null;
}

function localPluginPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalized === "." || normalized === "") return "";
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return normalized;
}

function sourceMatchesPlugin(
  source: unknown,
  repository: string,
  pluginPath: string,
): boolean {
  if (typeof source === "string") return localPluginPath(source) === pluginPath;
  if (typeof source !== "object" || source === null || Array.isArray(source)) return false;
  const value = source as Record<string, unknown>;
  if (value.source === "local") return localPluginPath(value.path) === pluginPath;
  if (value.source === "github") {
    return pluginPath === "" && repositoryIdentity(value.repo) === repository.toLowerCase();
  }
  if (value.source === "url") {
    return pluginPath === "" && repositoryIdentity(value.url) === repository.toLowerCase();
  }
  if (value.source === "git-subdir") {
    return (
      repositoryIdentity(value.url) === repository.toLowerCase() &&
      localPluginPath(value.path) === pluginPath
    );
  }
  return false;
}

/**
 * Match a plugin to a marketplace published by the same source repository.
 * The entry name must remain identical to the source manifest name; the
 * marketplace name provides the namespace for otherwise identical names.
 */
export function findUpstreamMarketplace(
  value: unknown,
  repository: string,
  pluginPath: string,
  pluginName: string,
): UpstreamMarketplace | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const marketplace = value as Record<string, unknown>;
  const name = marketplace.name;
  if (
    typeof name !== "string" ||
    name.length > 64 ||
    !PLUGIN_NAME_RE.test(name) ||
    !Array.isArray(marketplace.plugins)
  ) {
    return null;
  }
  const matches = marketplace.plugins.some((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const plugin = entry as Record<string, unknown>;
    return (
      plugin.name === pluginName &&
      sourceMatchesPlugin(plugin.source, repository, pluginPath)
    );
  });
  return matches ? { name, repository } : null;
}

function gitUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`;
}

export function runtimePluginName(
  plugin: Pick<MarketplacePluginInput, "name" | "runtimeNames">,
  runtime: InstallRuntime,
): string {
  return plugin.runtimeNames?.[runtime] ?? plugin.name;
}

function codexEntry(plugin: MarketplacePluginInput): CodexMarketplaceEntry {
  const name = runtimePluginName(plugin, "codex");
  assertInstallName(name);
  return {
    name,
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
  // Claude Code explicitly allows the marketplace entry to provide a public
  // install name that differs from plugin.json.
  const name = plugin.slug;
  assertInstallName(name);
  const repository = githubRepository(plugin.repoUrl);
  if (plugin.pluginPath) {
    return {
      name,
      source: {
        source: "git-subdir",
        url: repository ?? gitUrl(plugin.repoUrl),
        path: plugin.pluginPath,
      },
    };
  }
  return {
    name,
    source: repository
      ? { source: "github", repo: repository }
      : { source: "url", url: gitUrl(plugin.repoUrl) },
  };
}

function collisionRank(
  plugin: MarketplacePluginInput,
  runtime: InstallRuntime,
): number {
  const name = runtimePluginName(plugin, runtime);
  if (plugin.slug === plugin.name || plugin.slug === name) return 1;
  const match = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`).exec(
    plugin.slug,
  );
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Codex requires the marketplace entry name to match plugin.json, so it gets
 * one stable source per manifest name. Claude Code allows its marketplace
 * entry to provide a distinct public install name, so its slug aliases stay.
 */
export function selectMarketplacePlugins(
  plugins: MarketplacePluginInput[],
  runtime: InstallRuntime,
): MarketplacePluginInput[] {
  if (runtime === "claude-code") {
    return plugins
      .filter(
        (plugin) =>
          plugin.slug !== MARKETPLACE_NAME && plugin.protocols.includes(runtime),
      )
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }
  const compatible = plugins
    .filter(
      (plugin) =>
        runtimePluginName(plugin, runtime) !== MARKETPLACE_NAME &&
        plugin.protocols.includes(runtime),
    )
    .sort(
      (a, b) =>
        collisionRank(a, runtime) - collisionRank(b, runtime) ||
        a.repoUrl.localeCompare(b.repoUrl) ||
        a.pluginPath.localeCompare(b.pluginPath),
    );
  const selected = new Map<string, MarketplacePluginInput>();
  for (const plugin of compatible) {
    const name = runtimePluginName(plugin, runtime);
    if (!selected.has(name)) selected.set(name, plugin);
  }
  return [...selected.values()].sort((a, b) =>
    runtimePluginName(a, runtime).localeCompare(runtimePluginName(b, runtime)),
  );
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
      ...selectMarketplacePlugins(plugins, "codex").map(codexEntry),
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
      ...selectMarketplacePlugins(plugins, "claude-code").map(claudeEntry),
    ],
  };
}

export function installCommands(
  pluginName: string,
  runtime: InstallRuntime,
  source: InstallSource = { kind: "shared" },
): string {
  assertInstallName(pluginName);
  const marketplaceName =
    source.kind === "upstream" ? source.marketplace.name : MARKETPLACE_NAME;
  const repository =
    source.kind === "upstream"
      ? source.marketplace.repository
      : MARKETPLACE_REPOSITORY;
  assertInstallName(marketplaceName);
  if (!GITHUB_REPOSITORY_RE.test(repository)) {
    throw new Error(`Invalid marketplace repository: ${JSON.stringify(repository)}`);
  }
  const selector = `${pluginName}@${marketplaceName}`;
  if (runtime === "codex") {
    return [
      `codex plugin marketplace add ${repository}`,
      `codex plugin marketplace upgrade ${marketplaceName}`,
      `codex plugin add ${selector}`,
    ].join("\n");
  }
  return [
    `claude plugin marketplace add ${repository}`,
    `claude plugin marketplace update ${marketplaceName}`,
    `claude plugin install ${selector}`,
  ].join("\n");
}

/**
 * Preserve the old directory slug as a stable compatibility identifier while
 * exposing the exact selector clients should use after source-name validation.
 */
export function installCompatibility(
  legacySlug: string,
  pluginName: string,
  source?: InstallSource,
): InstallCompatibility {
  assertInstallName(legacySlug);
  assertInstallName(pluginName);
  const legacySelector = `${legacySlug}@${MARKETPLACE_NAME}`;
  if (!source) {
    return { status: "source-only", legacySelector, replacementSelector: null };
  }
  const marketplaceName =
    source.kind === "upstream" ? source.marketplace.name : MARKETPLACE_NAME;
  assertInstallName(marketplaceName);
  const replacementSelector = `${pluginName}@${marketplaceName}`;
  return {
    status: replacementSelector === legacySelector ? "unchanged" : "migrated",
    legacySelector,
    replacementSelector,
  };
}
