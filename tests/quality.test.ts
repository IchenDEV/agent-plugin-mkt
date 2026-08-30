import assert from "node:assert/strict";
import { test } from "node:test";
import { qualityScore } from "@/lib/quality";

const NOW = Date.parse("2026-08-31T00:00:00Z");

function signals(overrides: Partial<Parameters<typeof qualityScore>[0]> = {}) {
  return {
    repoStars: 50,
    repoForks: 5,
    repoOpenIssues: 2,
    repoPushedAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000),
    license: "MIT",
    skillCount: 3,
    mcpCount: 1,
    hasDescription: true,
    ...overrides,
  };
}

test("an actively maintained, complete plugin scores high", () => {
  const { score, level } = qualityScore(signals(), NOW);
  assert.ok(score >= 65, `expected score >= 65, got ${score}`);
  assert.equal(level, "high");
});

test("a stale, empty plugin scores low", () => {
  const { score, level } = qualityScore(
    signals({
      repoStars: 0,
      repoForks: 0,
      repoPushedAt: new Date(NOW - 400 * 24 * 60 * 60 * 1000),
      license: null,
      skillCount: 0,
      mcpCount: 0,
      hasDescription: false,
    }),
    NOW,
  );
  assert.ok(score < 35, `expected score < 35, got ${score}`);
  assert.equal(level, "low");
});

test("a new project with no issues yet is not penalized for responsiveness", () => {
  const fresh = qualityScore(
    signals({ repoStars: 2, repoForks: 0, repoOpenIssues: 0, license: null }),
    NOW,
  );
  const noisy = qualityScore(
    signals({ repoStars: 2, repoForks: 0, repoOpenIssues: 0, license: null, skillCount: 0, mcpCount: 0, hasDescription: false, repoPushedAt: null }),
    NOW,
  );
  assert.equal(fresh.parts.responsiveness, 0.5);
  assert.ok(fresh.score > noisy.score);
});

test("score is bounded and clamps to 0..100", () => {
  const max = qualityScore(
    signals({ repoStars: 100_000, repoForks: 10_000, repoOpenIssues: 0 }),
    NOW,
  );
  assert.ok(max.score <= 100);
  assert.equal(max.score, 100);
  const min = qualityScore(
    signals({
      repoStars: 0,
      repoForks: 0,
      repoPushedAt: null,
      license: null,
      skillCount: 0,
      mcpCount: 0,
      hasDescription: false,
      repoOpenIssues: 0,
    }),
    NOW,
  );
  assert.ok(min.score >= 0);
});
