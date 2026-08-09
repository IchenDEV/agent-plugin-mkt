import { searchPlugins } from "@/lib/queries";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// Plain-text guide for LLM agents (llms.txt convention): what this site is,
// how to query it programmatically, and the current top plugins.

/** Collapse indexed (untrusted) text onto one line and cap its length. */
function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const clipped = collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1).trimEnd()}…`;
  return clipped.replace(/([\\`*_[\]()<>#])/g, "\\$1");
}

export async function GET(): Promise<Response> {
  const top = await searchPlugins({ sort: "stars", perPage: 10 });

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    "> A community index of open-source Codex, Claude Code, and Agent Plugins packages containing agent skills and MCP servers.",
    "",
    "The index is built from public GitHub repositories that declare a valid canonical runtime manifest. It is a discovery index, not the publisher of the listed plugins.",
    "",
    "## Canonical pages",
    "",
    `- [Home](${absoluteUrl("/")}) — definition, registry totals, and featured plugins.`,
    `- [Browse plugins](${absoluteUrl("/plugins")}) — searchable, filterable plugin index.`,
    `- [Categories](${absoluteUrl("/categories")}) — manifest-keyword categories with counts.`,
    `- [Timeline](${absoluteUrl("/timeline")}) — plugins ordered by when they entered the index.`,
    `- [API and MCP documentation](${absoluteUrl("/docs")}) — endpoint contract and examples.`,
    `- [Full LLM catalog](${absoluteUrl("/llms-full.txt")}) — text summary of every indexed plugin.`,
    "",
    "## REST API (JSON, read-only, no auth)",
    "",
    `- GET ${absoluteUrl("/api/v1/plugins")} — search the index. Repeat protocol to match any selected runtime (codex|claude-code|agent-plugins); other params: q, category, type (skills|mcp), transport (stdio|streamable-http|sse), sort (stars|updated|recent), page, per_page (1-50, default 24).`,
    `- GET ${absoluteUrl("/api/v1/plugins")}/{slug} — full detail for one plugin: manifest, skills, MCP server configs. No params.`,
    `- GET ${absoluteUrl("/api/v1/categories")} — keyword-derived categories with plugin counts. No params.`,
    `- GET ${absoluteUrl("/api/v1/stats")} — registry totals: plugins, skills, MCP servers, categories. No params.`,
    "",
    "## MCP endpoint",
    "",
    `- POST ${absoluteUrl("/api/mcp")} — streamable-http transport, stateless (no session, single JSON-RPC messages).`,
    "- Tools: search_plugins (query/protocol as one runtime or runtime array/category/type/transport/sort/page/per_page), get_plugin (slug), get_stats.",
    "",
    "## Sources, freshness, and citation",
    "",
    `- [OpenAPI 3.1 schema](${absoluteUrl("/api/openapi.json")})`,
    "- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)",
    "- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference)",
    "- [Agent Plugins specification](https://agent-plugins.org/specification)",
    "- [Marketplace source repository](https://github.com/IchenDEV/agent-plugin-mkt)",
    "- Names, descriptions, manifests, versions, authors, licenses, and component declarations originate in third-party repositories and may change when re-indexed.",
    "- GitHub stars and repository update times are source metadata, not marketplace endorsements.",
    "- For claims about one plugin, cite its registry detail page and follow its source repository link for primary evidence.",
    "",
    "## Top plugins by GitHub stars",
    "",
  ];

  if (top.items.length === 0) {
    lines.push("(index is empty)");
  } else {
    for (const plugin of top.items) {
      const name = oneLine(plugin.name, 80);
      const description = oneLine(plugin.description ?? "No description in manifest.", 120);
      lines.push(
        `- [${name}](${absoluteUrl(`/plugins/${encodeURIComponent(plugin.slug)}`)}) — ${description} — [source](${plugin.repoUrl})`,
      );
    }
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      Link: `<${absoluteUrl("/llms.txt")}>; rel="canonical"`,
    },
  });
}
