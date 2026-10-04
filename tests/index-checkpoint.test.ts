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
