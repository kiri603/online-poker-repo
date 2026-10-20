import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleUpdate } from './assemble-android-update.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'poker-update-assembly-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function release(name, sequence, files) {
    const directory = path.join(root, name);
    const entries = Object.entries(files).map(([name, bytes]) => ({ path: name, size: Buffer.byteLength(bytes), sha256: hash(bytes) }));
    const manifest = { schema: 1, runtime: 'fixture-runtime', sequence, files: entries, totalBytes: entries.reduce((sum, f) => sum + f.size, 0) };
    const bytes = Buffer.from(JSON.stringify(manifest));
    const envelope = { payload: bytes.toString('base64'), signature: sign('RSA-SHA256', bytes, keys.privateKey).toString('base64') };
    await mkdir(path.join(directory, 'android-updates'), { recursive: true });
    await writeFile(path.join(directory, 'android-updates/latest.json'), JSON.stringify(envelope));
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(directory, 'android-updates/bundles', String(sequence), name);
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content);
    }
    return directory;
  }
  const base = await release('base', 1, { 'index.html': 'old', 'reused.txt': 'reuse', 'deleted.txt': 'obsolete' });
  const delta = await release('delta', 2, { 'index.html': 'new', 'reused.txt': 'reuse' });
  await rm(path.join(delta, 'android-updates/bundles/2/reused.txt'));
  return { base, delta, output: path.join(root, 'output'), config: { sequence: 2, runtime: 'fixture-runtime', publicKey, delta: { baseSequence: 1 } } };
}
test('assembles exactly the new signed file set and reuses unchanged files', async t => {
  const f = await fixture(t);
  await assembleUpdate(f.base, f.delta, f.output, f.config);
  const bundle = path.join(f.output, 'android-updates/bundles/2');
  assert.deepEqual((await readdir(bundle)).sort(), ['index.html', 'reused.txt']);
  assert.equal(await readFile(path.join(bundle, 'index.html'), 'utf8'), 'new');
  assert.equal(await readFile(path.join(bundle, 'reused.txt'), 'utf8'), 'reuse');
});
test('rejects corrupt reused resources', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.base, 'android-updates/bundles/1/reused.txt'), 'wrong');
  await assert.rejects(assembleUpdate(f.base, f.delta, f.output, f.config), /hash|size/i);
});
test('rejects corrupt delta resources instead of falling back to old resources', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.delta, 'android-updates/bundles/2/index.html'), 'bad');
  await assert.rejects(assembleUpdate(f.base, f.delta, f.output, f.config), /hash/i);
});
test('rejects a tampered signature and incompatible runtime', async t => {
  const f = await fixture(t);
  await assert.rejects(assembleUpdate(f.base, f.delta, f.output, { ...f.config, runtime: 'other' }), /runtime/i);
  const manifestFile = path.join(f.delta, 'android-updates/latest.json');
  const envelope = JSON.parse(await readFile(manifestFile)); envelope.signature = Buffer.alloc(256).toString('base64');
  await writeFile(manifestFile, JSON.stringify(envelope));
  await assert.rejects(assembleUpdate(f.base, f.delta, f.output, f.config), /signature/i);
});
