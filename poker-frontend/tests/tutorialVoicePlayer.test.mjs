import test from "node:test";
import assert from "node:assert/strict";
import { createTutorialVoicePlayer, getTutorialSubtitleLength } from "../src/tutorial/tutorialVoicePlayer.js";

function setup(frameOptions = {}) {
  const activity = [];
  const playback = [];
  const pending = [];
  const audio = {
    src: "", currentTime: 0, duration: NaN, paused: true, volume: 1, calls: 0,
    play() {
      this.calls++;
      this.paused = false;
      if (pending.length) return pending.shift();
      return Promise.resolve();
    },
    pause() { this.paused = true; },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    finish() { this.paused = true; this.onended?.(); },
  };
  const player = createTutorialVoicePlayer({ audio, onActiveChange: (active) => activity.push(active),
    onPlaybackChange: (state) => playback.push(state), ...frameOptions });
  return { audio, activity, playback, pending, player };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("changing dialogue replaces old speech and ignores its delayed completion", () => {
  const t = setup();
  t.player.play("/first.mp3");
  t.audio.currentTime = 4;
  const oldEnd = t.audio.onended;
  t.player.play("/second.mp3");
  assert.equal(t.audio.src, "/second.mp3");
  assert.equal(t.audio.currentTime, 0);
  assert.equal(t.audio.paused, false);
  oldEnd();
  assert.equal(t.activity.at(-1), true);
  t.audio.finish();
  assert.equal(t.activity.at(-1), false);
});

test("muting and pausing preserve progress and resume only unfinished dialogue", () => {
  const t = setup();
  t.player.play("/first.mp3");
  t.audio.currentTime = 6;
  t.player.setEnabled(false);
  assert.equal(t.audio.paused, true);
  t.player.setPaused(true);
  t.player.setEnabled(true);
  assert.equal(t.audio.paused, true);
  t.player.setPaused(false);
  assert.equal(t.audio.paused, false);
  assert.equal(t.audio.currentTime, 6);
  t.audio.finish();
  const calls = t.audio.calls;
  t.player.setEnabled(false);
  t.player.setEnabled(true);
  t.player.retry();
  assert.equal(t.audio.calls, calls);
});

test("a muted initial dialogue waits for sound to be enabled", () => {
  const t = setup();
  t.player.setEnabled(false);
  t.player.play("/first.mp3");
  assert.equal(t.audio.calls, 0);
  t.player.setEnabled(true);
  assert.equal(t.audio.calls, 1);
});

test("a user gesture recovers blocked autoplay without replaying active speech", async () => {
  const t = setup();
  t.pending.push(Promise.reject(Object.assign(new Error("Gesture required"), { name: "NotAllowedError" })));
  t.player.play("/first.mp3");
  await settle();
  assert.equal(t.activity.at(-1), false);
  t.player.retry();
  assert.equal(t.audio.calls, 2);
  assert.equal(t.audio.paused, false);
  t.player.retry();
  assert.equal(t.audio.calls, 2);
});

test("late playback rejection cannot stop a newer dialogue", async () => {
  const t = setup();
  let reject;
  t.pending.push(new Promise((_, fail) => { reject = fail; }));
  t.player.play("/first.mp3");
  t.player.play("/second.mp3");
  reject(new Error("Old playback interrupted"));
  await settle();
  assert.equal(t.audio.src, "/second.mp3");
  assert.equal(t.activity.at(-1), true);
  assert.equal(t.audio.paused, false);
});

test("stopping, missing text and disposal cannot resurrect old narration", () => {
  const t = setup();
  t.player.play("/first.mp3");
  t.player.stop();
  t.player.retry();
  assert.equal(t.audio.paused, true);
  assert.equal(t.audio.src, "");
  t.player.play("/second.mp3");
  t.player.play(undefined);
  assert.equal(t.audio.paused, true);
  t.player.play("/third.mp3");
  t.player.dispose();
  const calls = t.audio.calls;
  t.player.play("/fourth.mp3");
  t.player.setPaused(false);
  t.player.retry();
  assert.equal(t.audio.calls, calls);
  assert.equal(t.activity.at(-1), false);
});

test("changing volume or reusing the same text does not restart speech", () => {
  const t = setup();
  t.player.play("/first.mp3");
  t.audio.currentTime = 3;
  t.player.setVolume(0.4);
  t.player.play("/first.mp3");
  assert.equal(t.audio.volume, 0.4);
  assert.equal(t.audio.calls, 1);
  assert.equal(t.audio.currentTime, 3);
  t.player.setVolume(2);
  assert.equal(t.audio.volume, 1);
});

test("subtitle progress uses the media clock and waits for actual playback", () => {
  const t = setup();
  t.player.play("/first.mp3");
  assert.equal(t.playback.at(-1)?.status, "loading");
  t.audio.duration = 12;
  t.audio.onloadedmetadata();
  assert.equal(t.playback.at(-1).duration, 12);
  t.audio.onplaying();
  t.audio.currentTime = 3;
  t.audio.ontimeupdate();
  assert.equal(t.playback.at(-1).status, "playing");
  assert.equal(t.playback.at(-1).currentTime, 3);
  t.player.setPaused(true);
  assert.equal(t.playback.at(-1).status, "paused");
  assert.equal(t.playback.at(-1).currentTime, 3);
  t.audio.finish();
  assert.equal(t.playback.at(-1).status, "ended");
});

test("old media progress, buffering and errors cannot update a newer subtitle", () => {
  const t = setup();
  t.player.play("/first.mp3");
  const oldProgress = t.audio.ontimeupdate, oldMetadata = t.audio.onloadedmetadata, oldError = t.audio.onerror;
  t.audio.currentTime = 5;
  t.audio.duration = 12;
  t.player.play("/second.mp3");
  const events = t.playback.length;
  oldProgress(); oldMetadata(); oldError();
  assert.equal(t.playback.length, events);
  assert.equal(t.playback.at(-1).source, "/second.mp3");
  assert.equal(t.playback.at(-1).currentTime, 0);
  assert.equal(t.playback.at(-1).duration, 0);
  t.audio.onwaiting();
  assert.equal(t.playback.at(-1).status, "loading");
  t.audio.onerror();
  assert.equal(t.playback.at(-1).status, "error");
  t.player.dispose();
  assert.equal(t.audio.ontimeupdate, null);
  assert.equal(t.audio.onplaying, null);
});

test("subtitle characters follow word timestamps instead of a uniform typing timer", () => {
  const cues = [{ time: 0.3, end: 2 }, { time: 1.2, end: 5 }, { time: 3.4, end: 10 }];
  const at = (currentTime, status = "playing") => getTutorialSubtitleLength(10, cues, { currentTime, status });
  assert.equal(at(0, "loading"), 0);
  assert.equal(at(0.3), 2);
  assert.equal(at(1.1), 2, "A spoken pause must not type more characters");
  assert.equal(at(1.2), 5);
  assert.equal(at(1.2, "paused"), 5);
  assert.equal(at(3.4), 10);
  assert.equal(at(0, "ended"), 10);
  assert.equal(at(0, "error"), 10, "A failed recording must not hide the instructions");
  assert.equal(getTutorialSubtitleLength(10, cues, { currentTime: 0, status: "loading" }, true), 10);
  assert.equal(getTutorialSubtitleLength(10, [], { currentTime: 0, status: "idle" }), 10);
});

test("subtitle frames read actual media time and stop on pause, buffering and disposal", () => {
  const frames = new Map();
  let identity = 0;
  const t = setup({ requestFrame: (callback) => { frames.set(++identity, callback); return identity; },
    cancelFrame: (key) => frames.delete(key) });
  t.player.play("/first.mp3");
  assert.equal(frames.size, 0, "Loading must not start a separate subtitle timer");
  t.audio.onplaying();
  assert.equal(frames.size, 1);
  const [key, frame] = frames.entries().next().value;
  frames.delete(key);
  t.audio.currentTime = .73;
  frame();
  assert.equal(t.playback.at(-1).currentTime, .73);
  assert.equal(frames.size, 1);
  t.audio.onwaiting();
  assert.equal(frames.size, 0);
  t.audio.onplaying();
  assert.equal(frames.size, 1);
  t.player.setPaused(true);
  assert.equal(frames.size, 0);
  t.player.setPaused(false);
  t.audio.onplaying();
  assert.equal(frames.size, 1);
  t.player.dispose();
  assert.equal(frames.size, 0);
});
