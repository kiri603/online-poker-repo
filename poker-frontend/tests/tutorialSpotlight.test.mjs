import test from "node:test";
import assert from "node:assert/strict";
import { visibleCardRects } from "../src/tutorial/tutorialHighlight.js";

test("a folded card spotlight ends before the next card", () => {
  assert.deepEqual(visibleCardRects({ x: 20, y: 40, width: 100, height: 140 }, [
    { x: 60, y: 40, width: 100, height: 140 }, { x: 100, y: 40, width: 100, height: 140 },
  ]), [{ x: 20, y: 40, width: 40, height: 140 }]);
});

test("raised selected cards retain their visible top while excluding every covered area", () => {
  const target = { x: 0, y: 16, width: 100, height: 140 };
  const covering = [{ x: 40, y: 40, width: 100, height: 140 }, { x: 80, y: 24, width: 100, height: 140 }];
  const visible = visibleCardRects(target, covering);
  const area = visible.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  assert.equal(area, 6720);
  for (const rect of visible) for (const other of covering) {
    assert.ok(rect.x + rect.width <= other.x || rect.x >= other.x + other.width ||
      rect.y + rect.height <= other.y || rect.y >= other.y + other.height);
  }
});

test("uncovered and fully covered targets do not create incorrect holes", () => {
  const target = { x: 30, y: 20, width: 64, height: 90 };
  assert.deepEqual(visibleCardRects(target, []), [target]);
  assert.deepEqual(visibleCardRects(target, [{ x: 0, y: 0, width: 100, height: 200 }]), []);
});
