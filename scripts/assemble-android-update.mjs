import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest, readResource, verifyRelease } from './verify-android-update.mjs';

export async function assembleUpdate(baseDirectory, deltaDirectory, outputDirectory, config) {
  const next = await readManifest(deltaDirectory, config);
  assert.ok(config.delta.baseSequence < config.sequence, 'Base sequence must precede candidate');
  const base = await readManifest(baseDirectory, config, config.delta.baseSequence);
  const baseFiles = new Map(base.manifest.files.map(file => [file.path, file]));
  // A fresh directory and iteration over only the new manifest exclude deleted old files.
  await mkdir(path.dirname(path.resolve(outputDirectory)), { recursive: true });
  await mkdir(outputDirectory);
  const destination = path.join(outputDirectory, 'android-updates/bundles', String(config.sequence));
  let reused = 0;
  for (const file of next.manifest.files) {
    const deltaFile = path.join(next.root, file.path);
    const exists = await lstat(deltaFile).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (!exists) {
      const previous = baseFiles.get(file.path);
      assert.ok(previous?.sha256 === file.sha256 && previous.size === file.size, `Missing changed resource: ${file.path}`);
      reused++;
    }
    const bytes = await readResource(exists ? next.root : base.root, file);
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  await writeFile(path.join(outputDirectory, 'android-updates/latest.json'), next.bytes, { flag: 'wx' });
  await verifyRelease(outputDirectory, config);
  console.log(`Assembled ${config.sequence}: ${reused} reused, ${next.manifest.files.length - reused} changed resources`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, delta, output, configFile] = process.argv.slice(2);
  if (!configFile) throw Error('Usage: node assemble-android-update.mjs <base-directory> <delta-directory> <fresh-output-directory> <release-config>');
  await assembleUpdate(base, delta, output, JSON.parse(await readFile(configFile, 'utf8')));
}
