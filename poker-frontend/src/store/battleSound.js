import { isSoundOn } from "./gameState.js";

const KINDS = ["cavalry", "invasion", "arrows", "stars", "shield", "blood", "awakening", "unity", "balance", "harvest", "sword", "airplane", "bomb", "rocket", "straight", "straight-pair", "card", "judgement"];
const data = new Map();
const buffers = new Map();
const loading = new Map();
const sources = new Set();
let context;
let master;
let soundVolume = 0.7;
let generation = 0;

export const setBattleSoundVolume = (volume) => {
  soundVolume = Math.max(0, Math.min(1, volume));
  if (master) master.gain.setTargetAtTime(soundVolume * .9, context.currentTime, .02);
};

async function load(kind) {
  if (buffers.has(kind)) return buffers.get(kind);
  if (loading.has(kind)) return loading.get(kind);
  const pending = (async () => {
    let bytes = data.get(kind);
    if (!bytes) {
      const response = await fetch(`/effects/audio/${kind}.mp3`);
      if (!response.ok) throw new Error(`Battle audio ${kind}: ${response.status}`);
      bytes = await response.arrayBuffer();
      data.set(kind, bytes);
    }
    if (!context) return null;
    const buffer = await context.decodeAudioData(bytes.slice(0));
    buffers.set(kind, buffer);
    data.delete(kind);
    return buffer;
  })().catch((error) => { console.warn("Battle sound unavailable:", error); return null; }).finally(() => loading.delete(kind));
  loading.set(kind, pending);
  return pending;
}

export const warmBattleSounds = () => Promise.all(KINDS.map(load));

const unlock = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!context) {
    context = new AudioContext();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 5;
    master = context.createGain();
    master.gain.value = soundVolume * .9;
    master.connect(limiter);
    limiter.connect(context.destination);
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  warmBattleSounds();
};
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

export const stopBattleSounds = () => {
  generation++;
  for (const source of sources) {
    try { source.stop(); } catch { /* Already ended. */ }
  }
  sources.clear();
};

export const playBattleSound = (kind) => {
  if (!KINDS.includes(kind) || !isSoundOn.value || !context || soundVolume === 0) return;
  const ticket = generation;
  const requested = Date.now();
  const play = (buffer) => {
    // Never replay a cast after leaving the room, muting, or a slow first download.
    if (!buffer || ticket !== generation || !isSoundOn.value || context.state !== "running" || Date.now() - requested > 350 || sources.size >= 8) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = kind === "card" ? .6 : .95;
    source.connect(gain);
    gain.connect(master);
    sources.add(source);
    source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  };
  if (buffers.has(kind)) play(buffers.get(kind));
  else load(kind).then(play);
};
