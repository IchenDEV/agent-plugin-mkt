import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { restoreSnapshot, inspectDatabase, validateManifest, verifyCatalogs, catalogDescriptors } from '../scripts/snapshot/core.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const describe = bytes => ({ sha256: hash(bytes), bytes: bytes.length });
const wrongHash = '0'.repeat(64);

async function fixture(t, { legacy = false, checkpoint = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'catalog-snapshot-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = join(root, 'source.db');
  const db = new DatabaseSync(sourcePath);
  db.exec('CREATE TABLE Plugin (id TEXT PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE Skill (id TEXT PRIMARY KEY); CREATE TABLE McpServer (id TEXT PRIMARY KEY); INSERT INTO Plugin VALUES (\'one\', \'Fixture plugin\');');
  db.close();
  const raw = await readFile(sourcePath);
  const packed = gzipSync(raw);
  const schema = Buffer.from('model Plugin {\n id String @id\n name String\n}\n');
  const schemaPath = join(root, 'schema.prisma');
  await writeFile(schemaPath, schema);
  const snapshotId = 'catalog-test-immutable-001';
  const base = `https://github.com/IchenDEV/agent-plugin-mkt/releases/download/${snapshotId}/`;
  const commit = 'a'.repeat(40);
  const source = legacy
    ? { kind: 'legacy-git', commit, url: `https://raw.githubusercontent.com/IchenDEV/agent-plugin-mkt/${commit}/prisma/marketplace.db` }
    : { kind: 'github-release', tag: snapshotId, asset: `${snapshotId}.db.gz`, url: `${base}${snapshotId}.db.gz`, ...describe(packed) };
  for (const path of ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), '{"plugins":[{"name":"fixture"}]}\n');
  }
  const manifest = {
    formatVersion: 1, snapshotId, schemaId: hash(schema), createdAt: '2026-10-04T00:00:00.000Z',
    coverage: { status: 'partial', scope: 'Offline test fixture only' },
    database: { ...describe(raw), ...inspectDatabase(sourcePath) }, source,
    catalogs: await catalogDescriptors(root),
  };
  const assets = new Map([[source.url, legacy ? raw : packed]]);
  const state = Buffer.from(JSON.stringify({ schemaVersion: 1, status: 'partial', cycleId: 'test-cycle' }));
  if (checkpoint) {
    manifest.checkpoint = { url: `${base}${snapshotId}.index-state.json`, ...describe(state) };
    assets.set(manifest.checkpoint.url, state);
  }
  const manifestPath = join(root, 'snapshot.json');
  const databasePath = join(root, 'active.db');
  const statePath = join(root, 'active-state.json');
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'follow');
    assert.ok(assets.has(url), `Unexpected network destination: ${url}`);
    return new Response(assets.get(url));
  };
  const save = () => writeFile(manifestPath, JSON.stringify(manifest));
  await save();
  return { root, raw, packed, state, manifest, manifestPath, schemaPath, databasePath, statePath, assets, calls, save,
    restore: (extra = {}) => restoreSnapshot({ manifestPath, databasePath, schemaPath, statePath, fetcher, ...extra }) };
}

async function preservedFailure(f, expected) {
  const previous = Buffer.from('Existing database must survive rejected candidate');
  const previousState = Buffer.from('{"old":"checkpoint"}');
  await writeFile(f.databasePath, previous);
  await writeFile(f.statePath, previousState);
  await f.save();
  await assert.rejects(f.restore(), expected);
  assert.deepEqual(await readFile(f.databasePath), previous);
  assert.deepEqual(await readFile(f.statePath), previousState);
  assert.deepEqual((await readdir(f.root)).filter(name => name.includes('.restore')), [], 'temporary downloads must be cleaned up');
}

test('restores a pinned gzip database and checkpoint using only injected assets', async t => {
  const f = await fixture(t, { checkpoint: true });
  const result = await f.restore();
  assert.equal(result.snapshotId, f.manifest.snapshotId);
  assert.deepEqual(await readFile(f.databasePath), f.raw);
  assert.deepEqual(await readFile(f.statePath), f.state);
  assert.deepEqual(inspectDatabase(f.databasePath).counts, { Plugin: 1, Skill: 0, McpServer: 0 });
  assert.deepEqual(f.calls, [f.manifest.source.url, f.manifest.checkpoint.url]);
  await verifyCatalogs(result, f.root);
});

test('restores legacy database from the exact pinned commit and removes stale checkpoint', async t => {
  const f = await fixture(t, { legacy: true });
  await writeFile(f.statePath, 'stale');
  await f.restore();
  assert.deepEqual(await readFile(f.databasePath), f.raw);
  assert.deepEqual(f.calls, [f.manifest.source.url]);
  await assert.rejects(readFile(f.statePath), { code: 'ENOENT' });
});

