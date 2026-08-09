export const PLUGIN_PROTOCOLS = ["codex", "claude-code", "agent-plugins"] as const;

export type PluginProtocol = (typeof PLUGIN_PROTOCOLS)[number];

export const PROTOCOL_LABELS: Record<PluginProtocol, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  "agent-plugins": "Agent Plugins",
};

export const DEFAULT_MANIFEST_PATHS: Record<PluginProtocol, string> = {
  codex: ".codex-plugin/plugin.json",
  "claude-code": ".claude-plugin/plugin.json",
  "agent-plugins": "plugin.json",
};

export interface ManifestLocation {
  protocol: PluginProtocol;
  /** Plugin directory inside the repository; empty means repository root. */
  pluginPath: string;
  /** Full manifest path inside the repository. */
  manifestPath: string;
}

/**
 * Resolve a GitHub code-search hit to its plugin root and runtime protocol.
 * Only canonical manifest locations are accepted.
 */
export function manifestLocation(filePath: string): ManifestLocation | null {
  const normalized = filePath.replace(/^\/+|\/+$/g, "");
  for (const protocol of PLUGIN_PROTOCOLS) {
    const suffix = DEFAULT_MANIFEST_PATHS[protocol];
    if (normalized === suffix) {
      return { protocol, pluginPath: "", manifestPath: normalized };
    }
    if (normalized.endsWith(`/${suffix}`)) {
      return {
        protocol,
        pluginPath: normalized.slice(0, -(suffix.length + 1)),
        manifestPath: normalized,
      };
    }
  }
  return null;
}

export function manifestPathForRoot(
  pluginPath: string,
  protocol: PluginProtocol,
): string {
  const relative = DEFAULT_MANIFEST_PATHS[protocol];
  return pluginPath ? `${pluginPath}/${relative}` : relative;
}

export function defaultMcpPathForRoot(
  pluginPath: string,
  protocol: PluginProtocol,
): string {
  const relative = protocol === "agent-plugins" ? "mcp.json" : ".mcp.json";
  return pluginPath ? `${pluginPath}/${relative}` : relative;
}
