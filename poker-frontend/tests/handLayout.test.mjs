import test from 'node:test';
import assert from 'node:assert/strict';
import { handSpacing } from '../src/layout/hand.js';

test('first and last cards fit actual content width for 1, 8, 14 and 16 cards', () => {
  for (const count of [1, 8, 14, 16]) {
    const { step, width } = handSpacing(248, 64, count);
    assert.ok(width <= 248);
    if (count > 1) assert.ok(step >= 12);
    assert.equal(width, 64 + Math.max(0, count - 1) * step);
  }
});

test('extreme narrow hands reserve selectable strips and use local scrolling', () => {
  const { step, width } = handSpacing(160, 64, 16);
  assert.equal(step, 12);
  assert.equal(width, 244);
  assert.deepEqual(handSpacing(400, 100, 0), { step: 0, width: 0 });
});

test('table cards keep full faces when space permits, and overlap only when needed', () => {
  assert.deepEqual(handSpacing(820, 80, 5, 84), { step: 84, width: 416 });
  const narrow = handSpacing(240, 80, 5, 84);
  assert.equal(narrow.width, 240);
  assert.equal(narrow.step, 40);
});
