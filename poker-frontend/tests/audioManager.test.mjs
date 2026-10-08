import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getCardFeedback } from "../src/store/battleFeedback.js";

function setup() {
  const audios = [];
  const watchers = [];
  const sound = { value: true };
  const context = vm.createContext({
    isSoundOn: sound, getCardFeedback, console, Date,
    computed: (fn) => ({ get value() { return fn(); } }), reactive: (value) => value,
    watch: (source, cb) => watchers.push({ source, cb }),
    setBattleSoundVolume: () => {}, stopBattleSounds: () => {},
    document: { addEventListener: () => {}, removeEventListener: () => {} },
    window: { localStorage: { getItem: () => null, setItem: () => {} } },
    Audio: class {
      constructor(src) { this.src = src; this.paused = true; this.volume = 1; audios.push(this); }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    },
  });
  const source = readFileSync(new URL("../src/store/audioManager.js", import.meta.url), "utf8");
  const clean = source.replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/export const /g, "const ");
  vm.runInContext(`${clean}\nglobalThis.api = { playBGM, playAudio, playCardAudio, stopGameAudio, audioLevels };`, context);
  return { audios, api: context.api, mute: () => { sound.value = false; watchers.find((w) => w.source === sound).cb(false); } };
}

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
