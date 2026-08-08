// E2E test for the MCP endpoint (run with: tsx scripts/test-mcp.ts).
// Targets BASE_URL (default http://localhost:3000) at /api/mcp.
// Prints PASS/FAIL per check, a summary line, and exits 1 on any failure.

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ENDPOINT = `${BASE_URL}/api/mcp`;

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(name: string): void {
  passed++;
  console.log(`PASS  ${name}`);
}

function fail(name: string, note: string): void {
  failed++;
  console.log(`FAIL  ${name} — ${note}`);
}

function skip(name: string, note: string): void {
  skipped++;
  console.log(`SKIP  ${name} — ${note}`);
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.slice(0, 300);
}

interface HttpResult {
  status: number;
  body: unknown;
}

let nextId = 1;

async function postRaw(text: string): Promise<HttpResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
  });
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  return { status: res.status, body };
}

function post(payload: unknown): Promise<HttpResult> {
  return postRaw(JSON.stringify(payload));
}

function request(method: string, params?: unknown): Record<string, unknown> {
  const msg: Record<string, unknown> = { jsonrpc: "2.0", id: nextId++, method };
  if (params !== undefined) msg.params = params;
  return msg;
}

function callTool(name: string, args: Record<string, unknown>): Promise<HttpResult> {
  return post(request("tools/call", { name, arguments: args }));
}

/** Extract result.content[0].text from a tools/call response body. */
function toolText(body: unknown): string | null {
  if (!isObj(body) || !isObj(body.result)) return null;
  const content = body.result.content;
  if (!Array.isArray(content) || !isObj(content[0])) return null;
  return typeof content[0].text === "string" ? content[0].text : null;
}

function parseToolJson(body: unknown): unknown {
  const text = toolText(body);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorCode(body: unknown): number | null {
  if (!isObj(body) || !isObj(body.error)) return null;
  return typeof body.error.code === "number" ? body.error.code : null;
}

async function main(): Promise<void> {
  console.log(`MCP e2e against ${ENDPOINT}\n`);

  // 1. initialize
  try {
    const { body } = await post(
      request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test-mcp", version: "0.1.0" },
      }),
    );
    const result = isObj(body) && isObj(body.result) ? body.result : null;
    const serverInfo = result && isObj(result.serverInfo) ? result.serverInfo : null;
    if (
      result &&
      typeof result.protocolVersion === "string" &&
      serverInfo &&
      serverInfo.name === "agent-plugin-marketplace"
    ) {
      pass("initialize returns protocolVersion + serverInfo.name");
    } else {
      fail("initialize returns protocolVersion + serverInfo.name", `body: ${show(body)}`);
    }
  } catch (err) {
    fail("initialize returns protocolVersion + serverInfo.name", String(err));
  }

  // 2. notifications/initialized -> 202
  try {
    const { status } = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    if (status === 202) pass("notifications/initialized returns 202");
    else fail("notifications/initialized returns 202", `status: ${status}`);
  } catch (err) {
    fail("notifications/initialized returns 202", String(err));
  }

  // 3. tools/list -> exactly the 3 tools
  try {
    const { body } = await post(request("tools/list"));
    const result = isObj(body) && isObj(body.result) ? body.result : null;
    const tools = result && Array.isArray(result.tools) ? result.tools : null;
    const names = tools
      ? tools.map((t) => (isObj(t) && typeof t.name === "string" ? t.name : "?")).sort()
      : [];
    const expected = ["get_plugin", "get_stats", "search_plugins"];
    if (tools && names.length === 3 && expected.every((n, i) => names[i] === n)) {
      pass("tools/list returns exactly the 3 tools");
    } else {
      fail("tools/list returns exactly the 3 tools", `tool names: ${show(names)}`);
    }
  } catch (err) {
    fail("tools/list returns exactly the 3 tools", String(err));
  }

  // 4. search_plugins {} -> items array + total number
  let firstSlug: string | null = null;
  try {
    const { body } = await callTool("search_plugins", {});
    const parsed = parseToolJson(body);
    if (isObj(parsed) && Array.isArray(parsed.items) && typeof parsed.total === "number") {
      pass("search_plugins {} returns items array + total number");
      const first: unknown = parsed.items[0];
      if (isObj(first) && typeof first.slug === "string") firstSlug = first.slug;
    } else {
      fail("search_plugins {} returns items array + total number", `body: ${show(body)}`);
    }
  } catch (err) {
    fail("search_plugins {} returns items array + total number", String(err));
  }

  // 5. get_stats -> plugins count
  try {
    const { body } = await callTool("get_stats", {});
    const parsed = parseToolJson(body);
    if (isObj(parsed) && typeof parsed.plugins === "number") {
      pass("get_stats returns plugins count");
    } else {
      fail("get_stats returns plugins count", `body: ${show(body)}`);
    }
  } catch (err) {
    fail("get_stats returns plugins count", String(err));
  }

  // 6. get_plugin with a real slug from check 4
  if (firstSlug === null) {
    skip("get_plugin returns detail with matching slug", "index is empty — no slug to look up");
  } else {
    try {
      const { body } = await callTool("get_plugin", { slug: firstSlug });
      const parsed = parseToolJson(body);
      if (isObj(parsed) && parsed.slug === firstSlug) {
        pass("get_plugin returns detail with matching slug");
      } else {
        fail("get_plugin returns detail with matching slug", `body: ${show(body)}`);
      }
    } catch (err) {
      fail("get_plugin returns detail with matching slug", String(err));
    }
  }

  // 7. get_plugin miss -> isError true (tool-level, not protocol error)
  try {
    const { body } = await callTool("get_plugin", { slug: "definitely-not-a-real-plugin" });
    const result = isObj(body) && isObj(body.result) ? body.result : null;
    if (result && result.isError === true && toolText(body) !== null) {
      pass("get_plugin miss returns isError true");
    } else {
      fail("get_plugin miss returns isError true", `body: ${show(body)}`);
    }
  } catch (err) {
    fail("get_plugin miss returns isError true", String(err));
  }

  // 8. unknown tool -> -32602
  try {
    const { body } = await callTool("definitely_not_a_tool", {});
    if (errorCode(body) === -32602) pass("unknown tool returns -32602");
    else fail("unknown tool returns -32602", `body: ${show(body)}`);
  } catch (err) {
    fail("unknown tool returns -32602", String(err));
  }

  // 9. malformed body -> -32700
  try {
    const { body } = await postRaw("not json");
    if (errorCode(body) === -32700) pass("malformed JSON returns -32700");
    else fail("malformed JSON returns -32700", `body: ${show(body)}`);
  } catch (err) {
    fail("malformed JSON returns -32700", String(err));
  }

  // 10. GET -> 405
  try {
    const res = await fetch(ENDPOINT, { method: "GET" });
    await res.text();
    if (res.status === 405) pass("GET returns 405");
    else fail("GET returns 405", `status: ${res.status}`);
  } catch (err) {
    fail("GET returns 405", String(err));
  }

  const summary = [`${passed} passed`, `${failed} failed`];
  if (skipped > 0) summary.push(`${skipped} skipped`);
  console.log(`\n${summary.join(", ")}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`Test run crashed: ${String(err)}`);
  process.exit(1);
});
