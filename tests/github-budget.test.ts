import assert from "node:assert/strict";
import test from "node:test";
import { configureGitHubRequests, getRepo, GitHubApiError, githubRequestMetrics, listOwnerPublicRepositories, RateLimitAbortError } from "@/lib/github";
import { rateLimitDecision } from "@/lib/github-request-policy";

const now = Date.parse("2026-10-04T00:00:00Z");
test("rate-limit classification respects primary reset and Retry-After together", () => {
  const headers = new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String((now + 30_000) / 1000), "retry-after": "90" });
  assert.deepEqual(rateLimitDecision(403, headers, "", now, 0), { kind: "primary", waitMs: 91_000 });
});
test("secondary limits without headers wait at least a minute and back off", () => {
  assert.deepEqual(rateLimitDecision(403, new Headers(), "You have exceeded a secondary rate limit", now, 0), { kind: "secondary", waitMs: 60_000 });
  assert.equal(rateLimitDecision(429, new Headers(), "", now, 1)?.waitMs, 120_000);
  assert.equal(rateLimitDecision(403, new Headers(), "Resource not accessible by integration", now, 0), null);
  assert.equal(rateLimitDecision(429, new Headers({ "retry-after": "2" }), "", now, 2)?.waitMs, 12_000);
});
test("missing/malformed reset is not treated as Unix epoch; HTTP-date Retry-After works", () => {
  assert.equal(rateLimitDecision(403, new Headers({ "x-ratelimit-remaining": "0" }), "", now, 0)?.waitMs, 60_000);
  assert.equal(rateLimitDecision(429, new Headers({ "retry-after": new Date(now + 90_000).toUTCString() }), "", now, 0)?.waitMs, 91_000);
  assert.equal(rateLimitDecision(429, new Headers({ "retry-after": "garbage" }), "", now, 0)?.waitMs, 60_000);
});
test("actual HTTP attempts count independently of search result limits", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ full_name: "owner/repo", html_url: "https://github.com/owner/repo" }); };
  try {
    configureGitHubRequests({ requestBudget: 1, timeBudgetMs: 60_000, coreReserve: 0 });
    await getRepo("owner/repo");
    await assert.rejects(getRepo("owner/other"), RateLimitAbortError);
    assert.equal(requests, 1);
    assert.equal(githubRequestMetrics().byResource.core, 1);
  } finally { globalThis.fetch = original; }
});
test("measured core reserve stops before another request; ordinary 403 is not retried", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ full_name: "o/r", html_url: "https://github.com/o/r" }, { headers: { "x-ratelimit-remaining": "20", "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 3600), "x-ratelimit-resource": "core" } }); };
  try {
    configureGitHubRequests({ requestBudget: 100, timeBudgetMs: 60_000 });
    await getRepo("o/r");
    await assert.rejects(getRepo("o/s"), /quota reserve/);
    assert.equal(requests, 1);
    configureGitHubRequests({ requestBudget: 100, timeBudgetMs: 60_000 });
    globalThis.fetch = async () => { requests++; return Response.json({ message: "Resource not accessible by integration" }, { status: 403 }); };
    await assert.rejects(getRepo("o/r"), (error: unknown) => error instanceof GitHubApiError && error.status === 403);
    assert.equal(requests, 2);
    assert.equal(githubRequestMetrics().rateLimitResponses, 0);
  } finally { globalThis.fetch = original; }
});
test("long primary reset and secondary wait exceeding time budget pause immediately", async () => {
  const original = globalThis.fetch;
  try {
    configureGitHubRequests({ requestBudget: 100, timeBudgetMs: 300_000 });
    globalThis.fetch = async () => Response.json({ message: "API rate limit exceeded" }, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 3600) } });
    await assert.rejects(getRepo("o/r"), /primary rate limit/);
    assert.equal(githubRequestMetrics().requests, 1);
    configureGitHubRequests({ requestBudget: 100, timeBudgetMs: 1000 });
    globalThis.fetch = async () => Response.json({ message: "secondary rate limit" }, { status: 403 });
    await assert.rejects(getRepo("o/r"), /time budget/);
    assert.equal(githubRequestMetrics().requests, 1);
  } finally { globalThis.fetch = original; }
});

test("owner pagination falls back only on initial 404 and propagates later-page errors", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  try {
    configureGitHubRequests({ requestBudget: 100, timeBudgetMs: 60_000 });
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname.startsWith("/orgs/")) return Response.json({}, { status: 404 });
      if (url.searchParams.get("page") === "1") return Response.json([{ full_name: "o/a", html_url: "https://github.com/o/a", fork: true }, { full_name: "o/b", html_url: "https://github.com/o/b" }]);
      assert.equal(url.searchParams.get("per_page"), "2");
      return Response.json({}, { status: 404 });
    };
    await assert.rejects(listOwnerPublicRepositories("o", { max: 2 }), (error: unknown) => error instanceof GitHubApiError && error.status === 404);
    assert.deepEqual(paths, ["/orgs/o/repos", "/users/o/repos", "/users/o/repos"]);
  } finally { globalThis.fetch = original; }
});
