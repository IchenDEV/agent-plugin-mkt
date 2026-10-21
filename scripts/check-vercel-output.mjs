import assert from 'node:assert/strict';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

const output = resolve(process.argv[2] || '.vercel/output');
const project = resolve(output, '../..');
assert.equal(JSON.parse(await readFile(join(output, 'config.json'), 'utf8')).version, 3);
const bundles = new Set();
async function findFunctions(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.endsWith('.func')) bundles.add(await realpath(path));
    else if (entry.isDirectory()) await findFunctions(path);
  }
}
await findFunctions(join(output, 'functions'));
assert.ok(bundles.size > 0 && bundles.size <= 12, `Expected 1–12 function bundles, found ${bundles.size}`);
let snapshots = 0;
const report = [];
for (const bundle of bundles) {
  const config = JSON.parse(await readFile(join(bundle, '.vc-config.json'), 'utf8'));
  assert.ok(!config.experimentalAllowBundling, 'Function grouping is deferred; rebuild with NEXT_ENABLE_ADAPTER=0 before counting');
  const files = new Map(Object.entries(config.filePathMap || {}).map(([target, source]) => [target, resolve(project, source)]));
  for (const file of await readdir(bundle, { recursive: true })) {
    const path = join(bundle, file);
    if ((await stat(path)).isFile()) files.set(file, path);
  }
  let bytes = 0;
  for (const [target, source] of files) {
    assert.ok(!/(^|\/)prisma\/(marketplace\.db|index-state\.json)$/.test(target), `Uncompressed snapshot/checkpoint bundled: ${target}`);
    if (target.endsWith('prisma/marketplace.db.gz')) snapshots++;
    bytes += (await stat(source)).size;
  }
  assert.ok(bytes < 250 * 1024 ** 2, `Function exceeds 250 MiB: ${relative(output, bundle)}`);
  report.push({ function: relative(output, bundle), bytes });
}
assert.ok(snapshots > 0, 'Compressed database is missing from all function bundles');
console.log(JSON.stringify({ functions: bundles.size, limit: 12, bundles: report }, null, 2));
