import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CAVALRY_TIMING, createFeedbackDirector } from "../src/store/battleFeedback.js";

function setup() {
  let now = 0;
  const sounds = [];
  const voices = [];
  const timers = new Map();
  let id = 0;
  const context = vm.createContext({
    ref: (value) => ({ value }), CAVALRY_TIMING, createFeedbackDirector: () => createFeedbackDirector(() => now),
    Date: { now: () => now },
    playBattleSound: (kind) => sounds.push(kind), playCavalrySounds: () => sounds.push("cavalry"), stopBattleSounds: () => {},
    playVoicePresentation: (filename, start, notBefore) => voices.push({ filename, start, notBefore }),
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearTimeout: (timer) => timers.delete(timer),
  });
  const source = readFileSync(new URL("../src/store/battleEffects.js", import.meta.url), "utf8")
    .replace(/^import[^\n]*\r?\n/gm, "").replace(/export const /g, "const ");
  vm.runInContext(`${source}\nglobalThis.api = { battleEffects, handleBattleFeedback, clearBattleEffects };`, context);
  return { ...context.api, sounds, voices, timers, setTime: (value) => { now = value; } };
}

for (const success of [true, false]) {
  test(`tieqi ${success ? "success" : "failure"} draws before showing its result`, () => {
    const t = setup();
    const results = [];
    t.handleBattleFeedback({ event: "CARDS_PLAYED", userId: "p1", cards: [{ suit: "♥", rank: "7" }] });
    t.handleBattleFeedback({ event: "TIEQI_JUDGE", userId: "p1", card: { suit: "♦", rank: "3" }, success }, (effect) => results.push(effect.success));
    assert.equal(t.voices[0].notBefore, 600);
    assert.deepEqual(t.sounds, ["card"]);
    assert.equal(t.battleEffects.value.some((effect) => effect.kind === "judgement"), false);
    t.setTime(600);
    t.voices[0].start();
    assert.deepEqual(t.sounds, ["card", "judgement"]);
    assert.equal(t.battleEffects.value.at(-1).card.rank, "3");
    assert.deepEqual(results, []);
    const timer = [...t.timers.values()][0];
    assert.equal(timer.delay, 1900);
    t.setTime(2500);
    timer.fn();
    assert.deepEqual(results, [success]);
    assert.equal(t.battleEffects.value.some((effect) => effect.kind === "judgement"), false);
    assert.equal(t.sounds.includes("cavalry"), success);
  });
}

test("reset cancels both queued judgement and its delayed cavalry result", () => {
  for (const started of [false, true]) {
    const t = setup();
    t.handleBattleFeedback({ event: "TIEQI_JUDGE", userId: "p1", success: true });
    if (started) t.voices[0].start();
    const staleTimers = [...t.timers.values()];
    t.clearBattleEffects();
    if (!started) t.voices[0].start();
    for (const timer of staleTimers) timer.fn();
    assert.equal(t.battleEffects.value.length, 0);
    assert.equal(t.sounds.includes("cavalry"), false);
    assert.equal(t.timers.size, 0);
  }
});
