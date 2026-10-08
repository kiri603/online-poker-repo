<template>
  <div class="battle-fx" aria-hidden="true" :data-fx-stage="stage" :data-fx-kind="judgements.at(-1)?.kind || caption?.kind || ''" :class="{ 'is-reduced': reducedMotion, 'is-fallback': failed, 'has-judgement': judgements.length > 0 }">
    <div ref="canvasHost" class="battle-fx-canvas"></div>
    <div v-for="judge in judgements" :key="judge.id" class="tieqi-draw" :class="{ 'has-result': progress(judge) >= .58, 'is-hit': progress(judge) >= .58 && judge.success }" :style="{ '--duration': `${judge.duration}ms` }" :data-judge-phase="progress(judge) < .32 ? 'draw' : progress(judge) < .58 ? 'flip' : 'result'">
      <div class="tieqi-draw-title">铁骑</div>
      <div class="tieqi-deck"><img src="/images/Background.png" alt="" /></div>
      <div class="tieqi-drawn-card">
        <div class="tieqi-flip">
          <div class="tieqi-face tieqi-front"><span>{{ judge.card?.suit }}{{ judge.card?.rank }}</span><img v-if="cardImage(judge.card)" :src="cardImage(judge.card)" alt="" @error="hideImage" /></div>
          <div class="tieqi-face tieqi-back"><img src="/images/Background.png" alt="" /></div>
        </div>
      </div>
      <div v-if="progress(judge) >= .58" class="tieqi-result">{{ judge.success ? '判定成功' : '判定未命中' }}</div>
    </div>
    <Transition name="battle-caption" mode="out-in">
      <div v-if="caption" :key="caption.id" class="battle-caption" :class="[`tone-${caption.tone}`, `kind-${caption.kind}`]">
        <div class="battle-caption-owner">{{ caption.userId }}</div>
        <div class="battle-caption-title"><span></span>{{ caption.title }}<span></span></div>
      </div>
    </Transition>
    <div v-if="failed && caption && !reducedMotion" :key="caption.id" class="battle-fallback-wave" :class="`tone-${caption.tone}`"></div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { battleEffects, effectsQuality, expireBattleEffects } from "@/store/battleEffects.js";
import { warmBattleSounds } from "@/store/battleSound.js";

const canvasHost = ref(null);
const failed = ref(false);
const stage = ref("idle");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = ref(motionQuery.matches);
const clock = ref(Date.now());
const judgements = computed(() => battleEffects.value.filter((effect) => effect.kind === "judgement"));
const caption = computed(() => [...battleEffects.value].reverse().find((effect) => effect.title && effect.kind !== "judgement"));
const progress = (effect) => Math.max(0, Math.min(1, (clock.value - effect.startedAt) / effect.duration));
const cardImage = (card) => {
  const suits = { "♠": "Spade", "♥": "Heart", "♣": "Club", "♦": "Diamond" };
  return card && suits[card.suit] ? `/images/${suits[card.suit]}${card.rank}.png` : null;
};
const hideImage = (event) => { event.target.style.display = "none"; };
let renderer;
let frame;
let disposed = false;
const updateMotion = () => { reducedMotion.value = motionQuery.matches; };

