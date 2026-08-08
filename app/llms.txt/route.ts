import { searchPlugins } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Plain-text guide for LLM agents (llms.txt convention): what this site is,
// how to query it programmatically, and the current top plugins.

/** Collapse indexed (untrusted) text onto one line and cap its length. */
function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

export async function GET(): Promise<Response> {
  const top = await searchPlugins({ sort: "stars", perPage: 10 });

  const lines: string[] = [
    "# Agent Plugin Marketplace",
    "",
    "A community index of open-source Agent Plugins — skills and MCP servers packaged per the Agent Plugins specification, indexed from GitHub.",
    "",
    "## REST API (JSON, read-only, no auth)",
    "",
    "- GET /api/v1/plugins — search the index. Params: q (free text), category (keyword), type (skills|mcp), transport (stdio|streamable-http|sse), sort (stars|updated|recent), page, per_page (1-50, default 24).",
    "- GET /api/v1/plugins/{slug} — full detail for one plugin: manifest, skills, MCP server configs. No params.",
    "- GET /api/v1/categories — keyword-derived categories with plugin counts. No params.",
    "- GET /api/v1/stats — registry totals: plugins, skills, MCP servers, categories. No params.",
    "",
    "## MCP endpoint",
    "",
    "- POST /api/mcp — streamable-http transport, stateless (no session, single JSON-RPC messages).",
    "- Tools: search_plugins (query/category/type/transport/sort/page/per_page), get_plugin (slug), get_stats.",
    "",
    "## References",
    "",
    "- OpenAPI schema: /api/openapi.json",
    "- Agent Plugins specification: https://agent-plugins.org/specification",
    "",
    "Top plugins:",
  ];

  if (top.items.length === 0) {
    lines.push("(index is empty)");
  } else {
    for (const plugin of top.items) {
      const name = oneLine(plugin.name, 80);
      const description = oneLine(plugin.description ?? "No description in manifest.", 120);
      lines.push(`- ${name} — ${description} — /plugins/${encodeURIComponent(plugin.slug)}`);
    }
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
