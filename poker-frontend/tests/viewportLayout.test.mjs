import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewport, observeViewport } from '../src/layout/viewport.js';

function target(values = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(name, fn) { (listeners.get(name) || listeners.set(name, new Set()).get(name)).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name) { listeners.get(name)?.forEach(fn => fn()); },
    count() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  }, values);
}

test('visual viewport includes keyboard height and offset, with window fallback', () => {
  const win = { innerWidth: 390, innerHeight: 844 };
  assert.deepEqual(readViewport(win), { width: 390, height: 844, left: 0, top: 0 });
  win.visualViewport = { width: 390, height: 420, offsetLeft: 0, offsetTop: 34, scale: 1 };
  assert.deepEqual(readViewport(win), { width: 390, height: 420, left: 0, top: 34 });
});

test('pinch zoom freezes layout, and resumes measurement at normal scale', () => {
  const previous = { width: 390, height: 660, left: 0, top: 0 };
  const win = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 195, height: 330, scale: 2, offsetTop: 50 } };
  assert.deepEqual(readViewport(win, previous), previous);
  win.visualViewport.scale = 1;
  win.visualViewport.width = 390;
  assert.equal(readViewport(win, previous).height, 330);
});

test('invalid transient measurements retain the last usable rectangle', () => {
  const previous = { width: 390, height: 660, left: 0, top: 0 };
  assert.deepEqual(readViewport({ innerWidth: 0, innerHeight: 0 }, previous), previous);
});

test('resize events coalesce, page restore updates, and disposal removes all listeners', () => {
  const frames = new Map();
  let id = 0;
  const doc = target({ visibilityState: 'visible' });
  const win = target({ innerWidth: 390, innerHeight: 660, document: doc,
    visualViewport: target({ width: 390, height: 660, scale: 1, offsetTop: 0, offsetLeft: 0 }),
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
  });
  const updates = [];
  const stop = observeViewport(win, rect => updates.push(rect));
  assert.equal(updates.length, 1);
  win.visualViewport.height = 420;
  win.emit('resize');
  win.visualViewport.emit('resize');
  win.visualViewport.emit('scroll');
  assert.equal(frames.size, 1);
  [...frames.values()].forEach(fn => fn()); frames.clear();
  assert.equal(updates.at(-1).height, 420);
  win.visualViewport.height = 600;
  win.emit('pageshow');
  [...frames.values()].forEach(fn => fn()); frames.clear();
  assert.equal(updates.at(-1).height, 600);
  win.emit('resize');
  stop();
  assert.equal(frames.size, 0);
  assert.equal(win.count() + doc.count() + win.visualViewport.count(), 0);
});
