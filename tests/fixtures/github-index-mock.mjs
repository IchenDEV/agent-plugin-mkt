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
  if (url.origin !== "https://api.github.com") throw new Error("Unexpected external origin");
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
  if (!suffix) return Response.json({ full_name: `fixture/${name}`, html_url: `https://github.com/fixture/${name}`, default_branch: "main", pushed_at: "2026-10-01T00:00:00Z", stargazers_count: 12 });
  if (suffix.startsWith("/git/trees/")) {
    if (name === "slow" && process.env.MOCK_FAIL_ROOT === "1") return Response.json({ message: "Resource not accessible by integration" }, { status: 403 });
    return Response.json({ truncated: process.env.MOCK_TRUNCATED === "1", tree: [{ type: "blob", path: ".claude-plugin/plugin.json", sha: "fixture-sha" }] });
  }
  if (suffix === "/contents/.claude-plugin/plugin.json") return Response.json({ type: "file", path: ".claude-plugin/plugin.json", size: 90, encoding: "base64", content: Buffer.from(JSON.stringify({ name: `resume-${name}`, description: "Offline resume integration fixture" })).toString("base64") });
  return Response.json({ message: "Not found" }, { status: 404 });
};