const getScene = () => {
  const board = canvasHost.value.parentElement.parentElement;
  const bounds = board.getBoundingClientRect();
  const table = board.querySelector(".gb-table")?.getBoundingClientRect() || bounds;
  return { x: table.left - bounds.left, y: table.top - bounds.top, width: table.width, height: table.height };
};
const getOrigin = (userId) => {
  const board = canvasHost.value.parentElement.parentElement;
  const origin = [...board.querySelectorAll("[data-seat-user]")].find((seat) => seat.dataset.seatUser === userId);
  if (!origin) return null;
  const bounds = board.getBoundingClientRect();
  const seat = origin.getBoundingClientRect();
  return { x: seat.left + seat.width / 2 - bounds.left, y: seat.top + seat.height / 2 - bounds.top };
};
const tick = () => {
  frame = null;
  if (disposed) return;
  clock.value = Date.now();
  expireBattleEffects();
  const impact = { cavalry: .53, invasion: .53, bomb: .35, rocket: .56, airplane: .48, stars: .32 };
  stage.value = caption.value ? Date.now() - caption.value.startedAt >= caption.value.duration * (impact[caption.value.kind] || .27) ? "impact" : "entry" : "idle";
  if (judgements.value.length) {
    const p = progress(judgements.value.at(-1));
    stage.value = p < .32 ? "draw" : p < .58 ? "flip" : "result";
  }
  if (document.hidden || reducedMotion.value) renderer?.clear();
  else renderer?.render(battleEffects.value);
  if (battleEffects.value.length && !document.hidden) frame = requestAnimationFrame(tick);
};
const start = () => {
  if (!frame && !document.hidden && !disposed) frame = requestAnimationFrame(tick);
};
const visibility = () => {
  if (document.hidden) { cancelAnimationFrame(frame); frame = null; renderer?.clear(); }
  else { expireBattleEffects(); start(); }
};
watch(battleEffects, start);
watch(caption, (next) => { stage.value = next ? "entry" : "idle"; });
watch(reducedMotion, start);
watch(effectsQuality, start);
onMounted(async () => {
  warmBattleSounds();
  motionQuery.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", visibility);
  try {
    const { createBattleRenderer } = await import("./battleRenderer.js");
    if (disposed) return;
    const nextRenderer = await createBattleRenderer(canvasHost.value, getScene, () => effectsQuality.value, getOrigin);
    if (disposed) nextRenderer.destroy();
    else { renderer = nextRenderer; start(); }
  } catch (error) {
    failed.value = true;
    console.warn("Battle effects use the lightweight fallback:", error);
    start();
  }
});
onUnmounted(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  renderer?.destroy();
  motionQuery.removeEventListener("change", updateMotion);
  document.removeEventListener("visibilitychange", visibility);
});
</script>

