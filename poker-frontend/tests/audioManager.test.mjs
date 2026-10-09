import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getCardFeedback } from "../src/store/battleFeedback.js";

function setup({ requireGesture = false } = {}) {
  const audios = [];
  const watchers = [];
  const warnings = [];
  const playback = new Map();
  let userGesture = false;
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
      dispatch: (type) => {
        userGesture = ["click", "touchend", "keydown"].includes(type);
        try { for (const fn of [...(listeners.get(type) || [])]) fn(); }
        finally { userGesture = false; }
      },
    };
  };
  const document = { ...eventTarget(), hidden: false, visibilityState: "visible" };
  const window = { ...eventTarget(), localStorage: { getItem: () => null, setItem: () => {} } };
  const sound = { value: true };
  const context = vm.createContext({
    isSoundOn: sound, getCardFeedback, console: { warn: (...args) => warnings.push(args) }, Date, setTimeout, clearTimeout,
    computed: (fn) => ({ get value() { return fn(); } }), reactive: (value) => value,
    watch: (source, cb) => watchers.push({ source, cb }),
    setBattleSoundVolume: () => {}, stopBattleSounds: () => {},
    document, window,
    Audio: class {
      constructor(src = "") {
        this.src = src; this.volume = 1; this.unlocked = false;
        this.playCalls = 0; this.loadCalls = 0; audios.push(this);
      }
      get src() { return this.filename; }
      set src(value) { this.filename = value; this.paused = true; this.ended = false; this.error = null; this.currentTime = 0; }
      play() {
        this.playCalls++;
        if (requireGesture && !this.unlocked && !userGesture) {
          return Promise.reject(Object.assign(new Error("User gesture required"), { name: "NotAllowedError" }));
        }
        const result = playback.get(this.src);
        if (typeof result === "function") return result(this);
        if (result) return Promise.reject(result);
        this.unlocked = true; this.paused = false; this.ended = false;
        return Promise.resolve();
      }
      pause() { this.paused = true; }
      load() { this.loadCalls++; this.error = null; this.paused = true; this.ended = false; this.currentTime = 0; }
      finish() { this.paused = true; this.ended = true; this.onended?.(); }
    },
  });
  const source = readFileSync(new URL("../src/store/audioManager.js", import.meta.url), "utf8");
  const clean = source.replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/export const /g, "const ");
  vm.runInContext(`${clean}\nglobalThis.api = { playBGM, playAudio, playCardAudio, playVoicePresentation, stopGameAudio, audioLevels, setMusicDucking };`, context);
  const setSound = (value) => { sound.value = value; watchers.find((w) => w.source === sound).cb(value); };
  return {
    audios, api: context.api, warnings, playback, document, window,
    bgm: () => audios.findLast((audio) => /\/(Normal|Exciting|Welcome|Win|Lose)\.mp3$/.test(audio.src)),
    dispatch: document.dispatch, mute: () => setSound(false), unmute: () => setSound(true),
  };
}

const settlePlayback = () => new Promise((resolve) => setImmediate(resolve));

test("BGM keeps the media element unlocked by a gesture across track changes", async () => {
  const t = setup({ requireGesture: true });
  t.api.playBGM("Welcome");
  await settlePlayback();
  t.dispatch("click");
  await settlePlayback();
  const unlocked = t.bgm();
  assert.equal(unlocked.paused, false);

  t.api.playBGM("Normal");
  await settlePlayback();
  assert.equal(t.bgm().paused, false);
  assert.equal(t.bgm(), unlocked);
  t.api.playBGM("Exciting", false);
  await settlePlayback();
  assert.equal(t.bgm().paused, false);
  assert.equal(t.bgm().loop, false);
  t.bgm().finish();
  await settlePlayback();
  assert.equal(t.bgm().src, "/audios/Normal.mp3");
  assert.equal(t.bgm().paused, false);
  assert.equal(t.bgm().loop, true);
  assert.equal(t.bgm(), unlocked);
});

