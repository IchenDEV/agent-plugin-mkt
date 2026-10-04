// Offline CLI integration fixture. Every HTTP request is intercepted; no network.
import { appendFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
if (process.env.MOCK_CRASH_AFTER_COMMIT === "1") {
  const original = PrismaClient.prototype.$transaction;
  PrismaClient.prototype.$transaction = async function (...args) {
    const result = await original.apply(this, args);
    process.exit(86); // Commit is durable; indexer has not yet marked root complete.
    return result;
  };
}
globalThis.fetch = async (input) => {
  const url = new URL(input);
  appendFileSync(process.env.MOCK_TRACE, url.pathname + "\n");
  if (process.env.MOCK_REQUESTS) appendFileSync(process.env.MOCK_REQUESTS, JSON.stringify({ path: url.pathname, query: url.searchParams.get("q"), page: url.searchParams.get("page") }) + "\n");
  if (url.origin !== "https://api.github.com") throw new Error("Unexpected external origin");
  if (url.pathname === "/search/repositories" && process.env.MOCK_PARTITION_TEST) {
    const range = /created:([^ ]+)\.\.([^ ]+)/.exec(url.searchParams.get("q") ?? "");
    if (!range) return Response.json({ total_count: 0, incomplete_results: false, items: [] });
    const from = Date.parse(range[1]) / 1000;
    const to = Date.parse(range[2]) / 1000;
    if (process.env.MOCK_PARTITION_TEST === "saturated") return Response.json({ total_count: 1001, incomplete_results: false, items: [] });
    if (to - from > 1_000_000_000) return Response.json({ total_count: process.env.MOCK_PARTITION_TEST === "incomplete" ? 2 : 1001, incomplete_results: process.env.MOCK_PARTITION_TEST === "incomplete", items: [] });
    const names = from === 0 ? ["slow", "fast"] : [];
    return Response.json({ total_count: names.length, incomplete_results: false, items: names.map((name) => ({ full_name: `fixture/${name}`, html_url: `https://github.com/fixture/${name}`, default_branch: "main", pushed_at: "2026-10-01T00:00:00Z" })) });
  }
  if (url.pathname === "/search/code" && process.env.MOCK_DUPLICATE_CODE) {
    const page = Number(url.searchParams.get("page"));
    const entries = page === 1 ? [["slow", ".claude-plugin/marketplace.json"], ["slow", ".claude-plugin/plugin.json"]] : [["slow", ".codex-plugin/plugin.json"], ["fast", ".claude-plugin/plugin.json"]];
    return Response.json({ total_count: 4, incomplete_results: false, items: entries.map(([name, path]) => ({ name: path.split("/").at(-1), path, sha: "fixture-sha", html_url: `https://github.com/fixture/${name}`, repository: { full_name: `fixture/${name}`, html_url: `https://github.com/fixture/${name}` } })) });
  }
  if (url.pathname === "/search/repositories") return Response.json({ total_count: 4, incomplete_results: false, items: ["slow", "fast"].map((name) => ({ full_name: `fixture/${name}`, html_url: `https://github.com/fixture/${name}`, default_branch: "main", pushed_at: "2026-10-01T00:00:00Z" })) });
  if (url.pathname === "/search/code") return Response.json({ total_count: 2, incomplete_results: false, items: ["slow", "fast"].map((name) => ({ name: "plugin.json", path: ".claude-plugin/plugin.json", sha: "fixture-sha", html_url: `https://github.com/fixture/${name}`, repository: { full_name: `fixture/${name}`, html_url: `https://github.com/fixture/${name}` } })) });
  if (url.pathname === "/orgs/fixture/repos") {
    if (process.env.MOCK_OWNER_ERROR === "403") return Response.json({ message: "Resource not accessible by integration" }, { status: 403 });
    if (process.env.MOCK_OWNER_ERROR === "malformed") return Response.json({ unexpected: true });
    return Response.json([]);
  }
  const match = /^\/repos\/fixture\/(slow|fast)(.*)$/.exec(url.pathname);
  if (!match) return Response.json({ message: "Not found" }, { status: 404 });
  const [, name, suffix] = match;
  if (!suffix) return Response.json({ full_name: `fixture/${name}`, html_url: `https://github.com/fixture/${name}`, default_branch: "main", pushed_at: process.env.MOCK_PUSHED_AT ?? "2026-10-01T00:00:00Z", stargazers_count: 12 });
  if (suffix.startsWith("/git/trees/")) {
    if (name === "slow" && process.env.MOCK_FAIL_ROOT === "1") return Response.json({ message: "Resource not accessible by integration" }, { status: 403 });
    return Response.json({ truncated: process.env.MOCK_TRUNCATED === "1", tree: process.env.MOCK_EMPTY_REPOS ? [] : [{ type: "blob", path: ".claude-plugin/plugin.json", sha: "fixture-sha" }] });
  }
  if (suffix === "/contents/.claude-plugin/plugin.json") return Response.json({ type: "file", path: ".claude-plugin/plugin.json", size: 90, encoding: "base64", content: Buffer.from(JSON.stringify({ name: `resume-${name}`, description: "Offline resume integration fixture" })).toString("base64") });
  return Response.json({ message: "Not found" }, { status: 404 });
};
