import { resolve } from 'node:path';
import { restoreSnapshot, verifyCatalogs, readManifest } from './snapshot/core.mjs';
// Candidate validation is offline-capable, but uses exactly the manifest hashes.
// Normal builds never set this; missing or corrupt pins always fail closed.
await verifyCatalogs(await readManifest());
const directory = process.env.SNAPSHOT_ASSET_DIRECTORY;
const options = {};
if (directory) {
  const manifest = await readManifest();
  if (manifest.source.kind !== 'github-release') throw new Error('Local candidate must be a release snapshot');
  const mapping = new Map([[manifest.source.url, resolve(directory, manifest.source.asset)]]);
  if (manifest.checkpoint) mapping.set(manifest.checkpoint.url, resolve(directory, `${manifest.snapshotId}.index-state.json`));
  const { readFile } = await import('node:fs/promises');
  options.fetcher = async url => {
    const path = mapping.get(url);
    if (!path) throw new Error('Unrecognized candidate asset URL');
    return new Response(await readFile(path));
  };
}
const manifest = await restoreSnapshot(options);
await verifyCatalogs(manifest);
console.log(`Restored ${manifest.snapshotId} (${manifest.coverage.status}); schema ${manifest.schemaId}`);
