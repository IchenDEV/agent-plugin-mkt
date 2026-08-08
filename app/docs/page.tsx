import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Card, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "API & MCP docs",
  description:
    "Read-only REST API and MCP endpoint for the Agent Plugin Marketplace: search plugins, fetch details, stats, and categories.",
};

// ---------------------------------------------------------------------------
// Local presentation helpers (no client JS on this page).

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-ink p-4 text-[13px] leading-relaxed text-gray-200">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

function MethodPath({ method, path }: { method: string; path: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-xs font-semibold text-white">
        {method}
      </span>
      <span className="font-mono text-sm font-medium">{path}</span>
    </p>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</h3>
  );
}

function DocTable({
  head,
  rows,
}: {
  head: [string, string, string];
  rows: [string, string, string][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-porcelain text-xs uppercase tracking-wider text-gray-500">
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([a, b, c]) => (
            <tr key={a} className="align-top">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{a}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{b}</td>
              <td className="px-4 py-2.5 text-gray-600">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({
  id,
  tab,
  method,
  path,
  title,
  children,
}: {
  id: string;
  tab: string;
  method: string;
  path: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-24">
      <Card tab={tab}>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
            <MethodPath method={method} path={path} />
          </div>
          {children}
        </div>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Example snippets. Static and realistic; trimmed for readability.

const EXAMPLE_ORIGIN = "https://plugin.market";

const listCurl = `curl "${EXAMPLE_ORIGIN}/api/v1/plugins?q=github&type=mcp&sort=stars&per_page=1"`;

const listResponse = `{
  "data": [
    {
      "slug": "acme-github-tools",
      "name": "github-tools",
      "version": "1.2.0",
      "description": "Skills and an MCP server for triaging GitHub issues.",
      "authorName": "Acme Labs",
      "license": "MIT",
      "keywords": ["github", "issues", "automation"],
      "repoUrl": "https://github.com/acme/github-tools",
      "repoStars": 412,
      "skillCount": 3,
      "mcpCount": 1,
      "transports": ["stdio"],
      "indexedAt": "2026-08-07T09:14:00.000Z"
    }
  ],
  "meta": { "page": 1, "per_page": 1, "total": 42, "total_pages": 42 }
}`;

const detailCurl = `curl ${EXAMPLE_ORIGIN}/api/v1/plugins/acme-github-tools`;

const detailResponse = `{
  "data": {
    "slug": "acme-github-tools",
    "name": "github-tools",
    "version": "1.2.0",
    "description": "Skills and an MCP server for triaging GitHub issues.",
    "authorName": "Acme Labs",
    "license": "MIT",
    "keywords": ["github", "issues", "automation"],
    "repoUrl": "https://github.com/acme/github-tools",
    "repoStars": 412,
    "skillCount": 3,
    "mcpCount": 1,
    "transports": ["stdio"],
    "indexedAt": "2026-08-07T09:14:00.000Z",
    "homepage": "https://acme.dev/github-tools",
    "repository": "https://github.com/acme/github-tools",
    "pluginPath": "plugins/github-tools",
    "repoPushedAt": "2026-08-05T17:42:11.000Z",
    "manifest": "{ \\"name\\": \\"github-tools\\", \\"version\\": \\"1.2.0\\", … }",
    "skills": [
      {
        "dirName": "triage-issue",
        "name": "triage-issue",
        "description": "Label and route a new GitHub issue."
      }
    ],
    "mcpServers": [
      {
        "serverId": "github",
        "transport": "stdio",
        "config": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "@acme/github-mcp"]
        }
      }
    ]
  }
}`;

const notFoundResponse = `{
  "error": { "code": "not_found", "message": "No plugin with slug \\"nope\\"." }
}`;

const statsCurl = `curl ${EXAMPLE_ORIGIN}/api/v1/stats`;

const statsResponse = `{
  "data": { "plugins": 137, "skills": 402, "mcpServers": 168, "categories": 54 }
}`;

const categoriesCurl = `curl ${EXAMPLE_ORIGIN}/api/v1/categories`;

const categoriesResponse = `{
  "data": [
    { "name": "github", "count": 21 },
    { "name": "productivity", "count": 17 },
    { "name": "search", "count": 12 }
  ]
}`;

const mcpJsonSnippet = `{
  "mcpServers": {
    "plugin-market": {
      "type": "streamable-http",
      "url": "${EXAMPLE_ORIGIN}/api/mcp"
    }
  }
}`;

const mcpInitializeCurl = `curl -X POST ${EXAMPLE_ORIGIN}/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "0.0.0" }
    }
  }'`;

const mcpToolCallCurl = `curl -X POST ${EXAMPLE_ORIGIN}/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_plugins",
      "arguments": { "query": "github", "type": "mcp", "per_page": 5 }
    }
  }'`;

// ---------------------------------------------------------------------------

const tocLinks: [string, string][] = [
  ["#intro", "Overview"],
  ["#list-plugins", "List plugins"],
  ["#get-plugin", "Get a plugin"],
  ["#stats", "Stats"],
  ["#categories", "Categories"],
  ["#mcp", "MCP endpoint"],
];

export default function DocsPage() {
  return (
    <Container className="py-10 sm:py-14">
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          API &amp; MCP docs
        </h1>
        <p className="mt-3 text-gray-600">
          Everything the marketplace shows is available programmatically: a read-only REST API for
          scripts and services, and an MCP endpoint so agents can search the registry directly.
        </p>
      </div>

      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 text-sm">
        {tocLinks.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 font-medium text-gray-600 hover:border-iris hover:text-iris"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-12 space-y-12">
        <section id="intro" aria-label="Overview" className="scroll-mt-24">
          <Card>
            <div className="space-y-4 p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold tracking-tight">Overview</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
                <li>
                  <strong className="font-semibold text-ink">Base URL</strong> — the API lives on
                  the same origin as this site; all paths below are relative. The curl examples use{" "}
                  <code className="font-mono text-xs">{EXAMPLE_ORIGIN}</code> — swap in your own
                  origin if you self-host.
                </li>
                <li>
                  <strong className="font-semibold text-ink">No auth, no rate limits yet</strong> —
                  every endpoint is public and read-only. Be reasonable; limits may come later.
                </li>
                <li>
                  <strong className="font-semibold text-ink">CORS</strong> — every response sends{" "}
                  <code className="font-mono text-xs">Access-Control-Allow-Origin: *</code>, so you
                  can call the API from browser code. Responses are cacheable for 60 seconds.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Errors</strong> — JSON body{" "}
                  <code className="font-mono text-xs">
                    {'{ "error": { "code", "message" } }'}
                  </code>{" "}
                  with status 400 or 404. Unlike the web UI, which ignores invalid filter values,
                  the API rejects them with{" "}
                  <code className="font-mono text-xs">400 bad_request</code> naming the valid
                  values.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Dates</strong> — all timestamps are
                  ISO 8601 strings (JSON Schema format{" "}
                  <code className="font-mono text-xs">date-time</code>).
                </li>
                <li>
                  <strong className="font-semibold text-ink">OpenAPI</strong> — a machine-readable
                  OpenAPI 3.1 description is served at{" "}
                  <a href="/api/openapi.json" className="font-mono text-xs text-iris hover:underline">
                    /api/openapi.json
                  </a>
                  .
                </li>
              </ul>
              <p className="text-sm text-gray-600">
                Indexed content (names, descriptions, manifests, URLs) comes from third-party GitHub
                repositories. Treat it as untrusted input in your own applications.
              </p>
            </div>
          </Card>
        </section>

        <Endpoint
          id="list-plugins"
          tab="/api/v1/plugins"
          method="GET"
          path="/api/v1/plugins"
          title="List plugins"
        >
          <p className="text-sm text-gray-600">
            Paginated plugin summaries. All parameters are optional; filters combine with AND.
          </p>
          <SubHeading>Query parameters</SubHeading>
          <DocTable
            head={["Param", "Type", "Description"]}
            rows={[
              ["q", "string", "Free-text query over name, description, keywords, and author (max 200 chars)."],
              ["category", "string", "Exact keyword match. Categories are manifest keywords — see /api/v1/categories."],
              ["type", "skills | mcp", "Only plugins containing this component type."],
              ["transport", "stdio | streamable-http | sse", "Only plugins with at least one MCP server using this transport."],
              ["sort", "stars | updated | recent", "stars = repo stars (default), updated = repo push date, recent = first indexed."],
              ["page", "integer", "1-based page number. Clamped to >= 1. Default 1."],
              ["per_page", "integer", "Results per page, clamped to 1..50. Default 24."],
            ]}
          />
          <p className="text-sm text-gray-600">
            An unknown value for <code className="font-mono text-xs">type</code>,{" "}
            <code className="font-mono text-xs">transport</code>, or{" "}
            <code className="font-mono text-xs">sort</code> returns{" "}
            <code className="font-mono text-xs">400 bad_request</code> listing the valid values.
          </p>
          <SubHeading>Example request</SubHeading>
          <CodeBlock>{listCurl}</CodeBlock>
          <SubHeading>Example response</SubHeading>
          <CodeBlock>{listResponse}</CodeBlock>
        </Endpoint>

        <Endpoint
          id="get-plugin"
          tab="/api/v1/plugins/{slug}"
          method="GET"
          path="/api/v1/plugins/{slug}"
          title="Get a plugin"
        >
          <p className="text-sm text-gray-600">
            Full detail for one plugin: every summary field plus homepage, repository, plugin path,
            the raw manifest, skills, and MCP server configs. Returns{" "}
            <code className="font-mono text-xs">404 not_found</code> for unknown slugs.
          </p>
          <SubHeading>Path parameters</SubHeading>
          <DocTable
            head={["Param", "Type", "Description"]}
            rows={[["slug", "string", "Registry slug, as returned by the list endpoint."]]}
          />
          <SubHeading>Example request</SubHeading>
          <CodeBlock>{detailCurl}</CodeBlock>
          <SubHeading>Example response</SubHeading>
          <CodeBlock>{detailResponse}</CodeBlock>
          <SubHeading>Not found</SubHeading>
          <CodeBlock>{notFoundResponse}</CodeBlock>
        </Endpoint>

        <Endpoint id="stats" tab="/api/v1/stats" method="GET" path="/api/v1/stats" title="Stats">
          <p className="text-sm text-gray-600">
            Registry totals: indexed plugins, skills, MCP servers, and distinct categories.
          </p>
          <SubHeading>Example request</SubHeading>
          <CodeBlock>{statsCurl}</CodeBlock>
          <SubHeading>Example response</SubHeading>
          <CodeBlock>{statsResponse}</CodeBlock>
        </Endpoint>

        <Endpoint
          id="categories"
          tab="/api/v1/categories"
          method="GET"
          path="/api/v1/categories"
          title="Categories"
        >
          <p className="text-sm text-gray-600">
            Categories are derived from manifest keywords, lowercased and ranked by how many plugins
            carry them (top 100). Use a category name as the{" "}
            <code className="font-mono text-xs">category</code> filter on the list endpoint.
          </p>
          <SubHeading>Example request</SubHeading>
          <CodeBlock>{categoriesCurl}</CodeBlock>
          <SubHeading>Example response</SubHeading>
          <CodeBlock>{categoriesResponse}</CodeBlock>
        </Endpoint>

        <section id="mcp" aria-label="MCP endpoint" className="scroll-mt-24">
          <Card tab="/api/mcp">
            <div className="space-y-4 p-5 sm:p-6">
              <div className="space-y-2">
                <h2 className="font-display text-xl font-bold tracking-tight">MCP endpoint</h2>
                <MethodPath method="POST" path="/api/mcp" />
              </div>
              <p className="text-sm text-gray-600">
                The registry is also an MCP server, so agents can search it as a tool. Transport is{" "}
                <code className="font-mono text-xs">streamable-http</code> and the server is
                stateless: each POST carries one JSON-RPC 2.0 message, there are no sessions, and
                the protocol version is <code className="font-mono text-xs">2025-06-18</code>. No
                authentication.
              </p>
              <SubHeading>Connect a client</SubHeading>
              <p className="text-sm text-gray-600">
                Add the endpoint to your client&apos;s <code className="font-mono text-xs">mcp.json</code>:
              </p>
              <CodeBlock>{mcpJsonSnippet}</CodeBlock>
              <SubHeading>Tools</SubHeading>
              <DocTable
                head={["Tool", "Arguments", "Description"]}
                rows={[
                  [
                    "search_plugins",
                    "query?, category?, type? (skills | mcp), transport? (stdio | streamable-http | sse), sort? (stars | updated | recent), page?, per_page?",
                    "Search the plugin index. Same filter semantics and clamping as GET /api/v1/plugins; the result JSON is paginated as items, total, page, perPage, totalPages.",
                  ],
                  [
                    "get_plugin",
                    "slug (required)",
                    "Full detail for one plugin, like GET /api/v1/plugins/{slug}.",
                  ],
                  ["get_stats", "none", "Registry totals, like GET /api/v1/stats."],
                ]}
              />
              <SubHeading>Example: initialize</SubHeading>
              <CodeBlock>{mcpInitializeCurl}</CodeBlock>
              <SubHeading>Example: call search_plugins</SubHeading>
              <CodeBlock>{mcpToolCallCurl}</CodeBlock>
            </div>
          </Card>
        </section>
      </div>
    </Container>
  );
}
