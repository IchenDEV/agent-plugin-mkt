import { z } from "zod";
import {
  getPluginBySlug,
  getStats,
  searchPlugins,
  type PluginFilters,
} from "@/lib/queries";

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
      "Search the Agent Plugin registry. Filter by free-text query, category (keyword), component type (skills or mcp), MCP transport, and sort order. Returns a paginated result: items (each with slug, name, version, description, author, keywords, repo stars, skill/MCP counts, transports) plus total, page, perPage, totalPages. Pass an item's slug to get_plugin for full details.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text search over plugin name, description, keywords, and author.",
        },
        category: {
          type: "string",
          description: "Exact category match. Categories are manifest keywords, e.g. \"registry\" or \"mcp\".",
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
        sort: {
          type: "string",
          enum: ["stars", "updated", "recent"],
          description: "Sort order: stars (default), updated (latest repo push), recent (newest indexed).",
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
      "Fetch full details for one plugin by its slug: manifest JSON, skills (directory name, name, description), MCP server configs with transports, repository URL, stars, license, homepage, and index timestamps. Slugs come from search_plugins results.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The plugin's registry slug, as returned by search_plugins.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stats",
    description:
      "Get registry-wide totals: number of indexed plugins, skills, MCP servers, and categories.",
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
      title: "plugins marketplace",
      version: "0.1.0",
    },
    instructions:
      "A registry of Agent Plugins: use search_plugins to find plugins by query, category, type, or transport; get_plugin for full details by slug; get_stats for registry totals.",
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
