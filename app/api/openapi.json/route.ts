import { json } from "@/lib/api-helpers";
import { absoluteUrl } from "@/lib/site";

export { OPTIONS } from "@/lib/api-helpers";

// A complete, hand-written OpenAPI 3.1 description of the public REST API.
// Schemas mirror the TypeScript shapes in lib/queries.ts exactly
// (PluginSummary, PluginDetail, Stats, Category) — keep them in sync.

const TRANSPORT_ENUM = ["stdio", "streamable-http", "sse"];
const PROTOCOL_ENUM = ["codex", "claude-code", "agent-plugins"];

const document = {
  openapi: "3.1.0",
  info: {
    title: "plugins marketplace API",
    version: "1.0.0",
    description:
      "Read-only REST API for plugins marketplace, a community index of open-source Codex, Claude Code, and Agent Plugins packages. All endpoints are GET-only, return JSON, require no authentication, and send permissive CORS headers (Access-Control-Allow-Origin: *). Responses are cacheable for 60 seconds. Errors use the shape { \"error\": { \"code\", \"message\" } }.",
  },
  servers: [{ url: absoluteUrl("/"), description: "Public plugins marketplace API" }],
  externalDocs: {
    description: "Human-readable API and MCP documentation",
    url: absoluteUrl("/docs"),
  },
  paths: {
    "/api/v1/plugins": {
      get: {
        operationId: "listPlugins",
        summary: "List and search plugins",
        description:
          "Paginated plugin summaries. Runtime selections match any selected protocol; other filters combine with AND. Invalid enum values are rejected with 400 bad_request.",
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            description: "Free-text query over name, description, keywords, and author (max 200 chars).",
            schema: { type: "string", maxLength: 200 },
          },
          {
            name: "category",
            in: "query",
            required: false,
            description: "Exact keyword match. Categories are manifest keywords; see /api/v1/categories.",
            schema: { type: "string" },
          },
          {
            name: "type",
            in: "query",
            required: false,
            description: "Only plugins containing this component type.",
            schema: { type: "string", enum: ["skills", "mcp"] },
          },
          {
            name: "transport",
            in: "query",
            required: false,
            description: "Only plugins with at least one MCP server using this transport.",
            schema: { type: "string", enum: TRANSPORT_ENUM },
          },
          {
            name: "protocol",
            in: "query",
            required: false,
            style: "form",
            explode: true,
            description:
              "Repeat to match any selected runtime protocol, for example protocol=codex&protocol=claude-code. Comma-separated values are also accepted.",
            schema: { type: "array", items: { type: "string", enum: PROTOCOL_ENUM }, uniqueItems: true },
          },
          {
            name: "sort",
            in: "query",
            required: false,
            description:
              "Sort order: stars (repo stars, default), updated (repo push date), recent (first indexed).",
            schema: { type: "string", enum: ["stars", "updated", "recent"], default: "stars" },
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number, 1-based. Values below 1 are clamped to 1.",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "per_page",
            in: "query",
            required: false,
            description: "Results per page, clamped to 1..50.",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 24 },
          },
        ],
        responses: {
          "200": {
            description: "A page of plugin summaries.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "meta"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/PluginSummary" } },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
                example: {
                  data: [
                    {
                      slug: "acme-github-tools",
                      name: "github-tools",
                      version: "1.2.0",
                      description: "Skills and an MCP server for triaging GitHub issues.",
                      authorName: "Acme Labs",
                      license: "MIT",
                      keywords: ["github", "issues", "automation"],
                      repoUrl: "https://github.com/acme/github-tools",
                      repoStars: 412,
                      skillCount: 3,
                      mcpCount: 1,
                      transports: ["stdio"],
                      protocols: ["codex", "claude-code"],
                      createdAt: "2026-08-07T09:14:00.000Z",
                      indexedAt: "2026-08-07T09:14:00.000Z",
                    },
                  ],
                  meta: { page: 1, per_page: 24, total: 137, total_pages: 6 },
                },
              },
            },
          },
          "400": {
            description: "Invalid enum value for protocol, type, transport, or sort.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: {
                    code: "bad_request",
                    message: 'Invalid type "foo". Valid values: skills, mcp.',
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/plugins/{slug}": {
      get: {
        operationId: "getPlugin",
        summary: "Get one plugin",
        description:
          "Full detail for a single plugin: summary fields plus links, raw manifest, skills, and MCP server configs.",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "Registry slug, as returned by the list endpoint.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "The plugin.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/PluginDetail" } },
                },
              },
            },
          },
          "404": {
            description: "No plugin with that slug.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: { code: "not_found", message: 'No plugin with slug "nope".' },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/stats": {
      get: {
        operationId: "getStats",
        summary: "Registry totals",
        description: "Counts of indexed plugins, skills, MCP servers, and categories.",
        responses: {
          "200": {
            description: "Registry totals.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/Stats" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/categories": {
      get: {
        operationId: "listCategories",
        summary: "List categories",
        description:
          "Categories derived from manifest keywords, ranked by plugin count (top 100).",
        responses: {
          "200": {
            description: "Categories with plugin counts.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Category" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PluginSummary: {
        type: "object",
        description: "A plugin as it appears in list results.",
        required: [
          "slug",
          "name",
          "version",
          "description",
          "authorName",
          "license",
          "keywords",
          "protocols",
          "repoUrl",
          "repoStars",
          "skillCount",
          "mcpCount",
          "transports",
          "createdAt",
          "indexedAt",
        ],
        properties: {
          slug: { type: "string", description: "Unique registry slug; use with /api/v1/plugins/{slug}." },
          name: { type: "string", description: "Plugin name from plugin.json." },
          version: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          authorName: { type: ["string", "null"] },
          license: { type: ["string", "null"], description: "SPDX identifier, when declared." },
          keywords: { type: "array", items: { type: "string" } },
          protocols: {
            type: "array",
            description: "Runtime protocols validated for this plugin root.",
            items: { type: "string", enum: PROTOCOL_ENUM },
          },
          repoUrl: { type: "string", description: "GitHub repository the plugin was indexed from." },
          repoStars: { type: "integer" },
          skillCount: { type: "integer" },
          mcpCount: { type: "integer", description: "Number of MCP servers declared in mcp.json." },
          transports: {
            type: "array",
            description: "Distinct transports across the plugin's MCP servers.",
            items: { type: "string", enum: TRANSPORT_ENUM },
          },
          createdAt: { type: "string", format: "date-time", description: "When the plugin first entered the index." },
          indexedAt: { type: "string", format: "date-time", description: "When the plugin was last indexed." },
        },
      },
      PluginDetail: {
        description: "Full plugin record: everything in PluginSummary plus links, manifest, and components.",
        allOf: [
          { $ref: "#/components/schemas/PluginSummary" },
          {
            type: "object",
            required: [
              "homepage",
              "repository",
              "pluginPath",
              "repoPushedAt",
              "manifest",
              "manifestPath",
              "manifests",
              "skills",
              "mcpServers",
            ],
            properties: {
              homepage: { type: ["string", "null"] },
              repository: { type: ["string", "null"], description: "Repository URL as declared in the manifest." },
              pluginPath: { type: "string", description: "Path of the plugin directory inside its repository." },
              repoPushedAt: { type: ["string", "null"], format: "date-time" },
              manifest: { type: "string", description: "Raw canonical manifest body (untrusted text)." },
              manifestPath: { type: "string", description: "Canonical manifest path inside the repository." },
              manifests: {
                type: "object",
                description: "Per-protocol raw manifests keyed by protocol.",
                additionalProperties: {
                  type: "object",
                  required: ["path", "raw"],
                  properties: { path: { type: "string" }, raw: { type: "string" } },
                },
              },
              skills: { type: "array", items: { $ref: "#/components/schemas/Skill" } },
              mcpServers: { type: "array", items: { $ref: "#/components/schemas/McpServerEntry" } },
            },
          },
        ],
      },
      Skill: {
        type: "object",
        required: ["dirName", "path", "name", "description"],
        properties: {
          dirName: { type: "string", description: "Directory name under skills/." },
          path: { type: "string", description: "Plugin-relative path to SKILL.md." },
          name: { type: "string", description: "Name from the SKILL.md frontmatter." },
          description: { type: ["string", "null"] },
        },
      },
      McpServerEntry: {
        type: "object",
        required: ["serverId", "transport", "config"],
        properties: {
          serverId: { type: "string", description: "Key in a supported MCP configuration." },
          transport: { type: "string", enum: TRANSPORT_ENUM },
          config: {
            type: "object",
            description: "Server config as declared in mcp.json (untrusted; shape varies by transport).",
            additionalProperties: true,
          },
        },
      },
      Stats: {
        type: "object",
        required: ["plugins", "skills", "mcpServers", "categories"],
        properties: {
          plugins: { type: "integer" },
          skills: { type: "integer" },
          mcpServers: { type: "integer" },
          categories: { type: "integer" },
        },
      },
      Category: {
        type: "object",
        required: ["name", "count"],
        properties: {
          name: { type: "string", description: "Lowercased manifest keyword." },
          count: { type: "integer", description: "Number of plugins carrying the keyword." },
        },
      },
      Meta: {
        type: "object",
        description: "Pagination metadata for list responses.",
        required: ["page", "per_page", "total", "total_pages"],
        properties: {
          page: { type: "integer", minimum: 1 },
          per_page: { type: "integer", minimum: 1, maximum: 50 },
          total: { type: "integer", description: "Total matching plugins across all pages." },
          total_pages: { type: "integer", minimum: 1 },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", description: "Machine-readable code: bad_request or not_found." },
              message: { type: "string", description: "Human-readable explanation." },
            },
          },
        },
      },
    },
  },
};

/** GET /api/openapi.json — the OpenAPI 3.1 description of the REST API. */
export async function GET() {
  return json(document);
}
