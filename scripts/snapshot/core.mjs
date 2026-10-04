import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

export const ROOT = resolve(import.meta.dirname, '../..');
export const MANIFEST_PATH = resolve(ROOT, 'prisma/snapshot.json');
export const DATABASE_PATH = resolve(ROOT, 'prisma/marketplace.db');
export const STATE_PATH = resolve(ROOT, 'prisma/index-state.json');
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const MAX_DB_BYTES = 1024 * 1024 * 1024;
export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function descriptor(path) {
  return { sha256: await sha256(path), bytes: (await stat(path)).size };
}
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  const { writeFile } = await import('node:fs/promises');
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temp, path);
}
function assertDescriptor(value, label, maxBytes = MAX_DB_BYTES) {
  if (!value || !HASH.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > maxBytes) {
    throw new Error(`Invalid ${label} descriptor`);
  }
}
export function validateManifest(manifest) {
  if (manifest?.formatVersion !== 1 || !ID.test(manifest.snapshotId) || !HASH.test(manifest.schemaId) || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('Invalid snapshot manifest identity');
  }
  if (!['bootstrap', 'partial', 'complete'].includes(manifest.coverage?.status)) throw new Error('Invalid coverage');
  assertDescriptor(manifest.database, 'database');
  if (!HASH.test(manifest.database.schemaSha256)) throw new Error('Missing database schema fingerprint');
  const source = manifest.source;
  if (source?.kind === 'legacy-git') {
    if (!/^[a-f0-9]{40}$/.test(source.commit) || source.url !== `https://raw.githubusercontent.com/IchenDEV/agent-plugin-mkt/${source.commit}/prisma/marketplace.db`) throw new Error('Legacy source must pin the historical commit');
    if (manifest.checkpoint) throw new Error('Legacy snapshot cannot have checkpoint assets');
  } else if (source?.kind === 'github-release') {
    if (!ID.test(source.tag) || source.tag !== manifest.snapshotId || source.asset !== `${manifest.snapshotId}.db.gz`) throw new Error('Release must use unique snapshot identity');
    const base = `https://github.com/IchenDEV/agent-plugin-mkt/releases/download/${source.tag}/`;
    if (source.url !== `${base}${source.asset}`) throw new Error('Invalid pinned release URL');
    assertDescriptor(source, 'compressed database');
    if (manifest.checkpoint) {
      assertDescriptor(manifest.checkpoint, 'checkpoint', 64 * 1024 * 1024);
      if (manifest.checkpoint.url !== `${base}${manifest.snapshotId}.index-state.json`) throw new Error('Checkpoint must belong to the same release');
    }
  } else throw new Error('Unknown snapshot source');
  for (const catalog of ['codex', 'claude']) assertDescriptor(manifest.catalogs?.[catalog], `catalog ${catalog}`, 64 * 1024 * 1024);
  return manifest;
}
export async function readManifest(path = MANIFEST_PATH) {
  return validateManifest(JSON.parse(await readFile(path, 'utf8')));
}
export function inspectDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign key check failed');
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    const schemaSha256 = createHash('sha256').update(JSON.stringify(schema)).digest('hex');
    const counts = Object.fromEntries(['Plugin', 'Skill', 'McpServer'].map(table => [table, db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n]));
    if (!counts.Plugin) throw new Error('Refusing an empty plugin catalog');
    return { schemaSha256, counts };
  } finally { db.close(); }
}
export async function verifyFile(path, expected) {
  const actual = await descriptor(path);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error(`Snapshot checksum/size mismatch: ${path}`);
}
function byteLimit(max) {
  let bytes = 0;
  return new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    callback(bytes > max ? new Error('Snapshot exceeds expected size') : null, chunk);
  }});
}
export async function download(url, destination, expectedBytes, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(180_000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Snapshot download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), byteLimit(expectedBytes), createWriteStream(destination, { flags: 'wx' }));
}
export async function restoreSnapshot({ manifestPath = MANIFEST_PATH, databasePath = DATABASE_PATH, statePath = STATE_PATH, schemaPath = resolve(ROOT, 'prisma/schema.prisma'), fetcher = fetch } = {}) {
  const manifest = await readManifest(manifestPath);
  if (await sha256(schemaPath) !== manifest.schemaId) throw new Error('Snapshot Prisma schema version mismatch');
  await mkdir(dirname(databasePath), { recursive: true });
  const temp = `${databasePath}.${process.pid}.restore`;
  const packed = `${temp}.gz`;
  const checkpoint = `${temp}.state`;
  try {
    // Even warm build caches must exactly match the pin. Never trust existence.
    let cached = false;
    try { await verifyFile(databasePath, manifest.database); cached = true; } catch { /* download pin */ }
    if (!cached) {
      if (manifest.source.kind === 'legacy-git') {
        await download(manifest.source.url, temp, manifest.database.bytes, fetcher);
      } else {
        await download(manifest.source.url, packed, manifest.source.bytes, fetcher);
        await verifyFile(packed, manifest.source);
        await pipeline(createReadStream(packed), createGunzip(), byteLimit(manifest.database.bytes), createWriteStream(temp, { flags: 'wx' }));
      }
      await verifyFile(temp, manifest.database);
    }
    const actual = inspectDatabase(cached ? databasePath : temp);
    if (actual.schemaSha256 !== manifest.database.schemaSha256) throw new Error('Snapshot SQLite schema mismatch');
    // Verify every component before replacing the current database.
    if (manifest.checkpoint) {
      await download(manifest.checkpoint.url, checkpoint, manifest.checkpoint.bytes, fetcher);
      await verifyFile(checkpoint, manifest.checkpoint);
      const state = JSON.parse(await readFile(checkpoint, 'utf8'));
      if (state.schemaVersion !== 1 || !['running', 'partial', 'completed'].includes(state.status)) throw new Error('Invalid index checkpoint');
    }
    if (!cached) await rename(temp, databasePath);
    if (manifest.checkpoint) {
      await mkdir(dirname(statePath), { recursive: true });
      await rename(checkpoint, statePath);
    } else await rm(statePath, { force: true });
    return manifest;
  } finally {
    await Promise.all([temp, packed, checkpoint].map(path => rm(path, { force: true })));
  }
}
export async function compactDatabase(source, destination) {
  const db = new DatabaseSync(source, { readOnly: true });
  try { db.prepare('VACUUM INTO ?').run(destination); } finally { db.close(); }
}
export async function compressDatabase(source, destination) {
  await pipeline(createReadStream(source), createGzip({ level: 9 }), createWriteStream(destination, { flags: 'wx' }));
}
export async function catalogDescriptors(root = ROOT) {
  return { codex: await descriptor(resolve(root, '.agents/plugins/marketplace.json')), claude: await descriptor(resolve(root, '.claude-plugin/marketplace.json')) };
}
export async function verifyCatalogs(manifest, root = ROOT) {
  await verifyFile(resolve(root, '.agents/plugins/marketplace.json'), manifest.catalogs.codex);
  await verifyFile(resolve(root, '.claude-plugin/marketplace.json'), manifest.catalogs.claude);
}
