import { NextResponse } from "next/server";
import { handleMcpPost, PARSE_ERROR } from "@/lib/mcp-server";

// Stateless MCP endpoint (Streamable HTTP). POST only: no SSE stream, no
// sessions — any Mcp-Session-Id header a client sends is ignored.

export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = PARSE_ERROR;
  }
  const result = await handleMcpPost(body);
  if (!result.body) {
    // Notification accepted: 202 with no body.
    return new Response(null, { status: result.status, headers: CORS_HEADERS });
  }
  return NextResponse.json(result.body, { status: result.status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: "Method not allowed. Send each JSON-RPC message with POST; this server does not create MCP sessions.",
      },
    },
    { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } },
  );
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
