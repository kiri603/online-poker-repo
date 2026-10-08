import test from "node:test";
import assert from "node:assert/strict";
import { createTutorialController } from "../src/tutorial/tutorialController.js";
import { cardId, createTutorialMatch, applyTutorialMove } from "../src/tutorial/tutorialMatch.js";
import { TUTORIAL_STEPS } from "../src/tutorial/tutorialScript.js";
import { createTutorialInvitations } from "../src/tutorial/tutorialInvitations.js";

const clone = (value) => structuredClone(value);
function begin(controller) {
  while (controller.state.phase === "dialogue") controller.continueDialogue();
}
function perform(controller) {
  begin(controller);
  const step = TUTORIAL_STEPS[controller.state.stepIndex];
  for (const id of step.cards) assert.equal(controller.toggleCard(id), true);
  assert.equal(controller.execute(step.action), true);
  while (controller.state.phase === "demo") controller.advanceDemo();
}
function assertCardsConserved(match) {
  const cards = [...Object.values(match.hands).flat(), ...match.deck, ...match.discard, ...match.table];
  assert.equal(cards.length, 54);
  assert.equal(new Set(cards.map(cardId)).size, 54);
}

test("six guided actions finish the same legal match on every restart", () => {
  const controller = createTutorialController();
  const initial = clone(controller.state.match);
  for (let run = 0; run < 3; run++) {
    assert.deepEqual(controller.state.match, initial);
    for (let step = 0; step < 6; step++) {
      perform(controller);
      assertCardsConserved(controller.state.match);
    }
    assert.equal(controller.state.phase, "complete");
    assert.equal(controller.state.match.winner, "you");
    assert.deepEqual(Object.values(controller.state.match.hands).map((hand) => hand.length), [0, 6, 13]);
    controller.restart();
  }
});

test("dialogue, wrong cards, wrong action, and duplicate submissions cannot advance", () => {
  const controller = createTutorialController();
  const initial = clone(controller.state);
  assert.equal(controller.toggleCard("♠3"), false);
  assert.equal(controller.execute("play", ["♠3"]), false);
  assert.deepEqual(controller.state, initial);
  begin(controller);
  assert.equal(controller.toggleCard("♣9"), false);
  assert.equal(controller.execute("pass"), false);
  assert.equal(controller.execute("play", ["♠3", "♣9"]), false);
  controller.toggleCard("♠3");
  assert.equal(controller.execute("play"), true);
  const after = clone(controller.state);
  assert.equal(controller.execute("play", ["♠3"]), false);
  assert.deepEqual(controller.state, after);
});

test("target cards can be deselected and a pair requires both exact cards", () => {
  const controller = createTutorialController();
  perform(controller); perform(controller); perform(controller); begin(controller);
  controller.toggleCard("♠4");
  assert.equal(controller.canExecute("play"), false);
  controller.toggleCard("♠4");
  assert.deepEqual(controller.state.selected, []);
  controller.toggleCard("♥4"); controller.toggleCard("♠4");
  assert.equal(controller.canExecute("play"), true);
});

test("malformed direct commands leave the guided state unchanged", () => {
  const controller = createTutorialController();
  begin(controller);
  const before = clone(controller.state);
  for (const cards of [null, "♠3", {}, ["♠3", "♠3"]]) {
    assert.equal(controller.execute("play", cards), false);
  }
  assert.deepEqual(controller.state, before);
});

test("a presentation failure stops the script and restart recovers a fresh match", () => {
  let failPresentation = true;
  const controller = createTutorialController({ onAction() { if (failPresentation) throw new Error("test presentation failure"); } });
  begin(controller);
  controller.toggleCard("♠3");
  assert.equal(controller.execute("play"), false);
  assert.equal(controller.state.phase, "error");
  const before = clone(controller.state);
  assert.equal(controller.advanceDemo(), false);
  assert.equal(controller.execute("play", ["♠3"]), false);
  assert.deepEqual(controller.state, before);
  failPresentation = false;
  controller.restart();
  assert.equal(controller.state.match.hands.you.length, 8);
  perform(controller);
  assert.equal(controller.state.stepIndex, 1);
});

