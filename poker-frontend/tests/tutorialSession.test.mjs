import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { computed, ref, shallowRef, watch, effectScope } from "vue";
import { createTutorialController } from "../src/tutorial/tutorialController.js";
import { cardId, createTutorialCard, TUTORIAL_SCROLLS } from "../src/tutorial/tutorialMatch.js";
import { TUTORIAL_NAMES, TUTORIAL_STEPS } from "../src/tutorial/tutorialScript.js";
import { getTutorialLesson } from "../src/tutorial/tutorialLessons.js";
import { CAVALRY_TIMING, createFeedbackDirector } from "../src/store/battleFeedback.js";

function setup(kind = "basic") {
  const timers = new Map(), delays = new Map(), listeners = new Map(), mounted = [], unmounted = [], ducking = [], music = [];
  let timerId = 0, now = 0;
  const scope = effectScope();
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name) };
  const context = vm.createContext({ computed, ref, shallowRef, watch, createTutorialController,
    cardId, createTutorialCard, TUTORIAL_SCROLLS, getTutorialLesson, TUTORIAL_NAMES, TUTORIAL_STEPS, document,
    onMounted: (fn) => mounted.push(fn), onUnmounted: (fn) => unmounted.push(fn),
    Date: { now: () => now }, CAVALRY_TIMING, createFeedbackDirector: () => createFeedbackDirector(() => now),
    playBattleSound: () => {}, playCavalrySounds: () => {}, stopBattleSounds: () => {}, playVoicePresentation: () => {},
    setTimeout: (fn, delay) => { timers.set(++timerId, fn); delays.set(timerId, delay); return timerId; }, clearTimeout: (id) => { timers.delete(id); delays.delete(id); },
    getCardImageUrl: () => "card.png", handleImageError: () => {}, soundStatus: ref(true), toggleSound: () => {},
    playAudio: () => {}, playCardAudio: () => {}, playBGM: (name) => music.push(name), stopGameAudio: () => {},
    setMusicDucking: (source, active) => ducking.push({ source, active }),
  });
  const effectsSource = readFileSync(new URL("../src/store/battleEffects.js", import.meta.url), "utf8")
    .replace(/^import[^\n]*\r?\n/gm, "").replace(/export const /g, "const ");
  vm.runInContext(effectsSource, context);
  const source = readFileSync(new URL("../src/tutorial/useTutorialSession.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  vm.runInContext(`${source}\nglobalThis.createSession = useTutorialSession;`, context);
  const session = scope.run(() => context.createSession(kind));
  mounted.forEach((fn) => fn());
  const tick = () => {
    const [id, fn] = timers.entries().next().value;
    now += delays.get(id); timers.delete(id); delays.delete(id); fn();
  };
  return { session, timers, delays, listeners, document, ducking, music, tick,
    close: () => { unmounted.forEach((fn) => fn()); scope.stop(); } };
}
function firstAction(session) {
  while (session.phase.value === "dialogue") session.controller.continueDialogue();
  session.bindings.toggleSelect({ suit: "♠", rank: "3" });
  assert.equal(session.bindings.playCards(), true);
}

test("auto dialogue is inherited within the tutorial and reset when restarting", () => {
  const t = setup();
  try {
    assert.equal(t.session.autoPlay.value, false);
    t.session.autoPlay.value = true;
    t.session.voiceEnabled.value = false;
    firstAction(t.session);
    assert.equal(t.session.autoPlay.value, true);
    t.session.restart();
    assert.equal(t.session.autoPlay.value, false);
    assert.equal(t.session.voiceEnabled.value, false, "Restart keeps the user's narration mute choice");
  } finally { t.close(); }
  const fresh = setup();
  try {
    assert.equal(fresh.session.autoPlay.value, false);
    assert.equal(fresh.session.voiceEnabled.value, true);
  } finally { fresh.close(); }
});

test("visibility and exit confirmation cancel scheduled opponents without advancing the match", () => {
  const t = setup();
  try {
    firstAction(t.session);
    assert.equal(t.timers.size, 1);
    const stale = [...t.timers.values()][0];
    const before = JSON.stringify(t.session.snapshot.value.match);
    t.document.hidden = true; t.listeners.get("visibilitychange")();
    assert.equal(t.timers.size, 0);
    stale();
    assert.equal(JSON.stringify(t.session.snapshot.value.match), before);
    t.session.bindings.exitGame();
    t.document.hidden = false; t.listeners.get("visibilitychange")();
    assert.equal(t.timers.size, 0);
    t.session.cancelExit();
    assert.equal(t.timers.size, 1);
    t.tick();
    assert.equal(t.session.snapshot.value.match.turn, "tortoise");
    assert.equal(t.timers.size, 1);
  } finally { t.close(); }
});

test("restart and unmount clear timers and prevent stale callbacks from progressing", () => {
  const t = setup();
  firstAction(t.session);
  const stale = [...t.timers.values()][0];
  t.session.restart();
  assert.equal(t.timers.size, 0);
  stale();
  assert.equal(t.session.snapshot.value.stepIndex, 0);
  assert.equal(t.session.bindings.handCards.value.length, 8);
  firstAction(t.session);
  const freshMatch = JSON.stringify(t.session.snapshot.value.match);
  stale();
  assert.equal(JSON.stringify(t.session.snapshot.value.match), freshMatch);
  assert.equal(t.timers.size, 1);
  const afterExit = [...t.timers.values()][0];
  t.close();
  assert.equal(t.timers.size, 0);
  assert.equal(t.listeners.size, 0);
  assert.deepEqual(t.ducking.at(-1), { source: "tutorial", active: false });
  const before = JSON.stringify(t.session.snapshot.value);
  afterExit();
  assert.equal(JSON.stringify(t.session.snapshot.value), before);
});

test("the board bindings derive cards and turn from their own tutorial session", () => {
  const first = setup(), second = setup();
  try {
    firstAction(first.session);
    assert.equal(first.session.bindings.handCards.value.length, 7);
    assert.equal(first.session.bindings.currentTurn.value, "关羽");
    assert.equal(first.session.bindings.tableCards.value[0].rank, "3");
    assert.equal(second.session.bindings.handCards.value.length, 8);
    assert.equal(second.session.bindings.currentTurn.value, "你");
    assert.equal(second.session.bindings.tableCards.value.length, 0);
    assert.equal(second.session.bindings.countdown.value, 0);
    assert.equal(second.session.bindings.showSkillSelection.value, false);
  } finally { first.close(); second.close(); }
});

test("advanced bindings expose responses, harvest selection and the formal scroll effects", () => {
  const t = setup("advanced");
  try {
    for (const step of getTutorialLesson("advanced").steps) {
      while (t.session.phase.value === "dialogue") t.session.controller.continueDialogue();
      for (const id of step.cards) {
        const card = createTutorialCard(id);
        if (step.action === "confirmWgfd") assert.equal(t.session.bindings.toggleWgfdSelect(card), true);
        else assert.equal(t.session.bindings.toggleSelect(card), true);
      }
      if (step.action === "respondAoe") {
        assert.equal(t.session.bindings.currentTurn.value, "关羽");
        assert.equal(t.session.bindings.amIPendingAoe.value, true);
        assert.equal(t.session.bindings.phaseNotice.value.title, "南蛮入侵");
        assert.equal(t.session.bindings.respondAoe(null), true);
      } else if (step.action === "confirmWgfd") {
        assert.equal(t.session.bindings.showWgfdModal.value, true);
        assert.equal(t.session.bindings.selectedWgfdCard.value.length, 1);
        assert.equal(t.session.bindings.confirmWgfd(), true);
      } else if (step.action === "discardAoe") assert.equal(t.session.bindings.discardAoe(), true);
      else assert.equal(t.session.bindings.playCards(), true);
      if (step.cards[0]?.startsWith("SCROLL")) {
        const effect = t.session.battleSession.battleEffects.value.at(-1);
        assert.equal(effect.title, TUTORIAL_SCROLLS[step.cards[0].slice(6)].name);
        assert.ok([...t.delays.values()][0] >= effect.duration);
      }
      while (t.session.phase.value === "demo") t.tick();
    }
    assert.equal(t.session.phase.value, "complete");
    assert.equal(t.session.bindings.showWgfdModal.value, false);
    assert.equal(t.session.bindings.jdsrTarget.value, null);
  } finally { t.close(); }
});

test("selecting the full target set moves the highlight from cards to the required button", () => {
  const t = setup();
  try {
    const card = { suit: "♠", rank: "3" };
    while (t.session.phase.value === "dialogue") t.session.controller.continueDialogue();
    assert.equal(t.session.policy.isTarget(card), true);
    assert.equal(t.session.policy.isActionTarget("play"), false);
    t.session.bindings.toggleSelect(card);
    assert.equal(t.session.policy.isTarget(card), false);
    assert.equal(t.session.policy.isActionTarget("play"), true);
    assert.equal(t.session.policy.canAction("pass"), false);
    t.session.bindings.toggleSelect(card);
    assert.equal(t.session.policy.isTarget(card), true);
    assert.equal(t.session.policy.isActionTarget("play"), false);
  } finally { t.close(); }
});

test("tutorial balance and straight use formal effects and finish before the next lecture", () => {
  const t = setup();
  try {
    for (let i = 0; i < 6; i++) {
      const step = TUTORIAL_STEPS[i];
      while (t.session.phase.value === "dialogue") t.session.controller.continueDialogue();
      for (const id of step.cards) t.session.controller.toggleCard(id);
      assert.equal(t.session.controller.execute(step.action), true);
      if (i === 4 || i === 5) {
        const effect = t.session.battleSession.battleEffects.value.at(-1);
        assert.equal(effect.kind, i === 4 ? "balance" : "straight");
        assert.ok([...t.delays.values()][0] >= effect.duration);
        assert.equal(t.session.bindings.activeActionTexts.value["你"]?.text, i === 4 ? "制衡" : undefined);
      }
      while (t.session.phase.value === "demo") t.tick();
    }
    assert.equal(t.session.phase.value, "complete");
    assert.equal(t.music.at(-1), "Win");
    t.session.restart();
    assert.equal(t.music.at(-1), "Normal");
    assert.equal(t.session.battleSession.battleEffects.value.length, 0);
  } finally { t.close(); }
});

test("advanced restart clears the harvest pool and hidden or exited sessions cannot run stale demonstrations", () => {
  const t = setup("advanced");
  try {
    let stale;
    for (let i = 0; i < 5; i++) {
      const step = getTutorialLesson("advanced").steps[i];
      while (t.session.phase.value === "dialogue") t.session.controller.continueDialogue();
      for (const id of step.cards) t.session.controller.toggleCard(id);
      t.session.controller.execute(step.action);
      stale = [...t.timers.values()][0];
      while (t.session.phase.value === "demo") t.tick();
    }
    assert.equal(t.session.bindings.showWgfdModal.value, true);
    const before = JSON.stringify(t.session.snapshot.value.match);
    t.document.hidden = true; t.listeners.get("visibilitychange")();
    stale();
    assert.equal(JSON.stringify(t.session.snapshot.value.match), before);
    assert.equal(t.timers.size, 0);
    t.session.bindings.exitGame();
    t.document.hidden = false; t.listeners.get("visibilitychange")();
    assert.equal(t.session.snapshot.value.paused, true);
    t.session.cancelExit();
    assert.equal(t.session.snapshot.value.paused, false);
    t.session.restart(); stale();
    assert.equal(t.session.bindings.showWgfdModal.value, false);
    assert.equal(t.session.bindings.wgfdCards.value.length, 0);
    assert.equal(t.session.bindings.currentAoeType.value, null);
    assert.equal(t.session.bindings.handCards.value.length, 8);
    assert.equal(t.session.snapshot.value.stepIndex, 0);
  } finally { t.close(); }
});

test("switching from basic to advanced discards the old timer without changing the new session", () => {
  const basic = setup();
  firstAction(basic.session);
  const stale = [...basic.timers.values()][0];
  basic.close();
  const advanced = setup("advanced");
  try {
    const before = JSON.stringify(advanced.session.snapshot.value);
    stale();
    assert.equal(JSON.stringify(advanced.session.snapshot.value), before);
    assert.equal(advanced.session.bindings.otherPlayers.value[0].userId, "关羽");
    assert.equal(advanced.session.bindings.otherPlayers.value[1].userId, "张飞");
  } finally { advanced.close(); }
});
