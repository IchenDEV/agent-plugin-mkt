import { z } from "zod";
import {
  getPluginBySlug,
  getStats,
  searchPlugins,
  type PluginFilters,
} from "@/lib/queries";
import { PLUGIN_PROTOCOLS } from "@/lib/protocols";

// MCP server protocol logic (Streamable HTTP, stateless), kept as a pure
// function over parsed JSON so it is testable without an HTTP layer.
// Protocol: JSON-RPC 2.0, single messages only — batching was removed in
// MCP protocol revision 2025-06-18 and is rejected here.

/**
 * Sentinel the HTTP layer passes when the request body was not valid JSON.
 * handleMcpPost turns it into a JSON-RPC -32700 Parse error response.
 */
export const PARSE_ERROR: unique symbol = Symbol("mcp-parse-error");

const LATEST_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcId = string | number | null;

export interface McpHandlerResult {
  status: number;
  body?: Record<string, unknown>;
}

function resultBody(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function errorBody(id: JsonRpcId, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function ok(id: JsonRpcId, result: unknown): McpHandlerResult {
  return { status: 200, body: resultBody(id, result) };
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 200): McpHandlerResult {
  return { status, body: errorBody(id, code, message) };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "search_plugins",
    description:
      "Search the plugin directory. Filter by text, one or more plugin formats (codex, claude-code, or agent-plugins), tag, included component, MCP transport, and sort order. Multiple formats match any selected value. Returns paginated summaries; pass a slug to get_plugin for full details.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text search over plugin name, description, keywords, and author.",
        },
        category: {
          type: "string",
          description: "Exact tag match. Tags come from manifest keywords, for example \"database\" or \"mcp\".",
        },
        type: {
          type: "string",
          enum: ["skills", "mcp"],
          description: "Only plugins that contain this component type.",
        },
        transport: {
          type: "string",
          enum: ["stdio", "streamable-http", "sse"],
          description: "Only plugins with at least one MCP server using this transport.",
        },
        protocol: {
          oneOf: [
            { type: "string", enum: PLUGIN_PROTOCOLS },
            {
              type: "array",
              items: { type: "string", enum: PLUGIN_PROTOCOLS },
              minItems: 1,
              maxItems: PLUGIN_PROTOCOLS.length,
              uniqueItems: true,
            },
          ],
          description: "One plugin format or an array; arrays match any selected format.",
        },
        sort: {
          type: "string",
          enum: ["stars", "updated", "recent"],
          description: "Sort order: stars (default), updated (latest repository push), recent (newest added to the directory).",
        },
        page: {
          type: "number",
          description: "1-based page number. Defaults to 1.",
        },
        per_page: {
          type: "number",
          description: "Results per page, 1-50. Defaults to 24.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_plugin",
    description:
      "Get one plugin by slug, including its plugin manifests, skills, MCP server configurations and transports, source repository, GitHub stars, license, website, and directory timestamps. Slugs come from search_plugins results.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The plugin's directory slug, as returned by search_plugins.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stats",
    description:
      "Get directory totals for plugins, skills, MCP servers, and tags.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const searchArgsSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(["skills", "mcp"]).optional(),
  transport: z.enum(["stdio", "streamable-http", "sse"]).optional(),
  protocol: z
    .union([
      z.enum(PLUGIN_PROTOCOLS),
      z.array(z.enum(PLUGIN_PROTOCOLS)).min(1).max(PLUGIN_PROTOCOLS.length),
    ])
    .optional(),
  sort: z.enum(["stars", "updated", "recent"]).optional(),
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().optional(),
});

const getPluginArgsSchema = z.object({
  slug: z.string().min(1).max(200),
});

function invalidParams(id: JsonRpcId, error: z.ZodError): McpHandlerResult {
  const detail = error.issues
    .map((issue) => {
      const path = issue.path.map((p) => String(p)).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
  return rpcError(id, -32602, `Invalid params: ${detail}`);
}

/** Wrap a query result as MCP tool output (single text content block). */
function toolResult(id: JsonRpcId, value: unknown): McpHandlerResult {
  return ok(id, {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  });
}

async function handleToolCall(
  id: JsonRpcId,
  params: Record<string, unknown>,
): Promise<McpHandlerResult> {
  const name = params.name;
  if (typeof name !== "string") {
    return rpcError(id, -32602, 'Invalid params: "name" must be a string');
  }
  const rawArgs = params.arguments === undefined ? {} : params.arguments;
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return rpcError(id, -32602, 'Invalid params: "arguments" must be an object');
  }

  switch (name) {
    case "search_plugins": {
      const parsed = searchArgsSchema.safeParse(rawArgs);
      if (!parsed.success) return invalidParams(id, parsed.error);
      const args = parsed.data;
      const filters: PluginFilters = {
        q: args.query,
        category: args.category,
        type: args.type,
        transport: args.transport,
        protocols:
          args.protocol === undefined
            ? undefined
            : Array.isArray(args.protocol)
              ? [...new Set(args.protocol)]
              : [args.protocol],
        sort: args.sort,
        page: args.page,
        perPage: args.per_page,
      };
      return toolResult(id, await searchPlugins(filters));
    }
    case "get_plugin": {
      const parsed = getPluginArgsSchema.safeParse(rawArgs);
      if (!parsed.success) return invalidParams(id, parsed.error);
      const detail = await getPluginBySlug(parsed.data.slug);
      if (!detail) {
        // Tool-level error, not a protocol error: the call itself was valid.
        return ok(id, {
          content: [
            {
              type: "text",
              text: `No plugin found with slug "${parsed.data.slug}". Use search_plugins to find valid slugs.`,
            },
          ],
          isError: true,
        });
      }
      return toolResult(id, detail);
    }
    case "get_stats": {
      return toolResult(id, await getStats());
    }
    default:
      return rpcError(id, -32602, `Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function initializeResult(params: Record<string, unknown>): Record<string, unknown> {
  const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: {
      name: "agent-plugin-marketplace",
      title: "Agent Plugin Directory",
      version: "0.1.0",
    },
    instructions:
      "Find Codex, Claude Code, and Agent Plugins packages. Use search_plugins to filter by plugin format, query, tag, included component, or transport; get_plugin for details by slug; and get_stats for directory totals.",
  };
}

/**
 * Handle one MCP POST body. `body` is the already-parsed JSON value, or the
 * PARSE_ERROR sentinel when the raw body was not valid JSON.
 * Returns the HTTP status plus an optional JSON-RPC response body
 * (notifications get a bodyless 202).
 */
export async function handleMcpPost(body: unknown): Promise<McpHandlerResult> {
  if (body === PARSE_ERROR) {
    return rpcError(null, -32700, "Parse error: request body is not valid JSON", 400);
  }
  if (Array.isArray(body)) {
    return rpcError(
      null,
      -32600,
      "Invalid request: JSON-RPC batching is not supported in MCP protocol 2025-06-18; send a single message",
      400,
    );
  }
  if (typeof body !== "object" || body === null) {
    return rpcError(null, -32600, "Invalid request: expected a JSON-RPC 2.0 message object", 400);
  }

  const msg = body as Record<string, unknown>;
  const hasId = Object.prototype.hasOwnProperty.call(msg, "id");
  const rawId = msg.id;
  const idIsValid = rawId === null || typeof rawId === "string" || typeof rawId === "number";

  if (msg.jsonrpc !== "2.0") {
    return rpcError(
      hasId && idIsValid ? (rawId as JsonRpcId) : null,
      -32600,
      'Invalid request: "jsonrpc" must be "2.0"',
      400,
    );
  }
  if (hasId && !idIsValid) {
    return rpcError(null, -32600, 'Invalid request: "id" must be a string or a number', 400);
  }
  // The MCP base protocol forbids null request ids.
  if (hasId && rawId === null) {
    return rpcError(null, -32600, 'Invalid request: "id" must not be null', 400);
  }

  // Notifications (no id) never get a response body. notifications/initialized
  // is acknowledged; any other notification is ignored the same way.
  if (!hasId) {
    return { status: 202 };
  }

  // Preserve the id exactly, including 0 and "".
  const id = rawId as JsonRpcId;
  // A Request whose method member is absent or not a string is not a valid
  // Request object — JSON-RPC 2.0 mandates -32600, not -32601, here.
  if (typeof msg.method !== "string") {
    return rpcError(id, -32600, 'Invalid request: "method" must be a string', 400);
  }
  const method = msg.method;
  const params =
    typeof msg.params === "object" && msg.params !== null && !Array.isArray(msg.params)
      ? (msg.params as Record<string, unknown>)
      : {};

  try {
    switch (method) {
      case "initialize":
        return ok(id, initializeResult(params));
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: TOOLS });
      case "tools/call":
        return await handleToolCall(id, params);
      default:
        return rpcError(id, -32601, `Method not found: ${method || "(missing method)"}`);
    }
  } catch {
    // Never leak internals (stack traces, query errors) to the client.
    return rpcError(id, -32603, "Internal error");
  }
}
