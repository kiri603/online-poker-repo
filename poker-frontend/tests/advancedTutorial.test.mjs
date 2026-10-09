import test from "node:test";
import assert from "node:assert/strict";
import { createTutorialController } from "../src/tutorial/tutorialController.js";
import { cardId } from "../src/tutorial/tutorialMatch.js";
import { getTutorialLesson } from "../src/tutorial/tutorialLessons.js";
import { applyAdvancedTutorialMove, createAdvancedTutorialMatch } from "../src/tutorial/advancedTutorialMatch.js";

const move = (actor, action, cards = []) => ({ actor, action, cards });
function conserved(match) {
  const cards = [...Object.values(match.hands).flat(), ...match.deck, ...match.discard, ...match.table, ...match.wgfdCards];
  assert.equal(cards.length, 58);
  assert.equal(new Set(cards.map(cardId)).size, 58);
}
function perform(controller) {
  while (controller.state.phase === "dialogue") controller.continueDialogue();
  const step = getTutorialLesson("advanced").steps[controller.state.stepIndex];
  for (const id of step.cards) assert.equal(controller.toggleCard(id), true);
  assert.equal(controller.execute(step.action), true);
  while (controller.state.phase === "demo") assert.equal(controller.advanceDemo(), true);
  conserved(controller.state.match);
}

test("all four scroll chapters finish one conserved match and restart deterministically", () => {
  const controller = createTutorialController({ kind: "advanced" });
  const initial = structuredClone(controller.state.match);
  const actions = [];
  for (let run = 0; run < 2; run++) {
    assert.deepEqual(controller.state.match, initial);
    for (const step of getTutorialLesson("advanced").steps) {
      actions.push(step.action);
      perform(controller);
      assert.notEqual(controller.state.phase, "error");
    }
    assert.equal(controller.state.phase, "complete");
    assert.equal(controller.state.match.currentAoeType, null);
    assert.equal(controller.state.match.jdsrTarget, null);
    assert.equal(controller.state.match.winner, "");
    assert.equal(controller.state.match.hands.you.length, 4);
    controller.restart();
  }
  assert.ok(actions.includes("discardAoe"));
  assert.ok(actions.includes("respondAoe"));
  assert.ok(actions.includes("confirmWgfd"));
});

test("scroll responses belong to pending players even during an opponent turn", () => {
  const controller = createTutorialController({ kind: "advanced" });
  perform(controller); perform(controller); perform(controller);
  assert.equal(controller.state.match.turn, "dragon");
  assert.deepEqual(controller.state.match.pendingAoePlayers, ["you"]);
  while (controller.state.phase === "dialogue") controller.continueDialogue();
  assert.equal(controller.canExecute("respondAoe"), true);
  assert.equal(controller.canExecute("play", ["♥7"]), false);
  const before = controller.state.match.hands.you.length;
  assert.equal(controller.execute("respondAoe"), true);
  assert.equal(controller.state.match.hands.you.length, before + 2);
  const settled = structuredClone(controller.state);
  assert.equal(controller.execute("respondAoe"), false);
  assert.deepEqual(controller.state, settled);
});

test("pending resolution, mixed scrolls and a second scroll cannot alter the original match", () => {
  const initial = createAdvancedTutorialMatch();
  for (const command of [move("you", "play", ["SCROLLWJQF", "♠3"]), move("you", "play", ["SCROLLJDSR"])]) {
    assert.throws(() => applyAdvancedTutorialMove(initial, command));
    conserved(initial);
  }
  let match = applyAdvancedTutorialMove(initial, move("you", "play", ["SCROLLWJQF"]));
  const before = structuredClone(match);
  assert.throws(() => applyAdvancedTutorialMove(match, move("you", "play", ["♣4"])));
  assert.throws(() => applyAdvancedTutorialMove(match, move("you", "replace", ["♠3"])));
  assert.deepEqual(match, before);
  match = applyAdvancedTutorialMove(match, move("you", "discardAoe", ["♠3"]));
  match = applyAdvancedTutorialMove(match, move("dragon", "discardAoe", ["♣3"]));
  match = applyAdvancedTutorialMove(match, move("tortoise", "respondAoe"));
  assert.equal(match.turn, "you");
  assert.throws(() => applyAdvancedTutorialMove(match, move("you", "play", ["SCROLLWGFD"])));
});

function swapIntoHand(match, actor, oldId, newId) {
  const handIndex = match.hands[actor].findIndex((c) => cardId(c) === oldId);
  const deckIndex = match.deck.findIndex((c) => cardId(c) === newId);
  [match.hands[actor][handIndex], match.deck[deckIndex]] = [match.deck[deckIndex], match.hands[actor][handIndex]];
}

