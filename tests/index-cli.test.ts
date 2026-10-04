import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import test from "node:test";
import type { IndexCheckpoint } from "@/lib/index-checkpoint";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "index-cli-"));
  const env = { ...process.env, DATABASE_URL: `file:${join(directory, "fixture.db")}`, INDEX_STATE_PATH: join(directory, "state.json"), MOCK_TRACE: join(directory, "trace.txt"), GITHUB_TOKEN: "" };
  const setup = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr + setup.stdout);
  writeFileSync(env.MOCK_TRACE, "");
  const cli = (extra: Record<string, string> = {}, args: string[] = []) => spawnSync(process.execPath, ["--import", "tsx", "--import", "./tests/fixtures/github-index-mock.mjs", "scripts/index-github.mts", ...(extra.MOCK_SEARCH_TEST ? ["--skip-owner-fanout", "--query", "fixture-query", "--repository-query", "fixture-query", "--max", "4", "--repository-max", "4", "--search-page-size", "2"] : ["--skip-code-search", "--skip-repository-search", ...(extra.MOCK_OWNER_TEST ? [] : ["--skip-owner-fanout"]), "--repo", "fixture/slow", "--repo", "fixture/fast"]), "--allow-partial", ...args], { env: { ...env, ...extra }, encoding: "utf8", timeout: 30_000 });
  const state = () => JSON.parse(readFileSync(env.INDEX_STATE_PATH, "utf8")) as IndexCheckpoint;
  return { directory, env, cli, state, cleanup: () => rmSync(directory, { recursive: true }) };
}
test("CLI resumes budget interruption fairly and does not mark failed roots complete", async () => {
  const f = fixture();
  try {
    const seed = new PrismaClient({ datasources: { db: { url: f.env.DATABASE_URL } } });
    try { await seed.plugin.create({ data: { slug: "unseen", name: "unseen", manifest: "{}", repoUrl: "https://github.com/unseen/untouched" } }); } finally { await seed.$disconnect(); }
    const first = f.cli({}, ["--request-budget", "3"]);
    assert.equal(first.status, 0, first.stderr + first.stdout);
    assert.equal(f.state().status, "partial");
    assert.equal(f.state().requestMetrics.requests, 3);
    assert.deepEqual(f.state().seenRoots, []);
    writeFileSync(f.env.MOCK_TRACE, "");
    const second = f.cli({}, ["--request-budget", "100"]);
    assert.equal(second.status, 0, second.stderr + second.stdout);
    assert.equal(readFileSync(f.env.MOCK_TRACE, "utf8").split("\n")[0], "/repos/fixture/fast");
    assert.equal(f.state().status, "completed");
    assert.equal(f.state().seenRoots.length, 2);
    const db = new PrismaClient({ datasources: { db: { url: f.env.DATABASE_URL } } });
    try { assert.equal(await db.plugin.count(), 3); assert.ok(await db.plugin.findUnique({ where: { slug: "unseen" } })); } finally { await db.$disconnect(); }
  } finally { f.cleanup(); }
});
test("CLI retries failed tasks and refuses option mismatch without overwriting checkpoint", () => {
  const f = fixture();
  try {
    const first = f.cli({ MOCK_FAIL_ROOT: "1" });
    assert.equal(first.status, 0, first.stderr + first.stdout);
    assert.equal(f.state().status, "partial");
    assert.deepEqual(f.state().seenRoots, ["fixture/fast#"]);
    const checkpoint = readFileSync(f.env.INDEX_STATE_PATH, "utf8");
    const changed = f.cli({}, ["--max", "6000"]);
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /different discovery options/);
    assert.equal(readFileSync(f.env.INDEX_STATE_PATH, "utf8"), checkpoint);
    const second = f.cli();
    assert.equal(second.status, 0, second.stderr + second.stdout);
    assert.equal(f.state().status, "completed");
  } finally { f.cleanup(); }
});
test("crash after DB commit replays safely; truncated inventories remain partial", async () => {
  const f = fixture();
  try {
    const crash = f.cli({ MOCK_CRASH_AFTER_COMMIT: "1" });
    assert.equal(crash.status, 86, crash.stderr + crash.stdout);
    assert.deepEqual(f.state().seenRoots, []);
    const db = new PrismaClient({ datasources: { db: { url: f.env.DATABASE_URL } } });
    try { assert.equal(await db.plugin.count(), 1); } finally { await db.$disconnect(); }
    const resumed = f.cli({ MOCK_TRUNCATED: "1" });
    assert.equal(resumed.status, 0, resumed.stderr + resumed.stdout);
    assert.equal(f.state().status, "partial");
    assert.equal(f.state().seenRepositories.length, 0);
    assert.equal(f.state().seenRoots.length, 2);
    const final = f.cli();
    assert.equal(final.status, 0, final.stderr + final.stdout);
    assert.equal(f.state().status, "completed");
    const after = new PrismaClient({ datasources: { db: { url: f.env.DATABASE_URL } } });
    try { assert.equal(await after.plugin.count(), 2); } finally { await after.$disconnect(); }
  } finally { f.cleanup(); }
});

test("owner listing permission errors and malformed payload stay pending", () => {
  const f = fixture();
  try {
    for (const mode of ["403", "malformed"]) {
      const result = f.cli({ MOCK_OWNER_TEST: "1", MOCK_OWNER_ERROR: mode });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.equal(f.state().status, "partial");
      const owner = f.state().tasks.find((task) => task.kind === "owner");
      assert.ok(owner);
      assert.equal(owner.done, false);
      assert.equal(owner.exhausted, false);
    }
    const recovered = f.cli({ MOCK_OWNER_TEST: "1" });
    assert.equal(recovered.status, 0, recovered.stderr + recovered.stdout);
    assert.equal(f.state().status, "completed");
  } finally { f.cleanup(); }
});

test("search-page buffers persist while budgeted resumes rotate into code search", () => {
  const f = fixture();
  try {
    const first = f.cli({ MOCK_SEARCH_TEST: "1" }, ["--request-budget", "1"]);
    assert.equal(first.status, 0, first.stderr + first.stdout);
    assert.equal(f.state().status, "partial");
    assert.equal(f.state().tasks[0].page, 2);
    assert.equal(f.state().tasks[0].repos.length, 2);
    assert.equal(f.state().requestMetrics.byResource.search, 1);
    const buffered = f.state().tasks[0].repos;
    for (let retry = 0; retry < 2; retry++) {
      const result = f.cli({ MOCK_SEARCH_TEST: "1" }, ["--request-budget", "1"]);
      assert.equal(result.status, 0, result.stderr + result.stdout);
    }
    assert.equal(f.state().requestMetrics.byResource.code_search, 1);
    assert.deepEqual(f.state().tasks[0].repos, buffered);
    assert.equal(f.state().tasks.find((task) => task.kind === "code-search")?.hits.length, 2);
    assert.deepEqual(readFileSync(f.env.MOCK_TRACE, "utf8").trim().split("\n"), ["/search/repositories", "/search/repositories", "/search/code"]);
  } finally { f.cleanup(); }
});
