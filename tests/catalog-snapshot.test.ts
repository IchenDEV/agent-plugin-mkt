import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import manifest from "@/prisma/snapshot.json";
import { CATALOG_SNAPSHOT, CATALOG_SNAPSHOT_RESOURCE_URI } from "@/lib/catalog-snapshot";
import { GET, OPTIONS } from "@/app/api/catalog-snapshot/route";
import { handleMcpPost } from "@/lib/mcp-server";

test("public snapshot identity selects only intended manifest fields", () => {
  assert.deepEqual(CATALOG_SNAPSHOT, {
    formatVersion: manifest.formatVersion,
    snapshotId: manifest.snapshotId,
    schemaId: manifest.schemaId,
    createdAt: manifest.createdAt,
    coverage: { status: manifest.coverage.status },
    source: { kind: manifest.source.kind },
  });
  assert.ok(Object.isFrozen(CATALOG_SNAPSHOT));
  assert.ok(Object.isFrozen(CATALOG_SNAPSHOT.coverage));
  assert.ok(Object.isFrozen(CATALOG_SNAPSHOT.source));
});

test("snapshot API serves bundled identity without stale CDN caching", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await response.json(), CATALOG_SNAPSHOT);
  assert.equal(OPTIONS().status, 204);
});

test("HTML metadata uses the same bundled snapshot identity", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /name="catalog-snapshot-id" content=\{CATALOG_SNAPSHOT.snapshotId\}/);
  assert.match(layout, /name="catalog-snapshot-coverage" content=\{CATALOG_SNAPSHOT.coverage.status\}/);
});

test("MCP advertises a readable snapshot resource without changing business tools", async () => {
  const request = (method: string, params = {}) => handleMcpPost({ jsonrpc: "2.0", id: 1, method, params });
  const initialized = await request("initialize");
  const initResult = initialized.body?.result as { capabilities: { resources: unknown } };
  assert.deepEqual(initResult.capabilities.resources, { subscribe: false, listChanged: false });

  const listed = await request("resources/list");
  const listResult = listed.body?.result as { resources: Array<{ uri: string }> };
  assert.equal(listResult.resources[0].uri, CATALOG_SNAPSHOT_RESOURCE_URI);

  const read = await request("resources/read", { uri: CATALOG_SNAPSHOT_RESOURCE_URI });
  const readResult = read.body?.result as { contents: Array<{ text: string; mimeType: string }> };
  assert.equal(readResult.contents[0].mimeType, "application/json");
  assert.deepEqual(JSON.parse(readResult.contents[0].text), CATALOG_SNAPSHOT);

  const tools = await request("tools/list");
  const toolResult = tools.body?.result as { tools: Array<{ name: string }> };
  assert.deepEqual(toolResult.tools.map((tool) => tool.name), ["search_plugins", "get_plugin", "get_stats"]);

  const missing = await request("resources/read", { uri: "catalog://missing" });
  assert.equal((missing.body?.error as { code: number }).code, -32002);
  const invalid = await request("resources/read");
  assert.equal((invalid.body?.error as { code: number }).code, -32602);
});
