import { getAllPluginSummaries } from "@/lib/queries";
import { PROTOCOL_LABELS } from "@/lib/protocols";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const clipped = collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1).trimEnd()}…`;
  return clipped.replace(/([\\`*_[\]()<>#])/g, "\\$1");
}

export async function GET(): Promise<Response> {
  const plugins = await getAllPluginSummaries();
  const lines: string[] = [
    `# ${SITE_NAME}: full plugin catalog`,
    "",
    `Canonical catalog: ${absoluteUrl("/plugins")}`,
    "",
    "This export summarizes the current directory. Plugin data comes from third-party public GitHub repositories and should be verified against the linked source repository.",
    "",
    `Available plugins: ${plugins.length}.`,
    "",
    "## Plugin catalog",
  ];

  if (plugins.length === 0) {
    lines.push("", "No plugins are currently available.");
  } else {
    plugins.forEach((plugin, index) => {
      const components = [
        plugin.skillCount > 0
          ? `${plugin.skillCount} Skill${plugin.skillCount === 1 ? "" : "s"}`
          : null,
        plugin.mcpCount > 0
          ? `${plugin.mcpCount} MCP server${plugin.mcpCount === 1 ? "" : "s"}`
          : null,
      ].filter((value): value is string => value !== null);

      lines.push(
        "",
        `### ${index + 1}. ${oneLine(plugin.name, 100)}`,
        "",
        `- Directory page: ${absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`)}`,
        `- Source repository: ${plugin.repoUrl}`,
        `- Description: ${oneLine(plugin.description ?? "Description not provided.", 300)}`,
        `- Plugin formats: ${plugin.protocols.map((protocol) => PROTOCOL_LABELS[protocol]).join(", ")}`,
        `- Included components: ${components.join(", ") || "No Skills or MCP servers listed"}`,
        `- GitHub stars: ${plugin.repoStars}`,
        `- Added to directory: ${plugin.createdAt.toISOString()}`,
        `- Directory data refreshed: ${plugin.indexedAt.toISOString()}`,
      );
      if (plugin.authorName) lines.push(`- Author: ${oneLine(plugin.authorName, 120)}`);
      if (plugin.version) lines.push(`- Version: ${oneLine(plugin.version, 80)}`);
      if (plugin.license) lines.push(`- License: ${oneLine(plugin.license, 80)}`);
      if (plugin.keywords.length > 0) {
        lines.push(`- Keywords: ${plugin.keywords.map((keyword) => oneLine(keyword, 60)).join(", ")}`);
      }
      if (plugin.transports.length > 0) {
        lines.push(`- MCP transports: ${plugin.transports.join(", ")}`);
      }
    });
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Link: `<${absoluteUrl("/llms-full.txt")}>; rel="canonical"`,
    },
  });
}