test("black and small joker answer arrows; red and big joker answer invasion", () => {
  for (const [scroll, candidate, valid] of [
    ["WJQF", "♠3", true], ["WJQF", "♥7", false], ["WJQF", "小王", true], ["WJQF", "大王", false],
    ["NMRQ", "♠3", false], ["NMRQ", "♥7", true], ["NMRQ", "小王", false], ["NMRQ", "大王", true],
  ]) {
    let match = createAdvancedTutorialMatch();
    if (candidate.includes("王")) swapIntoHand(match, "you", "♠3", candidate);
    if (scroll === "NMRQ") match = applyAdvancedTutorialMove(match, move("you", "play", ["♣4"]));
    match = applyAdvancedTutorialMove(match, move(scroll === "WJQF" ? "you" : "dragon", "play", ["SCROLL" + scroll]));
    const before = structuredClone(match), count = match.hands.you.length;
    if (valid) {
      const result = applyAdvancedTutorialMove(match, move("you", "discardAoe", [candidate]));
      assert.equal(result.hands.you.length, count - 1);
      assert.ok(!result.pendingAoePlayers.includes("you"));
      assert.equal(cardId(result.discard.at(-1)), candidate);
      conserved(result);
    } else assert.throws(() => applyAdvancedTutorialMove(match, move("you", "discardAoe", [candidate])));
    assert.deepEqual(match, before);
  }
});

test("harvest reveals one card per player and rotates one selection at a time", () => {
  let match = applyAdvancedTutorialMove(createAdvancedTutorialMatch(), move("you", "play", ["SCROLLWGFD"]));
  assert.equal(match.wgfdCards.length, 3);
  assert.deepEqual(match.wgfdQueue, ["you", "dragon", "tortoise"]);
  assert.throws(() => applyAdvancedTutorialMove(match, move("dragon", "confirmWgfd", [cardId(match.wgfdCards[0])])));
  assert.throws(() => applyAdvancedTutorialMove(match, move("you", "confirmWgfd", ["♣4"])));
  for (const actor of ["you", "dragon", "tortoise"]) {
    const selected = cardId(match.wgfdCards[0]), count = match.hands[actor].length;
    match = applyAdvancedTutorialMove(match, move(actor, "confirmWgfd", [selected]));
    assert.equal(match.hands[actor].length, count + 1);
    assert.equal(cardId(match.hands[actor].at(-1)), selected);
    assert.throws(() => applyAdvancedTutorialMove(match, move(actor, "confirmWgfd", [selected])));
    conserved(match);
  }
  assert.equal(match.currentAoeType, null);
  assert.deepEqual(match.wgfdCards, []);
  assert.equal(match.turn, "you");
});

function borrowedMatch() {
  const controller = createTutorialController({ kind: "advanced" });
  for (let i = 0; i < 7; i++) perform(controller);
  return applyAdvancedTutorialMove(controller.state.match, move("you", "play", ["SCROLLJDSR"]));
}

test("borrowed passing draws only one card and restores the initiator without replacing the table", () => {
  const match = borrowedMatch();
  assert.equal(match.jdsrTarget, "dragon");
  assert.throws(() => applyAdvancedTutorialMove(match, move("dragon", "replace", ["♠K"])));
  assert.throws(() => applyAdvancedTutorialMove(match, move("dragon", "play", ["SCROLLWJQF"])));
  const count = match.hands.dragon.length;
  const result = applyAdvancedTutorialMove(match, move("dragon", "pass"));
  assert.equal(result.hands.dragon.length, count + 1);
  assert.equal(result.turn, "you");
  assert.equal(result.last, "tortoise");
  assert.deepEqual(result.table, match.table);
  assert.equal(result.jdsrTarget, null);
  assert.equal(result.usedScrolls.you, true);
  conserved(result);
});

test("a successful borrowed reply belongs to the initiator and rejects insufficient plays", () => {
  const match = borrowedMatch();
  assert.throws(() => applyAdvancedTutorialMove(match, move("dragon", "play", ["♠K"])));
  swapIntoHand(match, "dragon", "♠K", "♠2");
  const result = applyAdvancedTutorialMove(match, move("dragon", "play", ["♠2"]));
  assert.equal(result.last, "you");
  assert.equal(result.turn, "dragon");
  assert.deepEqual(result.table.map(cardId), ["♠2"]);
  assert.equal(result.jdsrTarget, null);
  conserved(result);
});

test("guided invalid commands and independent pauses leave the advanced state unchanged", () => {
  const controller = createTutorialController({ kind: "advanced" });
  perform(controller);
  while (controller.state.phase === "dialogue") controller.continueDialogue();
  const before = structuredClone(controller.state);
  assert.equal(controller.toggleCard("♥7"), false);
  assert.equal(controller.execute("discardAoe", ["♥7"]), false);
  assert.equal(controller.execute("respondAoe"), false);
  assert.deepEqual(controller.state, before);
  controller.setPaused("rules", true); controller.setPaused("hidden", true);
  controller.setPaused("rules", false);
  assert.equal(controller.toggleCard("♠3"), false);
  controller.setPaused("hidden", false);
  controller.toggleCard("♠3"); controller.execute("discardAoe");
  controller.setPaused("exit", true);
  const paused = structuredClone(controller.state.match);
  assert.equal(controller.advanceDemo(), false);
  assert.deepEqual(controller.state.match, paused);
  controller.setPaused("exit", false);
  assert.equal(controller.advanceDemo(), true);
});