for (const [label, mutate, expected] of [
  ['missing source', f => { delete f.manifest.source; }, /Unknown snapshot source/],
  ['unknown source', f => { f.manifest.source.kind = 'http'; }, /Unknown snapshot source/],
  ['mutable release URL', f => { f.manifest.source.url = 'https://github.com/IchenDEV/agent-plugin-mkt/releases/latest/download/database.db.gz'; }, /pinned release URL/],
  ['release tag mismatch', f => { f.manifest.source.tag = 'another-release'; }, /unique snapshot identity/],
  ['release asset mismatch', f => { f.manifest.source.asset = '../database.db.gz'; }, /unique snapshot identity/],
  ['Prisma schema fingerprint mismatch', f => { f.manifest.schemaId = wrongHash; }, /Prisma schema version mismatch/],
  ['SQLite schema fingerprint mismatch', f => { f.manifest.database.schemaSha256 = wrongHash; }, /SQLite schema mismatch/],
  ['compressed checksum mismatch', f => { f.manifest.source.sha256 = wrongHash; }, /checksum\/size mismatch/],
  ['compressed size shorter than download', f => { f.manifest.source.bytes--; }, /exceeds expected size/],
  ['compressed size longer than download', f => { f.manifest.source.bytes++; }, /checksum\/size mismatch/],
  ['database checksum mismatch', f => { f.manifest.database.sha256 = wrongHash; }, /checksum\/size mismatch/],
  ['database size shorter than decompression', f => { f.manifest.database.bytes--; }, /exceeds expected size/],
  ['database size longer than decompression', f => { f.manifest.database.bytes++; }, /checksum\/size mismatch/],
]) {
  test(`fails closed on ${label}`, async t => {
    const f = await fixture(t);
    mutate(f);
    await preservedFailure(f, expected);
  });
}

for (const [label, source] of [
  ['unpinned legacy commit', { commit: 'main' }],
  ['legacy URL inconsistent with commit', { url: 'https://raw.githubusercontent.com/IchenDEV/agent-plugin-mkt/main/prisma/marketplace.db' }],
]) {
  test(`rejects ${label} without downloading`, async t => {
    const f = await fixture(t, { legacy: true });
    Object.assign(f.manifest.source, source);
    await preservedFailure(f, /pin the historical commit/);
    assert.deepEqual(f.calls, []);
  });
}

for (const [label, bytes] of [
  ['invalid gzip header', Buffer.from('This is not a gzip stream')],
  ['truncated gzip stream', gzipSync(Buffer.alloc(1000)).subarray(0, 12)],
]) {
  test(`fails closed on ${label}, even when compressed hash is correct`, async t => {
    const f = await fixture(t);
    f.assets.set(f.manifest.source.url, bytes);
    Object.assign(f.manifest.source, describe(bytes));
    await preservedFailure(f, /header|unexpected end|invalid|compression/i);
  });
}

test('rejects non-SQLite content despite valid gzip and all byte hashes', async t => {
  const f = await fixture(t);
  const invalid = Buffer.from('not a SQLite database');
  const packed = gzipSync(invalid);
  Object.assign(f.manifest.database, describe(invalid));
  Object.assign(f.manifest.source, describe(packed));
  f.assets.set(f.manifest.source.url, packed);
  await preservedFailure(f, /not a database/);
});

for (const [label, mutate, expected] of [
  ['checkpoint checksum corruption', f => { f.manifest.checkpoint.sha256 = wrongHash; }, /checksum\/size mismatch/],
  ['checkpoint truncated download', f => { f.assets.set(f.manifest.checkpoint.url, f.state.subarray(0, 10)); }, /checksum\/size mismatch/],
  ['checkpoint invalid JSON', f => { const bytes = Buffer.from('{broken'); f.assets.set(f.manifest.checkpoint.url, bytes); Object.assign(f.manifest.checkpoint, describe(bytes)); }, /JSON|property name/],
  ['checkpoint unsupported schema version', f => { const bytes = Buffer.from('{"schemaVersion":2,"status":"partial"}'); f.assets.set(f.manifest.checkpoint.url, bytes); Object.assign(f.manifest.checkpoint, describe(bytes)); }, /Invalid index checkpoint/],
  ['checkpoint invalid status', f => { const bytes = Buffer.from('{"schemaVersion":1,"status":"success"}'); f.assets.set(f.manifest.checkpoint.url, bytes); Object.assign(f.manifest.checkpoint, describe(bytes)); }, /Invalid index checkpoint/],
  ['checkpoint URL from a different release', f => { f.manifest.checkpoint.url = 'https://github.com/IchenDEV/agent-plugin-mkt/releases/download/other/state.json'; }, /same release/],
]) {
  test(`fails closed on ${label}`, async t => {
    const f = await fixture(t, { checkpoint: true });
    mutate(f);
    await preservedFailure(f, expected);
  });
}

test('valid warm cache skips database download but revalidates the checkpoint', async t => {
  const f = await fixture(t, { checkpoint: true });
  await writeFile(f.databasePath, f.raw);
  await f.restore();
  assert.deepEqual(f.calls, [f.manifest.checkpoint.url]);
  f.manifest.checkpoint.sha256 = wrongHash;
  await f.save();
  await assert.rejects(f.restore(), /checksum\/size mismatch/);
  assert.deepEqual(await readFile(f.databasePath), f.raw);
  assert.deepEqual(await readFile(f.statePath), f.state);
});

