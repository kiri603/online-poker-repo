import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';

const [directory, configFile] = process.argv.slice(2);
if (!directory || !configFile) throw Error('Usage: node verify-android-update.mjs <extracted-directory> <release-config>');
const config = JSON.parse(await readFile(configFile, 'utf8'));
const envelope = JSON.parse(await readFile(path.join(directory, 'android-updates/latest.json'), 'utf8'));
const payload = Buffer.from(envelope.payload, 'base64');
assert.ok(verify('RSA-SHA256', payload, createPublicKey({ key: Buffer.from(config.publicKey, 'base64'), type: 'spki', format: 'der' }), Buffer.from(envelope.signature, 'base64')), 'Invalid release signature');
const manifest = JSON.parse(payload);
assert.equal(manifest.runtime, config.runtime); assert.equal(manifest.sequence, config.sequence);
const root = path.resolve(directory, 'android-updates/bundles', String(manifest.sequence));
let total = 0;
for (const file of manifest.files) {
  assert.ok(!/[\\:%?#\x00-\x1f]/.test(file.path) && file.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid resource path');
  const target = path.resolve(root, file.path);
  assert.ok(target.startsWith(root + path.sep));
  assert.equal((await lstat(target)).isSymbolicLink(), false);
  const bytes = await readFile(target);
  assert.equal(bytes.length, file.size); total += bytes.length;
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
assert.equal(total, manifest.totalBytes);
console.log(`Verified signed release ${manifest.sequence}: ${manifest.files.length} resources`);