test("later gestures recover a failed return from Exciting to Normal", async () => {
  const t = setup();
  t.api.playBGM("Normal");
  t.dispatch("click");
  t.api.playAudio("combo_bomb");
  const error = Object.assign(new Error("Playback denied"), { name: "NotAllowedError" });
  t.playback.set("/audios/Normal.mp3", error);
  t.bgm().finish();
  await settlePlayback();
  assert.equal(t.bgm().src, "/audios/Normal.mp3");
  assert.equal(t.bgm().paused, true);
  t.playback.clear();
  t.dispatch("touchend");
  await settlePlayback();
  assert.equal(t.bgm().paused, false);
  assert.equal(t.bgm().loop, true);
  assert.equal(t.warnings[0][1], error);

  t.bgm().pause();
  t.dispatch("click");
  assert.equal(t.bgm().paused, false);
  t.bgm().pause();
  t.dispatch("keydown");
  assert.equal(t.bgm().paused, false);
});

test("recovering blocked Exciting preserves its one-shot loop and return to Normal", async () => {
  const t = setup();
  t.api.playBGM("Normal");
  t.dispatch("click");
  t.playback.set("/audios/Exciting.mp3", Object.assign(new Error("Playback denied"), { name: "NotAllowedError" }));
  t.api.playAudio("last_1");
  await settlePlayback();
  assert.equal(t.bgm().paused, true);
  t.playback.clear();
  t.dispatch("click");
  assert.equal(t.bgm().paused, false);
  assert.equal(t.bgm().loop, false);
  t.bgm().finish();
  assert.equal(t.bgm().src, "/audios/Normal.mp3");
  assert.equal(t.bgm().loop, true);
});

test("returning to the foreground resumes BGM without resetting progress", () => {
  const t = setup();
  t.api.playBGM("Normal");
  t.dispatch("click");
  const bgm = t.bgm();
  bgm.currentTime = 18;
  bgm.pause();
  const calls = bgm.playCalls;
  t.document.hidden = true;
  t.document.visibilityState = "hidden";
  t.dispatch("visibilitychange");
  assert.equal(bgm.playCalls, calls);
  t.document.hidden = false;
  t.document.visibilityState = "visible";
  t.dispatch("visibilitychange");
  assert.equal(bgm.paused, false);
  assert.equal(bgm.currentTime, 18);
  bgm.pause();
  t.window.dispatch("pageshow");
  assert.equal(bgm.paused, false);
  assert.equal(bgm.currentTime, 18);
});

test("mute preserves the selected one-shot track and prevents gesture or foreground recovery", () => {
  const t = setup();
  t.mute();
  t.api.playBGM("Exciting", false);
  t.dispatch("click");
  t.dispatch("touchend");
  t.dispatch("visibilitychange");
  t.window.dispatch("pageshow");
  assert.ok(t.audios.every((audio) => audio.paused && audio.playCalls === 0));
  t.unmute();
  assert.equal(t.bgm().paused, false);
  assert.equal(t.bgm().loop, false);
  t.bgm().finish();
  assert.equal(t.bgm().src, "/audios/Normal.mp3");
});

test("completed result music stays finished after gestures, foreground return and mute toggles", () => {
  for (const track of ["Win", "Lose"]) {
    const t = setup();
    t.api.playBGM("Normal");
    t.dispatch("click");
    t.api.playBGM(track, false);
    const bgm = t.bgm();
    bgm.finish();
    const calls = bgm.playCalls;
    t.dispatch("click");
    t.dispatch("touchend");
    t.dispatch("visibilitychange");
    t.window.dispatch("pageshow");
    t.mute(); t.unmute();
    assert.equal(bgm.playCalls, calls);
    assert.equal(bgm.paused, true);
    assert.equal(bgm.src, `/audios/${track}.mp3`);
  }
});

test("a gesture cannot replay result music while its native ended event is still queued", () => {
  const t = setup();
  t.api.playBGM("Win", false);
  const bgm = t.bgm();
  bgm.paused = true;
  bgm.ended = true;
  t.dispatch("touchend");
  assert.equal(bgm.paused, true);
  assert.equal(bgm.ended, true);
});

test("an obsolete play rejection does not report an error for the new result track", async () => {
  const t = setup();
  let rejectOldPlay;
  t.playback.set("/audios/Normal.mp3", () => new Promise((resolve, reject) => { rejectOldPlay = reject; }));
  t.api.playBGM("Normal");
  t.api.playBGM("Lose", false);
  rejectOldPlay(Object.assign(new Error("Replaced source"), { name: "AbortError" }));
  await settlePlayback();
  assert.equal(t.bgm().src, "/audios/Lose.mp3");
  assert.equal(t.bgm().paused, false);
  assert.equal(t.warnings.length, 0);
});

