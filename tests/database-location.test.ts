import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { databaseUrl } from "../lib/database-location";

test("production ignores a conflicting custom database while development retains it", () => {
  assert.equal(databaseUrl({ env: { NODE_ENV: "production", DATABASE_URL: "file:/wrong.db" }, cwd: "/app" }), "file:/app/prisma/marketplace.db");
  assert.equal(databaseUrl({ env: { NODE_ENV: "development", DATABASE_URL: "file:/local.db" }, cwd: "/app" }), "file:/local.db");
});

const pinned = Buffer.from("pinned bytes");
const manifest = {
  snapshotId: "catalog-test-runtime",
  database: { bytes: pinned.length, sha256: createHash("sha256").update(pinned).digest("hex") },
};

function fixture(t: TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), "database-location-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "prisma"));
  const temporaryDirectory = path.join(root, "tmp");
  mkdirSync(temporaryDirectory);
  const packed = path.join(root, "prisma/marketplace.db.gz");
  writeFileSync(packed, gzipSync(pinned));
  const runtime = path.join(temporaryDirectory, "agent-plugin-marketplace.db");
  const options = { env: { VERCEL: "1", DATABASE_URL: "file:/wrong.db" }, cwd: root, temporaryDirectory, manifest };
  return { root, packed, runtime, temporaryDirectory, options };
}

test("Vercel expands gzip without a raw bundled database, then reuses the matching runtime copy", t => {
  const f = fixture(t);
  assert.equal(databaseUrl(f.options), `file:${f.runtime}`);
  assert.deepEqual(readFileSync(f.runtime), pinned);
  assert.equal(readFileSync(`${f.runtime}.snapshot`, "utf8"), `${manifest.snapshotId}:${manifest.database.sha256}`);
  // Warm instances need neither the archive nor a second decompression.
  rmSync(f.packed);
  databaseUrl(f.options);
  assert.deepEqual(readFileSync(f.runtime), pinned);
});

test("Vercel replaces an old snapshot identity and a missing runtime database", t => {
  const f = fixture(t);
  writeFileSync(f.runtime, "old bytes");
  writeFileSync(`${f.runtime}.snapshot`, "old identity");
  databaseUrl(f.options);
  assert.deepEqual(readFileSync(f.runtime), pinned);
  rmSync(f.runtime);
  databaseUrl(f.options);
  assert.deepEqual(readFileSync(f.runtime), pinned);
});

for (const [label, bytes] of [
  ["invalid gzip", Buffer.from("not gzip")],
  ["truncated gzip", gzipSync(pinned).subarray(0, 12)],
  ["same-size wrong database", gzipSync(Buffer.from("wrong! bytes"))],
  ["short database", gzipSync(Buffer.from("short"))],
  ["oversized database", gzipSync(Buffer.alloc(pinned.length + 1))],
] as const) {
  test(`Vercel rejects ${label} without replacing the previous runtime snapshot`, t => {
    const f = fixture(t);
    writeFileSync(f.runtime, "old bytes");
    writeFileSync(`${f.runtime}.snapshot`, "old identity");
    writeFileSync(f.packed, bytes);
    assert.throws(() => databaseUrl(f.options));
    assert.equal(readFileSync(f.runtime, "utf8"), "old bytes");
    assert.equal(readFileSync(`${f.runtime}.snapshot`, "utf8"), "old identity");
    assert.deepEqual(readdirSync(f.temporaryDirectory).sort(), [path.basename(f.runtime), path.basename(`${f.runtime}.snapshot`)].sort());
  });
}
