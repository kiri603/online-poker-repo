import test from 'node:test';
import assert from 'node:assert/strict';
import { readUiTheme, saveUiTheme, normalizeUiTheme } from '../src/store/uiPreferences.js';

test('new devices and unknown stored themes start with the original theme', () => {
  for (const saved of [null, '', 'pink', '{invalid}', 'constructor']) {
    assert.equal(readUiTheme({ getItem: () => saved }), 'original');
  }
  assert.equal(readUiTheme({ getItem: () => 'pop' }), 'pop');
});

test('blocked device storage cannot prevent rendering or applying a theme', () => {
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(readUiTheme(storage), 'original');
  assert.equal(saveUiTheme('pop', storage), false);
  assert.equal(readUiTheme(null), 'original');
});

test('theme persistence only writes a whitelisted device preference', () => {
  const calls = [];
  const storage = { setItem: (...args) => calls.push(args) };
  assert.equal(saveUiTheme('pop', storage), true);
  assert.deepEqual(calls, [['poker:ui-theme', 'pop']]);
  assert.equal(normalizeUiTheme('pop'), 'pop');
  assert.equal(normalizeUiTheme('original'), 'original');
  assert.equal(normalizeUiTheme({ theme: 'pop' }), 'original');
});
