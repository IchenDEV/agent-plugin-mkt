import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreSnapshot, verifyCatalogs, readManifest } from './snapshot/core.mjs';
const manifest = await readManifest();
if (manifest.source.kind !== 'github-release') throw new Error('Expected a published Release candidate');
const directory = await mkdtemp(join(tmpdir(), 'catalog-published-'));
try {
  // No local cache/candidate override: public asset availability is mandatory.
  await restoreSnapshot({ databasePath: join(directory, 'marketplace.db'), statePath: join(directory, 'index-state.json') });
  await verifyCatalogs(manifest);
  console.log(`Verified publicly downloadable assets for ${manifest.snapshotId}`);
} finally { await rm(directory, { recursive: true, force: true }); }