test("a gesture reloads an errored BGM and retains its track and loop mode", () => {
  const t = setup();
  t.api.playBGM("Exciting", false);
  t.dispatch("click");
  const bgm = t.bgm();
  bgm.pause();
  bgm.error = { code: 2, message: "Network failure" };
  bgm.onerror?.();
  t.dispatch("touchend");
  assert.equal(t.bgm(), bgm);
  assert.equal(bgm.paused, false);
  assert.equal(bgm.error, null);
  assert.equal(bgm.loop, false);
  assert.equal(bgm.src, "/audios/Exciting.mp3");
});

test("skill speech ducks music and restores its level when speech ends", () => {
  const t = setup();
  t.api.playBGM("Normal");
  const bgm = t.audios[0];
  assert.equal(bgm.volume, .3);
  t.api.playAudio("action_gushou");
  assert.equal(bgm.volume, .3 * .38);
  assert.equal(t.audios[1].volume, .9);
  t.audios[1].onended();
  assert.equal(bgm.volume, .3);
});

test("tutorial dialogue ducking survives speech completion and restores the user's music level", () => {
  const t = setup();
  t.api.playBGM("Normal");
  t.api.setMusicDucking("tutorial", true);
  assert.equal(t.audios[0].volume, .3 * .45);
  t.api.playAudio("single_3");
  assert.equal(t.audios[0].volume, .3 * .38);
  t.audios[1].onended();
  assert.equal(t.audios[0].volume, .3 * .45);
  t.api.setMusicDucking("tutorial", false);
  assert.equal(t.audios[0].volume, .3);
});

test("mute stops current speech, queued speech, effects and countdown immediately", () => {
  const t = setup();
  t.api.playAudio("action_gushou");
  t.api.playAudio("action_guixin");
  t.api.playAudio("skill_tieqi_horse");
  t.api.playAudio("countdown");
  const count = t.audios.length;
  t.mute();
  assert.ok(t.audios.every((audio) => audio.paused));
  t.audios[0].onended();
  assert.equal(t.audios.length, count);
});

test("speech is serialized and pending room audio is discarded on exit", () => {
  const t = setup();
  t.api.playAudio("action_luanjian");
  t.api.playAudio("skill_wjqf");
  assert.equal(t.audios.length, 1);
  t.audios[0].onended();
  assert.equal(t.audios[1].src, "/audios/skill_wjqf.mp3");
  t.api.playAudio("action_guanxing");
  t.api.stopGameAudio();
  t.audios[1].onended();
  assert.equal(t.audios.length, 2);
});

test("airplane with four-card groups uses the airplane voice rather than bomb voice", () => {
  const t = setup();
  t.api.playCardAudio(["3", "3", "3", "3", "4", "4", "4", "4"].map((rank) => ({ suit: "♠", rank })));
  assert.equal(t.audios[0].src, "/audios/combo_plane.mp3");
});

test("judgement starts with skill speech only after the played-card speech ends", () => {
  const t = setup();
  const stages = [];
  t.api.playCardAudio([{ suit: "♥", rank: "7" }]);
  t.api.playVoicePresentation("action_tieqi", () => stages.push("judge"));
  assert.deepEqual(stages, []);
  assert.equal(t.audios.length, 1);
  t.audios[0].onended();
  assert.deepEqual(stages, ["judge"]);
  assert.equal(t.audios[1].src, "/audios/action_tieqi.mp3");
});

test("room exit cancels pending judgement, whereas mute still shows it silently", () => {
  for (const leave of [true, false]) {
    const t = setup();
    const stages = [];
    t.api.playAudio("single_7");
    t.api.playVoicePresentation("action_tieqi", () => stages.push("judge"));
    if (leave) t.api.stopGameAudio(); else t.mute();
    t.audios[0].onended();
    assert.deepEqual(stages, leave ? [] : ["judge"]);
    assert.equal(t.audios.length, 1);
  }
});
