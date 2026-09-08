import assert from "node:assert/strict";
import test from "node:test";
import robots from "@/app/robots";
import { isBrowseFilterUrl } from "@/lib/crawl-policy";

function disallowed(path: string): boolean {
  const rules = robots().rules;
  assert.ok(Array.isArray(rules));
  const group = rules.find((rule) => rule.userAgent === "*");
  assert.ok(group);
  const patterns = [group.disallow ?? []].flat();
  return patterns.some((pattern) => {
    // robots.txt patterns are prefix matches with '*' as a wildcard.
    const escaped = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${escaped.join(".*")}`).test(path);
  });
}

test("crawler filter combinations are excluded regardless of parameter order", () => {
  for (const path of [
    "/plugins?category=zotero&protocol=claude-code",
    "/plugins?protocol=claude-code&category=zotero",
    "/plugins?category=productivity&sort=recent",
    "/plugins?sort=updated",
    "/plugins?category=sql&type=mcp&page=2",
    "/plugins?transport=sse&protocol=codex",
    "/plugins?q=review",
  ]) {
    assert.equal(disallowed(path), true, path);
    assert.equal(isBrowseFilterUrl(path), true, path);
  }
});

test("indexable entry points and detail URLs remain crawlable", () => {
  for (const path of [
    "/", "/plugins", "/plugins?page=2", "/plugins?category=sql",
    "/plugins?category=sql&page=2", "/plugins?page=2&category=sql",
    "/plugins?category=prototype", "/plugins/eli5", "/creators/example",
    "/codex-plugins", "/claude-code-plugins", "/agent-skills", "/mcp-servers",
    "/robots.txt", "/sitemap.xml", "/api/v1/plugins?protocol=codex",
  ]) {
    assert.equal(disallowed(path), false, path);
    assert.equal(isBrowseFilterUrl(path), false, path);
  }
});
