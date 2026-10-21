import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const check = fileURLToPath(new URL('../scripts/check-vercel-output.mjs', import.meta.url));
async function fixture(t, { count = 1, raw = false, deferred = false, packed = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vercel-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, '.vercel/output');
  await mkdir(join(output, 'functions'), { recursive: true });
  await mkdir(join(output, 'shared/prisma'), { recursive: true });
  await writeFile(join(output, 'config.json'), '{"version":3}');
  const file = raw ? 'marketplace.db' : 'marketplace.db.gz';
  await writeFile(join(output, 'shared/prisma', file), 'fixture bytes');
  for (let i = 0; i < count; i++) {
    const bundle = join(output, 'functions', `${i}.func`);
    await mkdir(bundle);
    await writeFile(join(bundle, '.vc-config.json'), JSON.stringify({
      runtime: 'nodejs24.x', experimentalAllowBundling: deferred,
      filePathMap: packed || raw ? { [`prisma/${file}`]: `.vercel/output/shared/prisma/${file}` } : {},
    }));
  }
  return { output, run: () => promisify(execFile)(process.execPath, [check, output]) };
}

test('counts shared route aliases once and allows twelve physical bundles', async t => {
  const f = await fixture(t, { count: 12 });
  await symlink('0.func', join(f.output, 'functions/alias.func'));
  const result = await f.run();
  assert.equal(JSON.parse(result.stdout).functions, 12);
});

for (const [label, options, error] of [
  ['too many functions', { count: 13 }, /found 13/],
  ['no functions', { count: 0 }, /found 0/],
  ['raw snapshot', { raw: true }, /Uncompressed snapshot/],
  ['deferred grouping', { deferred: true }, /grouping is deferred/],
  ['missing gzip', { packed: false }, /Compressed database is missing/],
]) {
  test(`deployment gate rejects ${label}`, async t => {
    const f = await fixture(t, options);
    await assert.rejects(f.run(), e => { assert.match(e.stderr, error); return true; });
  });
}
