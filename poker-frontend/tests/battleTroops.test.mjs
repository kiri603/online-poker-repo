import test from "node:test";
import assert from "node:assert/strict";
import { createTroopActor, getCavalryMotion } from "../src/views/GameBoard/battleTroops.js";

test("the general finishes the downward order before any rider advances", () => {
  assert.equal(getCavalryMotion(.16, 0).swing, 0);
  assert.equal(getCavalryMotion(.39, 0).swing, 1);
  for (let id = 0; id < 8; id++) {
    assert.equal(getCavalryMotion(.42, id).travel, 0);
    assert.equal(getCavalryMotion(.42, id).charge, 0);
  }
});

test("the general leads and the formation follows in a short stagger", () => {
  assert.ok(getCavalryMotion(.445, 0).charge > 0);
  assert.equal(getCavalryMotion(.445, 3).charge, 0);
  for (let id = 0; id < 8; id++) assert.ok(getCavalryMotion(.50, id).charge > 0);
});

test("riders lower their stance and the horizontal charge accelerates", () => {
  assert.ok(getCavalryMotion(.53, 4).lean > .95);
  const distances = [.50, .55, .60].map((p) => getCavalryMotion(p, 0).travel);
  assert.ok(distances[1] > distances[0]);
  assert.ok(distances[2] - distances[1] > distances[1] - distances[0]);
});

test("charge progress stays bounded at both ends of the effect", () => {
  assert.equal(getCavalryMotion(-1, 0).travel, 0);
  assert.equal(getCavalryMotion(2, 0).charge, 1);
  assert.equal(getCavalryMotion(2, 0).lean, 1);
  assert.equal(getCavalryMotion(2, 0).travel, 1.75);
});

test("all invasion cutlasses lead with the curved cutting edge during the downstroke", () => {
  const findBlade = (part) => part.label === "cutlass" ? part : part.children?.map(findBlade).find(Boolean);
  for (const [kind, id] of [["barbarian", 0], ["barbarian", 1], ["elephant", 0]]) {
    const actor = createTroopActor(kind, id);
    const blade = findBlade(actor.container);
    assert.ok(blade, `${kind} must hold a cutlass`);
    actor.animate(1500, .49);
    const tip = blade.toGlobal({ x: 11, y: 132 });
    const spine = blade.toGlobal({ x: -7, y: 75 });
    const edge = blade.toGlobal({ x: 28, y: 75 });
    actor.animate(1530, .50);
    const nextTip = blade.toGlobal({ x: 11, y: 132 });
    const edgeAlignment = (nextTip.x - tip.x) * (edge.x - spine.x) + (nextTip.y - tip.y) * (edge.y - spine.y);
    assert.ok(edgeAlignment > 0, `${kind} ${id} must swing edge-first, rather than spine-first`);
    actor.container.destroy({ children: true });
  }
});
