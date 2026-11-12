import test from 'node:test';
import assert from 'node:assert/strict';
import { canObserve, sightRange } from '../src/game/visibility.js';

const observer = (x, z, vision = 13) => ({ x, z, vision, hp: 100 });

test('林地可以埋伏，靠近后才能发现，阵亡部队不提供视野', () => {
  const hidden = { x: -8, z: 9 };
  assert.ok(!canObserve(observer(-16, 9, 18), hidden));
  assert.ok(canObserve(observer(-11, 9), hidden));
  assert.ok(!canObserve({ ...observer(-11, 9), hp: 0 }, hidden));
});

test('高地增加侦察距离，但山脊和巨石会遮挡视线', () => {
  assert.ok(sightRange(observer(-9, -9)) > sightRange(observer(-25, 0)));
  assert.ok(!canObserve(observer(-15, -9, 20), { x: -3, z: -9 }));
  assert.ok(canObserve(observer(-9, -9), { x: -3, z: -9 }));
  assert.ok(!canObserve(observer(4, 1.8), { x: 11, z: 1.8 }));
});
