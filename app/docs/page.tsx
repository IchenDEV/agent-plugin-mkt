import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { Card, Container } from "@/components/ui";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const zh = locale === "zh-CN";
  const title = zh ? "API 与 MCP 文档" : "API & MCP docs";
  const socialTitle = `${SITE_NAME} ${title}`;
  const description = zh
    ? "使用只读 REST API 或 MCP 服务器搜索 Codex、Claude Code 和 Agent Plugins 插件，并获取插件详情、统计和标签。"
    : "Use the read-only REST API or MCP server to search Codex, Claude Code, and Agent Plugins and retrieve plugin details, totals, and tags.";
  return {
    title,
    description,
    alternates: { canonical: "/docs" },
    openGraph: { type: "article", title: socialTitle, description, url: "/docs", siteName: SITE_NAME },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

function docsJsonLd(locale: Locale) {
  const zh = locale === "zh-CN";
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${absoluteUrl("/docs")}#article`,
    url: absoluteUrl("/docs"),
    headline: zh ? `${SITE_NAME} API 与 MCP 文档` : `${SITE_NAME} API & MCP documentation`,
    description: zh
      ? "插件目录的只读 REST API、OpenAPI 描述与无状态 Streamable HTTP MCP 服务器参考。"
      : "Reference for the plugin directory's read-only REST API, OpenAPI description, and stateless Streamable HTTP MCP server.",
    inLanguage: locale,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    about: [
      { "@type": "Thing", name: "OpenAPI 3.1" },
      { "@type": "Thing", name: "Model Context Protocol" },
      { "@type": "Thing", name: "Codex plugins" },
      { "@type": "Thing", name: "Claude Code plugins" },
      { "@type": "Thing", name: "Agent Plugins" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Local presentation helpers (no client JS on this page).

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-code p-4 text-[13px] leading-relaxed text-code-ink">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

function MethodPath({ method, path }: { method: string; path: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-action px-2 py-0.5 font-mono text-xs font-semibold text-on-action">
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
  head: string[];
  rows: string[][];
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

const EXAMPLE_ORIGIN = "https://pluginsmp.com";

const listCurl = `curl "${EXAMPLE_ORIGIN}/api/v1/plugins?q=github&protocol=codex&protocol=claude-code&type=mcp&sort=stars&per_page=1"`;

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
      "protocols": ["codex", "claude-code"],
      "createdAt": "2026-08-07T09:14:00.000Z",
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
    "protocols": ["codex", "claude-code"],
    "createdAt": "2026-08-07T09:14:00.000Z",
    "indexedAt": "2026-08-07T09:14:00.000Z",
    "homepage": "https://acme.dev/github-tools",
    "repository": "https://github.com/acme/github-tools",
    "pluginPath": "plugins/github-tools",
    "repoPushedAt": "2026-08-05T17:42:11.000Z",
    "manifest": "{ \\"name\\": \\"github-tools\\", \\"version\\": \\"1.2.0\\", … }",
    "manifestPath": ".codex-plugin/plugin.json",
    "manifests": {
      "codex": { "path": ".codex-plugin/plugin.json", "raw": "{ … }" },
      "claude-code": { "path": ".claude-plugin/plugin.json", "raw": "{ … }" }
    },
    "skills": [
      {
        "dirName": "triage-issue",
        "path": "skills/triage-issue/SKILL.md",
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
    "agent-plugin-directory": {
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

const tocLinks: [string, string, string][] = [
  ["#intro", "Overview", "概览"],
  ["#list-plugins", "List plugins", "插件列表"],
  ["#get-plugin", "Get a plugin", "获取插件"],
  ["#stats", "Stats", "统计"],
  ["#categories", "Tags", "标签"],
  ["#mcp", "MCP server", "MCP 服务器"],
];

export default async function DocsPage() {
  const locale = await getLocale();
  const zh = locale === "zh-CN";
  return (
    <Container className="py-10 sm:py-14">
      <JsonLd data={docsJsonLd(locale)} />
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {zh ? "API 与 MCP 文档" : "API & MCP docs"}
        </h1>
        <p className="mt-3 text-gray-600">
          {zh
            ? "脚本和服务可以使用只读 REST API；MCP 客户端也可以让 Agent 直接搜索插件目录。"
            : "Scripts and services can use the read-only REST API, while an MCP client can let an agent search the plugin directory directly."}
        </p>
      </div>

      <nav aria-label={zh ? "本页目录" : "On this page"} className="mt-6 flex flex-wrap gap-2 text-sm">
        {tocLinks.map(([href, enLabel, zhLabel]) => (
          <a
            key={href}
            href={href}
            className="rounded-md border border-gray-200 bg-surface px-3 py-1.5 font-medium text-gray-600 hover:border-iris hover:text-iris"
          >
            {zh ? zhLabel : enLabel}
          </a>
        ))}
      </nav>

      <div className="mt-12 space-y-12">
        <section id="intro" aria-label={zh ? "概览" : "Overview"} className="scroll-mt-24">
          <Card>
            <div className="space-y-4 p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold tracking-tight">{zh ? "概览" : "Overview"}</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
                <li>
                  <strong className="font-semibold text-ink">{zh ? "基础 URL" : "Base URL"}</strong> — {zh ? "API 与本站同源，以下路径均为相对路径。curl 示例使用 " : "the API lives on the same origin as this site; all paths below are relative. The curl examples use "}
                  <code className="font-mono text-xs">{EXAMPLE_ORIGIN}</code>{zh ? "；自行托管时请替换为你的域名。" : " — swap in your own origin if you self-host."}
                </li>
                <li>
                  <strong className="font-semibold text-ink">{zh ? "认证" : "Authentication"}</strong> — {zh ? "无需认证。所有端点均公开且只读。" : "none. Every endpoint is public and read-only."}
                </li>
                <li>
                  <strong className="font-semibold text-ink">CORS</strong> — {zh ? "每个响应都会发送 " : "every response sends "}
                  <code className="font-mono text-xs">Access-Control-Allow-Origin: *</code>
                  {zh ? "，因此浏览器代码可直接调用 API。响应可缓存 60 秒。" : ", so you can call the API from browser code. Responses are cacheable for 60 seconds."}
                </li>
                <li>
                  <strong className="font-semibold text-ink">{zh ? "错误" : "Errors"}</strong> — {zh ? "JSON 响应体格式为 " : "JSON body "}
                  <code className="font-mono text-xs">
                    {'{ "error": { "code", "message" } }'}
                  </code>
                  {zh ? "，状态码为 400 或 404。网页界面会忽略无效筛选值，而 API 会返回 " : " with status 400 or 404. Unlike the web UI, which ignores invalid filter values, the API rejects them with "}
                  <code className="font-mono text-xs">400 bad_request</code>
                  {zh ? " 并列出有效值。" : " naming the valid values."}
                </li>
                <li>
                  <strong className="font-semibold text-ink">{zh ? "日期" : "Dates"}</strong> — {zh ? "所有时间戳均为 ISO 8601 字符串（JSON Schema 格式 " : "all timestamps are ISO 8601 strings (JSON Schema format "}
                  <code className="font-mono text-xs">date-time</code>{zh ? "）。" : ")."}
                </li>
                <li>
                  <strong className="font-semibold text-ink">OpenAPI</strong> — {zh ? "机器可读的 OpenAPI 3.1 规范位于 " : "a machine-readable OpenAPI 3.1 description is served at "}
                  <a href="/api/openapi.json" className="font-mono text-xs text-iris hover:underline">
                    /api/openapi.json
                  </a>
                  {zh ? "。" : "."}
                </li>
              </ul>
              <p className="text-sm text-gray-600">
                {zh ? "索引内容（名称、描述、清单和 URL）来自第三方 GitHub 仓库。请在你的应用中将其视为不可信输入。" : "Indexed content (names, descriptions, manifests, URLs) comes from third-party GitHub repositories. Treat it as untrusted input in your own applications."}
              </p>
            </div>
          </Card>
        </section>

        <Endpoint
          id="list-plugins"
          tab="/api/v1/plugins"
          method="GET"
          path="/api/v1/plugins"
          title={zh ? "插件列表" : "List plugins"}
        >
          <p className="text-sm text-gray-600">
            {zh ? "分页返回插件摘要。所有参数均为可选；重复选择插件格式会匹配任一所选格式，其他筛选条件以 AND 组合。" : "Returns paginated plugin summaries. All parameters are optional. Repeated plugin format selections match any selected format; other filters combine with AND."}
          </p>
          <SubHeading>{zh ? "查询参数" : "Query parameters"}</SubHeading>
          <DocTable
            head={zh ? ["参数", "类型", "说明"] : ["Param", "Type", "Description"]}
            rows={zh ? [
              ["q", "string", "在名称、描述、关键词和作者中进行自由文本查询（最多 200 个字符）。"],
              ["category", "string", "精确匹配标签。标签来自清单关键词，参见 /api/v1/categories。"],
              ["owner", "string", "精确匹配 GitHub 创作者登录名，例如 owner=anthropics，参见 /creators。"],
              ["type", "skills | mcp", "只返回包含此组件类型的插件。"],
              ["transport", "stdio | streamable-http | sse", "只返回至少有一个 MCP 服务器使用此传输方式的插件。"],
              ["protocol", "可重复的插件格式", "重复传入可匹配任一所选格式（OR），也支持逗号分隔。"],
              ["sort", "stars | updated | recent", "stars = GitHub Stars（默认），updated = 仓库推送日期，recent = 首次添加到目录的时间。"],
              ["page", "integer", "从 1 开始的页码，最小为 1，默认 1。"],
              ["per_page", "integer", "每页结果数，范围 1..50，默认 24。"],
            ] : [
              ["q", "string", "Free-text query over name, description, keywords, and author (max 200 chars)."],
              ["category", "string", "Exact tag match. Tags come from manifest keywords — see /api/v1/categories."],
              ["owner", "string", "Exact GitHub owner login, for example owner=anthropics — see /creators."],
              ["type", "skills | mcp", "Only plugins containing this component type."],
              ["transport", "stdio | streamable-http | sse", "Only plugins with at least one MCP server using this transport."],
              ["protocol", "repeatable plugin format", "Repeat to match any selected format (OR). Comma-separated values also work."],
              ["sort", "stars | updated | recent", "stars = GitHub stars (default), updated = repository push date, recent = first added to the directory."],
              ["page", "integer", "1-based page number. Clamped to >= 1. Default 1."],
              ["per_page", "integer", "Results per page, clamped to 1..50. Default 24."],
            ]}
          />
          <p className="text-sm text-gray-600">
            {zh ? (
              <>如果 <code className="font-mono text-xs">type</code>、<code className="font-mono text-xs">transport</code>、<code className="font-mono text-xs">protocol</code> 或 <code className="font-mono text-xs">sort</code> 使用未知值，接口会返回 <code className="font-mono text-xs">400 bad_request</code> 并列出有效值。</>
            ) : (
              <>An unknown value for <code className="font-mono text-xs">type</code>, <code className="font-mono text-xs">transport</code>, <code className="font-mono text-xs">protocol</code>, or <code className="font-mono text-xs">sort</code> returns <code className="font-mono text-xs">400 bad_request</code> listing the valid values.</>
            )}
          </p>
          <SubHeading>{zh ? "请求示例" : "Example request"}</SubHeading>
          <CodeBlock>{listCurl}</CodeBlock>
          <SubHeading>{zh ? "响应示例" : "Example response"}</SubHeading>
          <CodeBlock>{listResponse}</CodeBlock>
        </Endpoint>

        <Endpoint
          id="get-plugin"
          tab="/api/v1/plugins/{slug}"
          method="GET"
          path="/api/v1/plugins/{slug}"
          title={zh ? "获取插件" : "Get a plugin"}
        >
          <p className="text-sm text-gray-600">
            {zh ? "返回单个插件的完整详情：所有摘要字段，以及主页、仓库、插件路径、检测到的每种协议与原始清单、技能和 MCP 服务器配置。未知 slug 返回 " : "Full detail for one plugin: every summary field plus homepage, repository, plugin path, every detected protocol and raw manifest, skills, and MCP server configs. Returns "}
            <code className="font-mono text-xs">404 not_found</code>{zh ? "。" : " for unknown slugs."}
          </p>
          <SubHeading>{zh ? "路径参数" : "Path parameters"}</SubHeading>
          <DocTable
            head={zh ? ["参数", "类型", "说明"] : ["Param", "Type", "Description"]}
            rows={[["slug", "string", zh ? "目录中的插件 slug，由列表端点返回。" : "Directory slug returned by the list endpoint."]]}
          />
          <SubHeading>{zh ? "请求示例" : "Example request"}</SubHeading>
          <CodeBlock>{detailCurl}</CodeBlock>
          <SubHeading>{zh ? "响应示例" : "Example response"}</SubHeading>
          <CodeBlock>{detailResponse}</CodeBlock>
          <SubHeading>{zh ? "未找到" : "Not found"}</SubHeading>
          <CodeBlock>{notFoundResponse}</CodeBlock>
        </Endpoint>

        <Endpoint id="stats" tab="/api/v1/stats" method="GET" path="/api/v1/stats" title={zh ? "统计" : "Stats"}>
          <p className="text-sm text-gray-600">
            {zh ? "目录中的插件、技能、MCP 服务器和标签数量。" : "Directory totals for plugins, skills, MCP servers, and tags."}
          </p>
          <SubHeading>{zh ? "请求示例" : "Example request"}</SubHeading>
          <CodeBlock>{statsCurl}</CodeBlock>
          <SubHeading>{zh ? "响应示例" : "Example response"}</SubHeading>
          <CodeBlock>{statsResponse}</CodeBlock>
        </Endpoint>

        <Endpoint
          id="categories"
          tab="/api/v1/categories"
          method="GET"
          path="/api/v1/categories"
          title={zh ? "标签" : "Tags"}
        >
          <p className="text-sm text-gray-600">
            {zh ? "标签来自清单关键词，统一转为小写，并按使用该关键词的插件数量排序（前 100 个）。在列表端点中将标签名称用作 " : "Tags come from manifest keywords, are lowercased, and are ranked by how many plugins use them (top 100). Use a tag name as the "}
            <code className="font-mono text-xs">category</code>{zh ? " 筛选条件。" : " filter on the list endpoint."}
          </p>
          <SubHeading>{zh ? "请求示例" : "Example request"}</SubHeading>
          <CodeBlock>{categoriesCurl}</CodeBlock>
          <SubHeading>{zh ? "响应示例" : "Example response"}</SubHeading>
          <CodeBlock>{categoriesResponse}</CodeBlock>
        </Endpoint>

        <section id="mcp" aria-label={zh ? "MCP 服务器" : "MCP server"} className="scroll-mt-24">
          <Card tab="/api/mcp">
            <div className="space-y-4 p-5 sm:p-6">
              <div className="space-y-2">
                <h2 className="font-display text-xl font-bold tracking-tight">{zh ? "MCP 服务器" : "MCP server"}</h2>
                <MethodPath method="POST" path="/api/mcp" />
              </div>
              <p className="text-sm text-gray-600">
                {zh ? "插件目录提供 MCP 服务器，Agent 可以通过工具搜索插件。传输方式为 " : "The directory provides an MCP server so agents can search for plugins with tools. It uses "}
                <code className="font-mono text-xs">streamable-http</code>{zh ? "，服务器无状态：每个 POST 携带一条 JSON-RPC 2.0 消息，不建立会话，协议版本为 " : " and the server is stateless: each POST carries one JSON-RPC 2.0 message, there are no sessions, and the protocol version is "}
                <code className="font-mono text-xs">2025-06-18</code>{zh ? "。无需认证。" : ". No authentication."}
              </p>
              <SubHeading>{zh ? "连接客户端" : "Connect a client"}</SubHeading>
              <p className="text-sm text-gray-600">
                {zh ? "将端点添加到客户端的 " : "Add the endpoint to your client's "}<code className="font-mono text-xs">mcp.json</code>:
              </p>
              <CodeBlock>{mcpJsonSnippet}</CodeBlock>
              <SubHeading>{zh ? "工具" : "Tools"}</SubHeading>
              <DocTable
                head={zh ? ["工具", "参数", "说明"] : ["Tool", "Arguments", "Description"]}
                rows={[
                  [
                    "search_plugins",
                    "query?, protocol? (format or format[]), category?, owner?, type? (skills | mcp), transport?, sort?, page?, per_page?",
                    zh ? "搜索插件目录。筛选语义与范围限制和 GET /api/v1/plugins 相同；结果 JSON 以 items、total、page、perPage、totalPages 分页。" : "Search the plugin directory. Filter behavior and limits match GET /api/v1/plugins; the result JSON uses items, total, page, perPage, and totalPages.",
                  ],
                  [
                    "get_plugin",
                    zh ? "slug（必填）" : "slug (required)",
                    zh ? "返回单个插件的完整详情，与 GET /api/v1/plugins/{slug} 相同。" : "Full detail for one plugin, like GET /api/v1/plugins/{slug}.",
                  ],
                  ["get_stats", zh ? "无" : "none", zh ? "目录统计，与 GET /api/v1/stats 相同。" : "Directory totals, like GET /api/v1/stats."],
                ]}
              />
              <SubHeading>{zh ? "示例：初始化" : "Example: initialize"}</SubHeading>
              <CodeBlock>{mcpInitializeCurl}</CodeBlock>
              <SubHeading>{zh ? "示例：调用 search_plugins" : "Example: call search_plugins"}</SubHeading>
              <CodeBlock>{mcpToolCallCurl}</CodeBlock>
            </div>
          </Card>
        </section>
      </div>
    </Container>
  );
}
