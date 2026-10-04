import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { pluginWhereForFilters } from "@/lib/queries";

test("issue 18: repository name, URL and owner find the indexed plugin through the shared filter", async () => {
  const directory = mkdtempSync(join(tmpdir(), "catalog-search-"));
  const url = `file:${join(directory, "fixture.db")}`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const setup = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
    assert.equal(setup.status, 0, setup.stderr + setup.stdout);
    await db.plugin.createMany({ data: [
      { slug: "trendpulse-by-digestseo", name: "trendpulse-by-digestseo", manifest: "{}", repoUrl: "https://github.com/AKzar1el/mcp-trendpulse", repoOwner: "akzar1el" },
      { slug: "unrelated", name: "unrelated", manifest: "{}", repoUrl: "https://github.com/other/unrelated", repoOwner: "other" },
    ] });
    for (const q of ["mcp-trendpulse", "AKzar1el/mcp-trendpulse", "https://github.com/AKzar1el/mcp-trendpulse", "AKZAR1EL", "trendpulse"]) {
      const rows = await db.plugin.findMany({ where: pluginWhereForFilters({ q }), select: { slug: true } });
      assert.deepEqual(rows, [{ slug: "trendpulse-by-digestseo" }], q);
    }
    assert.equal(await db.plugin.count({ where: pluginWhereForFilters({ q: "mcp-trendpulse", owner: "other" }) }), 0);
    assert.equal(await db.plugin.count({ where: pluginWhereForFilters({ q: "missing-repository" }) }), 0);
  } finally { await db.$disconnect(); rmSync(directory, { recursive: true }); }
});
