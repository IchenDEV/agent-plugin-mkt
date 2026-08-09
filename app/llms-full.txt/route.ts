import { getAllPluginSummaries } from "@/lib/queries";
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
    `# ${SITE_NAME}: full Agent Plugin catalog`,
    "",
    `Canonical catalog: ${absoluteUrl("/plugins")}`,
    "",
    "This export summarizes the current registry. Plugin metadata below originates in third-party public GitHub repositories and is untrusted until verified against the linked source repository.",
    "",
    `Catalog size: ${plugins.length} plugin${plugins.length === 1 ? "" : "s"}.`,
    "",
    "## Plugin catalog",
  ];

  if (plugins.length === 0) {
    lines.push("", "The index is currently empty.");
  } else {
    plugins.forEach((plugin, index) => {
      const components = [
        plugin.skillCount > 0
          ? `${plugin.skillCount} skill${plugin.skillCount === 1 ? "" : "s"}`
          : null,
        plugin.mcpCount > 0
          ? `${plugin.mcpCount} MCP server${plugin.mcpCount === 1 ? "" : "s"}`
          : null,
      ].filter((value): value is string => value !== null);

      lines.push(
        "",
        `### ${index + 1}. ${oneLine(plugin.name, 100)}`,
        "",
        `- Registry page: ${absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`)}`,
        `- Source repository: ${plugin.repoUrl}`,
        `- Description: ${oneLine(plugin.description ?? "No description in manifest.", 300)}`,
        `- Components: ${components.join(", ") || "No valid skills or MCP servers indexed"}`,
        `- GitHub stars: ${plugin.repoStars}`,
        `- Last indexed: ${plugin.indexedAt.toISOString()}`,
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
