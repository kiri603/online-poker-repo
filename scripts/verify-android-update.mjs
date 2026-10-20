import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function readManifest(directory, config, sequence = config.sequence) {
  const bytes = await readFile(path.join(directory, 'android-updates/latest.json'));
  assert.ok(bytes.length <= 2 * 1024 * 1024, 'Manifest exceeds size limit');
  const envelope = JSON.parse(bytes);
  const payload = Buffer.from(envelope.payload, 'base64');
  assert.ok(verify('RSA-SHA256', payload, createPublicKey({ key: Buffer.from(config.publicKey, 'base64'), type: 'spki', format: 'der' }), Buffer.from(envelope.signature, 'base64')), 'Invalid release signature');
  const manifest = JSON.parse(payload);
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.runtime, config.runtime, 'Incompatible runtime');
  assert.ok(Number.isSafeInteger(sequence) && sequence > 0);
  assert.equal(manifest.sequence, sequence);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 10000);
  const names = new Set();
  let total = 0;
  for (const file of manifest.files) {
    assert.ok(typeof file.path === 'string' && file.path.length <= 500 && !/[\\:%?#\x00-\x1f\x7f]/.test(file.path)
      && file.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid resource path');
    assert.ok(!names.has(file.path), 'Duplicate resource path'); names.add(file.path);
    assert.ok(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 128 * 1024 * 1024);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    total += file.size;
  }
  assert.ok(names.has('index.html') && total <= 512 * 1024 * 1024);
  assert.equal(total, manifest.totalBytes);
  return { manifest, bytes, root: path.resolve(directory, 'android-updates/bundles', String(sequence)) };
}

export async function readResource(root, file) {
  const target = path.resolve(root, file.path);
  assert.ok(target.startsWith(root + path.sep));
  let current = root;
  assert.ok((await lstat(current)).isDirectory() && !(await lstat(current)).isSymbolicLink());
  for (const part of file.path.split('/')) {
    current = path.join(current, part);
    assert.equal((await lstat(current)).isSymbolicLink(), false, 'Resource symlink rejected');
  }
  assert.equal((await lstat(target)).size, file.size, `Resource size mismatch: ${file.path}`);
  const bytes = await readFile(target);
  assert.equal(bytes.length, file.size, `Resource size mismatch: ${file.path}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Resource hash mismatch: ${file.path}`);
  return bytes;
}

export async function verifyRelease(directory, config) {
  const release = await readManifest(directory, config);
  for (const file of release.manifest.files) await readResource(release.root, file);
  console.log(`Verified signed release ${release.manifest.sequence}: ${release.manifest.files.length} resources`);
  return release;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, configFile] = process.argv.slice(2);
  if (!directory || !configFile) throw Error('Usage: node verify-android-update.mjs <extracted-directory> <release-config>');
  await verifyRelease(directory, JSON.parse(await readFile(configFile, 'utf8')));
}
