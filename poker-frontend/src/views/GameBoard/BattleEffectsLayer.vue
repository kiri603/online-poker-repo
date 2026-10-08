<template>
  <div class="battle-fx" aria-hidden="true" :data-fx-stage="stage" :data-fx-kind="caption?.kind || ''" :class="{ 'is-reduced': reducedMotion, 'is-fallback': failed }">
    <div ref="canvasHost" class="battle-fx-canvas"></div>
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
const caption = computed(() => [...battleEffects.value].reverse().find((effect) => effect.title));
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
  expireBattleEffects();
  const impact = { cavalry: .53, invasion: .53, bomb: .35, rocket: .56, airplane: .48, stars: .32 };
  stage.value = caption.value ? Date.now() - caption.value.startedAt >= caption.value.duration * (impact[caption.value.kind] || .27) ? "impact" : "entry" : "idle";
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
.battle-fx-canvas { position: absolute; inset: 0; }
.battle-fx-canvas :deep(canvas) { display: block; width: 100%; height: 100%; }
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
