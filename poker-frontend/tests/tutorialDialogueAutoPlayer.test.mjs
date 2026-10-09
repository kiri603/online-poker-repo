import test from "node:test";
import assert from "node:assert/strict";
import { createTutorialDialogueAutoPlayer } from "../src/tutorial/tutorialDialogueAutoPlayer.js";

function setup() {
  let time = 0, sequence = 0, advances = 0;
  const timers = new Map();
  const player = createTutorialDialogueAutoPlayer({
    onAdvance: () => advances++, now: () => time,
    setTimer: (fn, delay) => { timers.set(++sequence, { fn, at: time + delay }); return sequence; },
    clearTimer: (id) => timers.delete(id),
  });
  const state = { text: "主公我们又见面啦！", enabled: false, paused: false,
    voiceEnabled: true, hasVoice: true, status: "playing" };
  return { player, state, timers, get advances() { return advances; },
    update(change = {}) { Object.assign(state, change); player.update(state); },
    elapse(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
    } };
}

test("auto dialogue waits for audio end and is off by default", () => {
  const t = setup();
  t.update({ status: "ended" }); t.elapse(10000);
  assert.equal(t.advances, 0);
  t.update({ enabled: true, status: "playing" }); t.elapse(10000);
  assert.equal(t.advances, 0);
  t.update({ status: "ended" });
  t.elapse(649); assert.equal(t.advances, 0);
  t.elapse(1); assert.equal(t.advances, 1);
  t.update(); t.elapse(10000);
  assert.equal(t.advances, 1, "An ended recording advances only once");
});

test("pausing preserves the remaining auto delay", () => {
  const t = setup();
  t.update({ enabled: true, status: "ended" }); t.elapse(200);
  t.update({ paused: true }); t.elapse(10000);
  assert.equal(t.advances, 0);
  t.update({ paused: false }); t.elapse(449);
  assert.equal(t.advances, 0);
  t.elapse(1); assert.equal(t.advances, 1);
});

test("turning auto off, skipping and replacing text invalidate pending callbacks", () => {
  const t = setup();
  t.update({ enabled: true, status: "ended" });
  const old = [...t.timers.values()][0].fn;
  t.update({ enabled: false }); old();
  assert.equal(t.advances, 0);
  t.update({ enabled: true });
  const skipped = [...t.timers.values()][0].fn;
  t.player.cancel(); skipped();
  assert.equal(t.advances, 0);
  t.update({ text: "下一句", status: "playing" }); old(); skipped();
  assert.equal(t.advances, 0);
  t.update({ status: "ended" }); t.elapse(650);
  assert.equal(t.advances, 1);
});

test("muted or missing recordings leave reading time before advancing", () => {
  const t = setup();
  t.update({ enabled: true, voiceEnabled: false });
  t.elapse(2499); assert.equal(t.advances, 0);
  t.elapse(1); assert.equal(t.advances, 1);
  t.update({ text: "一".repeat(40), voiceEnabled: true, hasVoice: false });
  t.elapse(5599); assert.equal(t.advances, 1);
  t.elapse(1); assert.equal(t.advances, 2);
});

test("audio failure falls back to reading and disposal cancels advancement", () => {
  const t = setup();
  t.update({ enabled: true, status: "blocked" }); t.elapse(10000);
  assert.equal(t.advances, 0);
  t.update({ status: "error" });
  const stale = [...t.timers.values()][0].fn;
  t.player.dispose(); stale(); t.elapse(10000);
  assert.equal(t.advances, 0);
  assert.equal(t.timers.size, 0);
});

test("restoring narration cancels the old muted reading timer", () => {
  const t = setup();
  t.update({ enabled: true, voiceEnabled: false });
  const muted = [...t.timers.values()][0].fn;
  t.update({ voiceEnabled: true, status: "playing" });
  muted(); t.elapse(10000);
  assert.equal(t.advances, 0, "Wait for the restored recording to finish");
  t.update({ status: "ended" }); t.elapse(650);
  assert.equal(t.advances, 1);
});
