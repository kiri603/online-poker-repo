import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacterGeometry } from '../src/characters.js';
import { getBattleGeometry } from '../src/game/battle-geometry.js';

test('战场模型保留颜色、体积和落地位置，并减少远景三角面', () => {
  for (const kind of ['mao','jiahao','mengqi','kun','nailong','naiwa']) {
    const original=getCharacterGeometry(kind), simplified=getBattleGeometry(kind);
    original.computeBoundingBox();simplified.computeBoundingBox();
    assert.ok(simplified.index.count<original.attributes.position.count,kind+' detail reduction');
    assert.ok(simplified.attributes.position.array.every(Number.isFinite));
    assert.equal(simplified.attributes.color.count,simplified.attributes.position.count);
    assert.ok(Math.abs(simplified.boundingBox.min.y)<.0001);
    assert.ok(Math.abs(simplified.boundingBox.max.y-original.boundingBox.max.y)<.15);
  }
});