<style scoped>
.battle-fx { position: absolute; inset: 0; z-index: 24; pointer-events: none; overflow: hidden; }
.battle-fx.has-judgement { z-index: 36; }
.battle-fx-canvas { position: absolute; inset: 0; }
.battle-fx-canvas :deep(canvas) { display: block; width: 100%; height: 100%; }
.tieqi-draw { --deck-offset: -142px; position: absolute; left: 50%; top: 43%; width: 96px; height: 134px; transform: translate(-50%, -50%); perspective: 800px; color: #efd7ac; }
.tieqi-draw-title { position: absolute; left: -30px; right: -30px; top: -42px; text-align: center; font: 700 26px/1.3 "STKaiti", "KaiTi", serif; letter-spacing: 6px; text-shadow: 0 2px 6px #100b05; }
.tieqi-deck { position: absolute; inset: 0; transform: translateX(var(--deck-offset)) rotate(-9deg) scale(.86); opacity: .75; border-radius: 7px; box-shadow: -3px 3px 0 #483425, -6px 6px 0 #b09066, -9px 9px 0 #483425; }
.tieqi-deck img, .tieqi-face img { width: 100%; height: 100%; object-fit: fill; border-radius: inherit; }
.tieqi-drawn-card { position: absolute; inset: 0; animation: tieqi-draw var(--duration) cubic-bezier(.22,.8,.2,1) both; }
.tieqi-flip { position: absolute; inset: 0; transform-style: preserve-3d; animation: tieqi-flip var(--duration) ease-in-out both; }
.tieqi-face { position: absolute; inset: 0; backface-visibility: hidden; border-radius: 7px; box-shadow: 0 9px 20px #0008; overflow: hidden; }
.tieqi-back { transform: rotateY(180deg); }
.tieqi-front { background: #f5ecda; color: #38291f; border: 1px solid #dbcaa8; }
.tieqi-front span { position: absolute; inset: 0; display: grid; place-items: center; font-size: 26px; }
.tieqi-front img { position: relative; }
.has-result.is-hit .tieqi-front { box-shadow: 0 0 0 2px #d1a958, 0 9px 28px #c4974d55; }
.tieqi-result { position: absolute; top: calc(100% + 13px); left: -60px; right: -60px; width: max-content; margin-inline: auto; padding: 4px 10px; background: #21180eea; border-bottom: 1px solid #ad8e5d; text-align: center; font: 600 16px/1.4 "STKaiti", "KaiTi", serif; letter-spacing: 3px; text-shadow: 0 2px 5px #000; }
@keyframes tieqi-draw { 0% { transform: translate(var(--deck-offset), 0) rotate(-9deg) scale(.86); opacity: 0; } 7% { opacity: 1; } 32%, 90% { transform: translate(0, 0) rotate(0) scale(1); opacity: 1; } 100% { transform: translateY(-14px) scale(.96); opacity: 0; } }
@keyframes tieqi-flip { 0%, 32% { transform: rotateY(180deg); } 58%, 100% { transform: rotateY(0); } }
@media (max-width: 600px) { .tieqi-draw { --deck-offset: -100px; width: 78px; height: 109px; top: 43%; } }
@media (max-height: 500px) and (orientation: landscape) { .tieqi-draw { width: 65px; height: 91px; top: 40%; } .tieqi-draw-title { top: -30px; font-size: 20px; } .tieqi-result { top: calc(100% + 7px); font-size: 13px; } }
.is-reduced .tieqi-drawn-card, .is-reduced .tieqi-flip { animation: none; }
.is-reduced .tieqi-flip { transform: rotateY(180deg); }
.is-reduced .has-result .tieqi-flip { transform: none; }
.battle-caption { position: absolute; top: 29%; left: 50%; transform: translateX(-50%); text-align: center; color: #ffe2a5; min-width: 180px; filter: drop-shadow(0 4px 12px #160903); }
.battle-caption-owner { font-size: 11px; letter-spacing: 3px; color: #e8dac0; margin-bottom: 5px; max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.battle-caption-title { display: flex; align-items: center; justify-content: center; gap: 15px; font-family: "Noto Serif SC", "STKaiti", "KaiTi", serif; font-size: clamp(28px, 3.2vw, 48px); font-weight: 800; letter-spacing: 7px; line-height: 1.25; white-space: nowrap; text-shadow: 0 2px 0 #714120, 0 0 25px #a2753c80; }
.battle-caption-title span { width: 38px; height: 1px; background: linear-gradient(90deg, transparent, currentColor); }
.battle-caption-title span:last-child { transform: rotate(180deg); }
.tone-jade { color: #baf4db; }
.tone-crimson { color: #ffc29b; }
.tone-muted { color: #ddcfb5; }
.battle-caption-enter-active { transition: opacity .18s ease-out, transform .3s cubic-bezier(.16,1,.3,1); }
.battle-caption-leave-active { transition: opacity .25s ease-in; }
.battle-caption-enter-from { opacity: 0; transform: translate(-50%, 9px) scale(1.12); }
.battle-caption-leave-to { opacity: 0; }
.battle-fallback-wave { position: absolute; inset: 26% 12% 27%; border: 1px solid #e7c07680; border-radius: 50%; background: radial-gradient(ellipse, transparent 30%, #d7a55325 70%, transparent 72%); animation: fallback-wave 1.6s ease-out both; }
@keyframes fallback-wave { from { transform: scale(.3); opacity: .8; } to { transform: scale(1.2); opacity: 0; } }
@media (max-width: 600px) { .battle-caption { top: 35%; } .battle-caption-title { gap: 9px; letter-spacing: 4px; font-size: 29px; } .battle-caption-title span { width: 22px; } }
@media (max-height: 500px) and (orientation: landscape) { .battle-caption { top: 31%; } .battle-caption-title { font-size: 28px; } .battle-caption-owner { display: none; } }
@media (max-height: 500px) and (orientation: landscape) { .battle-caption.kind-invasion { top: 55px; } .kind-invasion .battle-caption-title { font-size: 22px; } }
.is-reduced .battle-caption-enter-active, .is-reduced .battle-caption-leave-active { transition: opacity .15s; }
.is-reduced .battle-caption-enter-from { transform: translateX(-50%); }
</style>
