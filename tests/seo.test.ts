import assert from "node:assert/strict";
import test from "node:test";
import type { PluginSummary } from "@/lib/queries";
import {
  INTENT_LANDINGS,
  intentCanonicalForFilters,
  meaningfulDescription,
  pluginDescription,
} from "@/lib/seo-content";
import { cacheCatalogQuery } from "@/lib/server-cache";

const plugin: PluginSummary = {
  slug: "demo-plugin",
  name: "Demo Plugin",
  version: null,
  description: "|",
  authorName: null,
  license: null,
  keywords: [],
  repoUrl: "https://github.com/example/demo",
  repoStars: 0,
  skillCount: 2,
  mcpCount: 1,
  transports: ["stdio"],
  protocols: ["codex"],
  createdAt: new Date("2026-08-01T00:00:00Z"),
  indexedAt: new Date("2026-08-12T00:00:00Z"),
};

test("search-intent landing pages have unique stable paths", () => {
  const paths = Object.values(INTENT_LANDINGS).map((landing) => landing.path);
  assert.deepEqual(paths, [
    "/codex-plugins",
    "/claude-code-plugins",
    "/agent-skills",
    "/mcp-servers",
  ]);
  assert.equal(new Set(paths).size, paths.length);
});

test("empty and punctuation-only descriptions get a factual fallback", () => {
  assert.equal(meaningfulDescription("|"), null);
  assert.equal(meaningfulDescription("  Useful review tools. "), "Useful review tools.");
  assert.match(pluginDescription(plugin, "en"), /2 skills and 1 MCP server/);
  assert.match(pluginDescription(plugin, "zh-CN"), /2 个技能和1 个 MCP 服务器/);
});

test("semantic browse filters point search engines to intent landing pages", () => {
  assert.equal(intentCanonicalForFilters({ protocols: ["codex"] }), "/codex-plugins");
  assert.equal(
    intentCanonicalForFilters({ protocols: ["claude-code"] }),
    "/claude-code-plugins",
  );
  assert.equal(intentCanonicalForFilters({ type: "skills" }), "/agent-skills");
  assert.equal(intentCanonicalForFilters({ type: "mcp" }), "/mcp-servers");
  assert.equal(intentCanonicalForFilters({ type: "mcp", page: 2 }), null);
  assert.equal(intentCanonicalForFilters({ protocols: ["agent-plugins"] }), null);
});

test("catalog cache deduplicates concurrent reads and evicts failures", async () => {
  let loads = 0;
  const key = `test:dedupe:${Date.now()}`;
  const load = async () => {
    loads += 1;
    return { ok: true };
  };
  const [first, second] = await Promise.all([
    cacheCatalogQuery(key, load),
    cacheCatalogQuery(key, load),
  ]);
  assert.equal(loads, 1);
  assert.strictEqual(first, second);

  let attempts = 0;
  const retryKey = `${key}:retry`;
  await assert.rejects(
    cacheCatalogQuery(retryKey, async () => {
      attempts += 1;
      throw new Error("temporary");
    }),
  );
  assert.equal(await cacheCatalogQuery(retryKey, async () => ++attempts), 2);
});
