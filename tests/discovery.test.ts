import assert from "node:assert/strict";
import test from "node:test";
import { canSkipEmptyRepository, EMPTY_REPOSITORY_TTL_MS, newRepositoryTraversal, repositoryWindowQuery, splitSearchWindow } from "@/lib/discovery";
import type { RepoMetadata } from "@/lib/github";

test("creation partitions preserve every boundary second without overlap", () => {
  const window = { from: 100, to: 109 };
  const parts = splitSearchWindow(window)!;
  assert.deepEqual(parts, [{ from: 100, to: 104 }, { from: 105, to: 109 }]);
  assert.deepEqual(parts.flatMap((part) => Array.from({ length: part.to - part.from + 1 }, (_, i) => part.from + i)), Array.from({ length: 10 }, (_, i) => 100 + i));
  assert.deepEqual(splitSearchWindow({ from: 100, to: 101 }), [{ from: 100, to: 100 }, { from: 101, to: 101 }]);
  assert.equal(splitSearchWindow({ from: 100, to: 100 }), null);
  assert.equal(repositoryWindowQuery("topic:agent-plugins", { from: 0, to: 1 }), "topic:agent-plugins created:1970-01-01T00:00:00Z..1970-01-01T00:00:01Z");
  assert.deepEqual(newRepositoryTraversal(1999), { windows: [{ from: 0, to: 1 }] });
});

test("empty repository exclusion expires and invalidates on a push or branch change", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  const repo: RepoMetadata = { fullName: "o/r", htmlUrl: "https://github.com/o/r", stars: 0, forks: 0, openIssues: 0, pushedAt: new Date(now - 1000), license: null, defaultBranch: "main" };
  const empty = { pushedAt: repo.pushedAt!.toISOString(), defaultBranch: "main", checkedAt: new Date(now).toISOString() };
  assert.equal(canSkipEmptyRepository(repo, empty, now), true);
  assert.equal(canSkipEmptyRepository(repo, empty, now + EMPTY_REPOSITORY_TTL_MS), false);
  assert.equal(canSkipEmptyRepository(repo, empty, now - 1), false);
  assert.equal(canSkipEmptyRepository({ ...repo, pushedAt: new Date(now) }, empty, now), false);
  assert.equal(canSkipEmptyRepository({ ...repo, defaultBranch: "trunk" }, empty, now), false);
  assert.equal(canSkipEmptyRepository({ ...repo, pushedAt: null }, empty, now), false);
  assert.equal(canSkipEmptyRepository(repo, undefined, now), false);
});
