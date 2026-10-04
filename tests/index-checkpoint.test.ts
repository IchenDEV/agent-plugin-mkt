import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configHash, loadCheckpoint, nextTask, saveCheckpoint, type IndexTask } from "@/lib/index-checkpoint";
const task = (id: string): IndexTask => ({ id, kind: "code-search", query: id, page: 1, endPage: 10, perPage: 100, remaining: 100, repos: [], hits: [], exhausted: false, done: false });
test("round-robin cursor, exact pending page, and committed roots survive resume", () => {
  const directory = mkdtempSync(join(tmpdir(), "index-checkpoint-"));
  const path = join(directory, "state.json");
  try {
    const hash = configHash({ queries: ["a", "b", "c"] });
    const state = loadCheckpoint(path, hash, [task("a"), task("b"), task("c")]);
    assert.equal(nextTask(state, new Set())?.id, "a");
    state.status = "partial";
    state.seenRoots.push("o/r#committed");
    state.tasks[0].hits.push({ name: "plugin.json", path: ".codex-plugin/plugin.json", sha: "abc", html_url: "https://github.com/o/r", repository: { full_name: "o/r", html_url: "https://github.com/o/r" } });
    saveCheckpoint(path, state);
    const resumed = loadCheckpoint(path, hash, []);
    assert.equal(resumed.cycleId, state.cycleId);
    assert.equal(nextTask(resumed, new Set())?.id, "b");
    assert.equal(nextTask(resumed, new Set(["c"]))?.id, "a");
    assert.deepEqual(resumed.tasks[0].hits, state.tasks[0].hits);
    assert.deepEqual(resumed.seenRoots, ["o/r#committed"]);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).coverage, "configured-cycle");
    assert.throws(() => loadCheckpoint(path, "different", []), /different discovery options/);
  } finally { rmSync(directory, { recursive: true }); }
});
test("completed cycle starts fresh; malformed state fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "index-checkpoint-"));
  const path = join(directory, "state.json");
  try {
    const state = loadCheckpoint(path, "hash", [task("a")]);
    state.status = "completed";
    state.tasks[0].done = true;
    saveCheckpoint(path, state);
    const fresh = loadCheckpoint(path, "new-hash", [task("b")]);
    assert.notEqual(fresh.cycleId, state.cycleId);
    assert.equal(nextTask(fresh, new Set())?.id, "b");
    writeFileSync(path, '{"schemaVersion":2}');
    assert.throws(() => loadCheckpoint(path, "hash", []));
  } finally { rmSync(directory, { recursive: true }); }
});

test("completed candidate budgets carry historical pages across cycles, but fresh windows restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "index-checkpoint-"));
  const path = join(directory, "state.json");
  const tasks = (): IndexTask[] => [
    { ...task("recent"), kind: "repository-search" },
    { ...task("history"), kind: "repository-search", traversal: { windows: [{ from: 0, to: 100 }] } },
  ];
  try {
    const state = loadCheckpoint(path, "hash", tasks());
    state.status = "completed";
    state.tasks.forEach((task) => { task.done = true; task.remaining = 0; task.page = 5; });
    state.tasks[1].traversal!.windows = [{ from: 50, to: 100 }];
    state.tasks[1].repos.push({ fullName: "o/pending", htmlUrl: "https://github.com/o/pending", stars: 0, forks: 0, openIssues: 0, pushedAt: null, license: null, defaultBranch: "main" });
    saveCheckpoint(path, state);
    const next = loadCheckpoint(path, "hash", tasks());
    assert.notEqual(next.cycleId, state.cycleId);
    assert.equal(next.tasks[0].page, 1);
    assert.equal(next.tasks[1].page, 5);
    assert.equal(next.tasks[1].remaining, 100);
    assert.equal(next.tasks[1].done, false);
    assert.deepEqual(next.tasks[1].repos, state.tasks[1].repos);
    assert.deepEqual(next.tasks[1].traversal, state.tasks[1].traversal);
    assert.equal(loadCheckpoint(path, "changed-options", tasks()).tasks[1].page, 1);
    // A separate failed task must not hold a spent historical allowance forever.
    state.status = "partial";
    state.tasks[0].done = false;
    state.tasks[0].lastError = "403 permission denied";
    saveCheckpoint(path, state);
    const partial = loadCheckpoint(path, "hash", tasks());
    assert.equal(partial.cycleId, state.cycleId);
    assert.equal(partial.tasks[1].remaining, 100);
    assert.equal(partial.tasks[1].done, false);
    assert.deepEqual(partial.tasks[1].repos, state.tasks[1].repos);
    assert.deepEqual(partial.tasks[0], state.tasks[0]);
    state.status = "completed";
    // Finish buffered results even when the last window has already been fetched.
    state.tasks[1].traversal!.windows = [];
    saveCheckpoint(path, state);
    assert.equal(loadCheckpoint(path, "hash", tasks()).tasks[1].repos.length, 1);
    state.tasks[1].repos = [];
    saveCheckpoint(path, state);
    assert.deepEqual(loadCheckpoint(path, "hash", tasks()).tasks[1].traversal, tasks()[1].traversal);
  } finally { rmSync(directory, { recursive: true }); }
});

test("published legacy partial checkpoint keeps its exact queue and gets no eager replacement", () => {
  const directory = mkdtempSync(join(tmpdir(), "index-checkpoint-"));
  const path = join(directory, "state.json");
  try {
    const state = loadCheckpoint(path, "hash", [task("legacy")]);
    state.status = "partial";
    const { emptyRepositories: _cache, ...legacy } = state;
    void _cache;
    writeFileSync(path, JSON.stringify(legacy));
    const resumed = loadCheckpoint(path, "hash", [{ ...task("new"), traversal: { windows: [{ from: 0, to: 100 }] } }]);
    assert.deepEqual(resumed.tasks, state.tasks);
    assert.deepEqual(resumed.emptyRepositories, {});
    assert.equal(resumed.cycleId, state.cycleId);
  } finally { rmSync(directory, { recursive: true }); }
});
