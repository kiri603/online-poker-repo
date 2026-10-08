import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

function setup({ delayed = false } = {}) {
  const events = {};
  const played = [];
  const decodes = [];
  const files = [];
  const sound = { value: true };
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1, setTargetAtTime() {} } });
  const context = vm.createContext({
    isSoundOn: sound, console, Date, Map, Set,
    fetch: async (url) => { files.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; },
    document: { addEventListener: (event, fn) => { events[event] = fn; } },
    window: { AudioContext: class {
      state = "running"; currentTime = 0; destination = {};
      createGain = node;
      createDynamicsCompressor = () => ({ ...node(), threshold: {}, knee: {}, ratio: {} });
      decodeAudioData() { return delayed ? new Promise((resolve) => decodes.push(resolve)) : Promise.resolve({ duration: 3 }); }
      createBufferSource() {
        const source = { ...node(), stopped: false, start() { played.push(this); }, stop() { this.stopped = true; this.onended?.(); } };
        return source;
      }
    } },
  });
  const source = readFileSync(new URL("../src/store/battleSound.js", import.meta.url), "utf8").replace(/^import.*\r?\n/gm, "").replace(/export const /g, "const ");
  vm.runInContext(`${source}\nglobalThis.api = { playBattleSound, stopBattleSounds, warmBattleSounds, setBattleSoundVolume };`, context);
  return { api: context.api, played, files, sound, unlock: () => events.pointerdown(), resolve: () => decodes.splice(0).forEach((fn) => fn({ duration: 3 })) };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("battle effects use packaged recordings after an interaction unlock", async () => {
  const t = setup();
  t.api.playBattleSound("invasion");
  assert.equal(t.played.length, 0);
  t.unlock();
  await settle();
  t.api.playBattleSound("invasion");
  assert.equal(t.played.length, 1);
  assert.ok(t.files.every((url) => existsSync(new URL(`../public${url}`, import.meta.url))));
});

test("leaving the room cancels a recording still being decoded", async () => {
  const t = setup({ delayed: true });
  t.unlock();
  await settle();
  t.api.playBattleSound("rocket");
  t.api.stopBattleSounds();
  t.resolve();
  await settle();
  assert.equal(t.played.length, 0);
});

test("mute discards pending recordings and stops active sources", async () => {
  const t = setup();
  t.unlock();
  await settle();
  t.api.playBattleSound("cavalry");
  t.api.stopBattleSounds();
  t.sound.value = false;
  t.api.playBattleSound("bomb");
  assert.equal(t.played.length, 1);
  assert.ok(t.played[0].stopped);
});

test("rapid casts are bounded and ended recordings release their slots", async () => {
  const t = setup();
  t.unlock();
  await settle();
  for (let i = 0; i < 20; i++) t.api.playBattleSound("arrows");
  assert.equal(t.played.length, 8);
  t.played.forEach((source) => source.onended());
  t.api.playBattleSound("shield");
  assert.equal(t.played.length, 9);
});
