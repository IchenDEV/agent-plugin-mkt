import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { databaseUrl } from "../lib/database-location";

test("production ignores a conflicting custom database while development retains it", () => {
  assert.equal(databaseUrl({ env: { NODE_ENV: "production", DATABASE_URL: "file:/wrong.db" }, cwd: "/app" }), "file:/app/prisma/marketplace.db");
  assert.equal(databaseUrl({ env: { NODE_ENV: "development", DATABASE_URL: "file:/local.db" }, cwd: "/app" }), "file:/local.db");
});

test("Vercel always copies the pin to the existing runtime path and replaces old identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "database-location-"));
  try {
    mkdirSync(path.join(root, "prisma"));
    const temporaryDirectory = path.join(root, "tmp");
    mkdirSync(temporaryDirectory);
    writeFileSync(path.join(root, "prisma/marketplace.db"), "pinned bytes");
    const runtime = path.join(temporaryDirectory, "agent-plugin-marketplace.db");
    writeFileSync(runtime, "old bytes");
    writeFileSync(`${runtime}.snapshot`, "old identity");
    assert.equal(databaseUrl({ env: { VERCEL: "1", DATABASE_URL: "file:./marketplace.db" }, cwd: root, temporaryDirectory }), `file:${runtime}`);
    assert.equal(readFileSync(runtime, "utf8"), "pinned bytes");
    assert.match(readFileSync(`${runtime}.snapshot`, "utf8"), /^catalog-/);
    // A matching identity uses the existing writable copy.
    writeFileSync(runtime, "warm bytes");
    databaseUrl({ env: { VERCEL: "1" }, cwd: root, temporaryDirectory });
    assert.equal(readFileSync(runtime, "utf8"), "warm bytes");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