test("pass draws exactly the two scripted cards and balance does not end the turn", () => {
  const controller = createTutorialController();
  perform(controller); perform(controller); begin(controller);
  assert.equal(controller.execute("pass"), true);
  assert.equal(controller.state.match.hands.you.length, 8);
  assert.deepEqual(controller.state.match.hands.you.slice(-2).map(cardId), ["♥9", "♥3"]);
  while (controller.state.phase === "demo") controller.advanceDemo();
  perform(controller); begin(controller);
  controller.toggleCard("♥3"); controller.execute("replace");
  assert.equal(controller.state.match.hands.you.length, 6);
  assert.equal(controller.state.match.turn, "you");
  assert.equal(controller.state.match.replaced, true);
  assert.equal(controller.state.match.hands.you.at(-1).rank, "10");
  assert.throws(() => applyTutorialMove(controller.state.match, { actor: "you", action: "replace", cards: ["♥10"] }));
});

test("independent pause reasons block dialogue, commands and opponent actions", () => {
  const controller = createTutorialController();
  controller.setPaused("hidden", true);
  assert.equal(controller.continueDialogue(), false);
  controller.setPaused("exit", true); controller.setPaused("hidden", false);
  assert.equal(controller.continueDialogue(), false);
  controller.setPaused("exit", false); begin(controller);
  controller.toggleCard("♠3"); controller.execute("play");
  controller.setPaused("hidden", true);
  const paused = clone(controller.state.match);
  assert.equal(controller.advanceDemo(), false);
  assert.deepEqual(controller.state.match, paused);
  controller.setPaused("hidden", false);
  assert.equal(controller.advanceDemo(), true);
});

test("dispose blocks stale actions and restart clears previous progress", () => {
  const controller = createTutorialController();
  perform(controller); controller.restart();
  assert.equal(controller.state.stepIndex, 0);
  assert.equal(controller.state.match.hands.you.length, 8);
  controller.dispose();
  const state = clone(controller.state);
  assert.equal(controller.continueDialogue(), false);
  assert.equal(controller.advanceDemo(), false);
  assert.equal(controller.restart(), false);
  assert.deepEqual(controller.state, state);
});

test("match rejects empty-table passing, missing cards, illegal patterns and weaker plays atomically", () => {
  const match = createTutorialMatch();
  const before = clone(match);
  for (const move of [
    { actor: "you", action: "pass" },
    { actor: "you", action: "play", cards: ["♥2"] },
    { actor: "you", action: "play", cards: ["♠3", "♣9"] },
    { actor: "dragon", action: "play", cards: ["♥5"] },
  ]) assert.throws(() => applyTutorialMove(match, move));
  assert.deepEqual(match, before);
  const one = applyTutorialMove(match, { actor: "you", action: "play", cards: ["♣9"] });
  assert.throws(() => applyTutorialMove(one, { actor: "dragon", action: "play", cards: ["♥5"] }));
});

test("two teaching sessions do not share hands, selection or progress", () => {
  const first = createTutorialController(), second = createTutorialController();
  perform(first);
  assert.equal(second.state.match.hands.you.length, 8);
  assert.equal(second.state.stepIndex, 0);
  assert.deepEqual(second.state.selected, []);
});

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
};
test("only newly registered accounts receive invitations; showing once survives refresh", () => {
  const localStorage = memoryStorage(), sessionStorage = memoryStorage();
  const user = { id: 1, guest: false }, guest = { guest: true };
  let invites = createTutorialInvitations({ localStorage, sessionStorage });
  assert.equal(invites.shouldOffer(user), false);
  invites.queue(guest); assert.equal(invites.shouldOffer(guest), false);
  invites.queue(user);
  invites = createTutorialInvitations({ localStorage, sessionStorage });
  assert.equal(invites.shouldOffer(user), true);
  assert.equal(invites.shouldOffer({ id: 2, guest: false }), false);
  invites.markShown(user);
  invites = createTutorialInvitations({ localStorage, sessionStorage });
  assert.equal(invites.shouldOffer(user), false);
  invites.queue(user); assert.equal(invites.shouldOffer(user), false);
});

test("unavailable browser storage does not block registration or repeat an invitation in memory", () => {
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  const invites = createTutorialInvitations({ localStorage: blocked, sessionStorage: blocked });
  const user = { id: 3, guest: false };
  invites.queue(user); assert.equal(invites.shouldOffer(user), true);
  invites.markShown(user); assert.equal(invites.shouldOffer(user), false);
});