test('warm cache is checked for SQLite schema compatibility', async t => {
  const f = await fixture(t);
  await writeFile(f.databasePath, f.raw);
  f.manifest.database.schemaSha256 = wrongHash;
  await f.save();
  await assert.rejects(f.restore(), /SQLite schema mismatch/);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await readFile(f.databasePath), f.raw);
});

test('same-size tampered warm cache is downloaded again instead of trusted', async t => {
  const f = await fixture(t);
  const tampered = Buffer.from(f.raw);
  tampered[tampered.length - 1] ^= 1;
  await writeFile(f.databasePath, tampered);
  await f.restore();
  assert.deepEqual(f.calls, [f.manifest.source.url]);
  assert.deepEqual(await readFile(f.databasePath), f.raw);
});

for (const catalog of ['codex', 'claude']) {
  test(`rejects ${catalog} catalog content mismatch`, async t => {
    const f = await fixture(t);
    await verifyCatalogs(f.manifest, f.root);
    f.manifest.catalogs[catalog].sha256 = wrongHash;
    await assert.rejects(verifyCatalogs(f.manifest, f.root), /checksum\/size mismatch/);
  });
}

test('download HTTP failure is closed and cleans temporary files', async t => {
  const f = await fixture(t);
  const previous = Buffer.from('existing database');
  await writeFile(f.databasePath, previous);
  await assert.rejects(f.restore({ fetcher: async () => new Response('not found', { status: 404 }) }), /HTTP 404/);
  assert.deepEqual(await readFile(f.databasePath), previous);
  assert.deepEqual((await readdir(f.root)).filter(name => name.includes('.restore')), []);
});

test('manifest rejects unsafe identity, empty/oversized descriptors, and legacy checkpoint assets', async t => {
  const f = await fixture(t, { legacy: true });
  for (const mutate of [
    m => { m.snapshotId = '../unsafe'; },
    m => { m.database.bytes = 0; },
    m => { m.database.bytes = 1024 ** 3 + 1; },
    m => { m.catalogs.codex.bytes = 64 * 1024 ** 2 + 1; },
    m => { m.checkpoint = { url: 'https://example.invalid/state' }; },
  ]) {
    const candidate = structuredClone(f.manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate));
  }
});


test('restore CLI rejects mismatched catalogs before replacing an existing database', async t => {
  const f = await fixture(t);
  const scripts = join(f.root, 'scripts');
  const prisma = join(f.root, 'prisma');
  await mkdir(join(scripts, 'snapshot'), { recursive: true });
  await mkdir(prisma);
  await copyFile(fileURLToPath(new URL('../scripts/restore-snapshot.mjs', import.meta.url)), join(scripts, 'restore-snapshot.mjs'));
  await copyFile(fileURLToPath(new URL('../scripts/snapshot/core.mjs', import.meta.url)), join(scripts, 'snapshot/core.mjs'));
  await copyFile(f.schemaPath, join(prisma, 'schema.prisma'));
  f.manifest.catalogs.codex.sha256 = wrongHash;
  await writeFile(join(prisma, 'snapshot.json'), JSON.stringify(f.manifest));
  const previous = Buffer.from('Existing DB before catalog verification');
  const previousState = Buffer.from('Existing state before catalog verification');
  await writeFile(join(prisma, 'marketplace.db'), previous);
  await writeFile(join(prisma, 'index-state.json'), previousState);
  const denyNetwork = join(f.root, 'deny-network.mjs');
  await writeFile(denyNetwork, 'globalThis.fetch = async () => { throw new Error("Unexpected network access before catalog verification"); };');
  const env = { ...process.env };
  delete env.SNAPSHOT_ASSET_DIRECTORY;
  await assert.rejects(promisify(execFile)(process.execPath, ['--import', pathToFileURL(denyNetwork).href, join(scripts, 'restore-snapshot.mjs')], { cwd: f.root, env }), error => {
    assert.match(error.stderr, /checksum\/size mismatch/);
    assert.doesNotMatch(error.stderr, /Unexpected network access/);
    return true;
  });
  assert.deepEqual(await readFile(join(prisma, 'marketplace.db')), previous);
  assert.deepEqual(await readFile(join(prisma, 'index-state.json')), previousState);
});

for (const [label, sql, expected] of [
  ['missing required SQLite table', 'DROP TABLE Skill;', /no such table/],
  ['empty plugin catalog', 'DELETE FROM Plugin;', /empty plugin catalog/],
]) {
  test(`rejects ${label} despite valid asset hashes`, async t => {
    const f = await fixture(t);
    const sourcePath = join(f.root, 'source.db');
    const db = new DatabaseSync(sourcePath);
    db.exec(sql);
    db.close();
    const raw = await readFile(sourcePath);
    const packed = gzipSync(raw);
    Object.assign(f.manifest.database, describe(raw));
    Object.assign(f.manifest.source, describe(packed));
    f.assets.set(f.manifest.source.url, packed);
    await preservedFailure(f, expected);
  });
}
