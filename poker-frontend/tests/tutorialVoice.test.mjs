import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { computed, ref, reactive, watch, effectScope, nextTick } from "vue";
import { createTutorialVoicePlayer } from "../src/tutorial/tutorialVoicePlayer.js";

function setup({ enabled = true } = {}) {
  const mounted = [], unmounted = [], listeners = new Map(), ducking = [];
  const text = ref("first"), paused = ref(false), soundStatus = ref(enabled), voiceEnabled = ref(true);
  const audioLevels = reactive({ voice: 0.7 });
  const audio = { src: "", paused: true, currentTime: 0, calls: 0,
    play() { this.calls++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; }, removeAttribute() { this.src = ""; } };
  const document = { hidden: false,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatch(name) { for (const fn of listeners.get(name) || []) fn(); },
  };
  const scope = effectScope();
  const context = vm.createContext({ computed, ref, watch, createTutorialVoicePlayer, soundStatus, audioLevels, document, Symbol,
    TUTORIAL_VOICES: { first: "/first.mp3", second: "/second.mp3" },
    TUTORIAL_VOICE_TIMINGS: { first: [{ time: 0.2, end: 2 }], second: [{ time: 0.4, end: 3 }] },
    onMounted: (fn) => mounted.push(fn), onUnmounted: (fn) => unmounted.push(fn),
    setMusicDucking: (source, active) => ducking.push({ source, active }),
  });
  const source = readFileSync(new URL("../src/tutorial/useTutorialVoice.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  vm.runInContext(`${source}\nglobalThis.createVoice = useTutorialVoice;`, context);
  const voice = scope.run(() => context.createVoice(() => text.value, () => paused.value, () => voiceEnabled.value));
  voice.voiceRef.value = audio;
  mounted.forEach((fn) => fn());
  return { text, paused, soundStatus, voiceEnabled, audioLevels, audio, document, listeners, ducking, voice,
    close() { unmounted.forEach((fn) => fn()); scope.stop(); } };
}

test("dialogue narration follows text, the global sound switch and the voice volume", async () => {
  const t = setup({ enabled: false });
  try {
    assert.equal(t.audio.calls, 0);
    assert.equal(t.audio.src, "/first.mp3");
    t.text.value = "second";
    await nextTick();
    assert.equal(t.audio.src, "/second.mp3");
    assert.equal(t.audio.calls, 0);
    t.soundStatus.value = true;
    assert.equal(t.audio.paused, false);
    t.audioLevels.voice = 0.3;
    await nextTick();
    assert.equal(t.audio.volume, 0.3);
    t.soundStatus.value = false;
    assert.equal(t.audio.paused, true);
  } finally { t.close(); }
});

test("a tutorial overlay and a hidden tab pause narration without losing progress", () => {
  const t = setup();
  try {
    t.audio.currentTime = 5;
    t.paused.value = true;
    assert.equal(t.audio.paused, true);
    t.document.hidden = true;
    t.document.dispatch("visibilitychange");
    t.paused.value = false;
    assert.equal(t.audio.paused, true);
    assert.equal(t.voice.isPaused.value, true);
    t.document.hidden = false;
    t.document.dispatch("visibilitychange");
    assert.equal(t.audio.paused, false);
    assert.equal(t.voice.isPaused.value, false);
    assert.equal(t.audio.currentTime, 5);
  } finally { t.close(); }
});

test("leaving tutorial removes narration listeners and restores music ducking", () => {
  const t = setup();
  t.close();
  assert.equal(t.audio.paused, true);
  assert.equal(t.audio.src, "");
  assert.equal(t.ducking.at(-1).active, false);
  assert.ok([...t.listeners.values()].every((set) => set.size === 0));
  const calls = t.audio.calls;
  t.document.dispatch("click");
  assert.equal(t.audio.calls, calls);
});

test("changing dialogue resets both its recording and subtitle clock", async () => {
  const t = setup();
  try {
    t.audio.duration = 12;
    t.audio.onloadedmetadata();
    t.audio.onplaying();
    t.audio.currentTime = 4;
    t.audio.ontimeupdate();
    assert.equal(t.voice.playback.value.currentTime, 4);
    assert.equal(t.voice.subtitleCues.value[0].end, 2);
    const oldProgress = t.audio.ontimeupdate;
    t.text.value = "second";
    assert.equal(t.audio.paused, true, "Old speech stops before the new dialogue renders");
    assert.equal(t.voice.playback.value.currentTime, 0);
    await nextTick();
    oldProgress();
    assert.equal(t.voice.playback.value.source, "/second.mp3");
    assert.equal(t.voice.playback.value.currentTime, 0);
    assert.equal(t.voice.playback.value.duration, 0);
    assert.equal(t.voice.subtitleCues.value[0].end, 3);
  } finally { t.close(); }
});

test("the Xiaotao voice switch mutes only narration and is retained across dialogue", async () => {
  const t = setup();
  try {
    t.audio.currentTime = 3;
    t.voiceEnabled.value = false;
    assert.equal(t.audio.paused, true);
    assert.equal(t.soundStatus.value, true, "Music and game sound remain enabled");
    t.text.value = "second";
    await nextTick();
    assert.equal(t.audio.src, "/second.mp3");
    assert.equal(t.audio.paused, true);
    t.voiceEnabled.value = true;
    assert.equal(t.audio.paused, false);
    t.soundStatus.value = false;
    t.voiceEnabled.value = false;
    t.voiceEnabled.value = true;
    assert.equal(t.audio.paused, true, "The local switch cannot override global mute");
  } finally { t.close(); }
});
