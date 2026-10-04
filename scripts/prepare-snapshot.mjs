import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, DATABASE_PATH, STATE_PATH, readManifest, sha256, descriptor, inspectDatabase, compactDatabase, compressDatabase, catalogDescriptors, atomicJson, validateManifest } from './snapshot/core.mjs';
// Preparation does not publish or change the active pin. The publisher promotes
// candidate/snapshot.json only after all immutable assets can be downloaded.
const previous = await readManifest();
const id = process.env.SNAPSHOT_ID ?? `catalog-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
if (!/^catalog-[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Unsafe SNAPSHOT_ID');
const out = resolve(ROOT, '.snapshot', id);
await mkdir(out, { recursive: true });
const database = resolve(out, `${id}.db`);
await compactDatabase(DATABASE_PATH, database);
const inspection = inspectDatabase(database);
const schemaId = await sha256(resolve(ROOT, 'prisma/schema.prisma'));
if (schemaId !== previous.schemaId || inspection.schemaSha256 !== previous.database.schemaSha256) throw new Error('Schema changes require explicit snapshot migration');
const asset = `${id}.db.gz`;
await compressDatabase(database, resolve(out, asset));
const base = `https://github.com/IchenDEV/agent-plugin-mkt/releases/download/${id}/`;
const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
if (state.schemaVersion !== 1 || !['partial', 'completed'].includes(state.status)) throw new Error('Indexer must finish or durably checkpoint a partial run before packaging');
const checkpointName = `${id}.index-state.json`;
await copyFile(STATE_PATH, resolve(out, checkpointName));
const manifest = validateManifest({
  formatVersion: 1, snapshotId: id, schemaId, createdAt: new Date().toISOString(),
  coverage: { status: state.status === 'completed' ? 'complete' : 'partial', cycleId: state.cycleId, startedAt: state.startedAt, completedAt: state.completedAt ?? null, reason: state.reason ?? null, scope: 'Configured bounded discovery cycle; not all of GitHub and not a guarantee of freshness', requestMetrics: state.requestMetrics ?? {} },
  database: { ...await descriptor(database), ...inspection },
  source: { kind: 'github-release', tag: id, asset, url: `${base}${asset}`, ...await descriptor(resolve(out, asset)) },
  checkpoint: { url: `${base}${checkpointName}`, ...await descriptor(resolve(out, checkpointName)) },
  catalogs: await catalogDescriptors(),
});
await atomicJson(resolve(out, 'snapshot.json'), manifest);
await copyFile(resolve(ROOT, '.agents/plugins/marketplace.json'), resolve(out, 'codex-marketplace.json'));
await copyFile(resolve(ROOT, '.claude-plugin/marketplace.json'), resolve(out, 'claude-marketplace.json'));
console.log(JSON.stringify({ directory: out, snapshotId: id, rawBytes: manifest.database.bytes, compressedBytes: manifest.source.bytes, coverage: manifest.coverage.status }));
