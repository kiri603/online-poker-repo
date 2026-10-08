<template>
  <svg class="tutorial-spotlight" :class="{ 'is-operation': !dim }" :viewBox="`0 0 ${size.width} ${size.height}`" preserveAspectRatio="none" aria-hidden="true">
    <defs v-if="dim"><mask :id="maskId"><rect width="100%" height="100%" fill="white" />
      <rect v-for="(rect, i) in rectangles" :key="i" v-bind="rect" rx="4" fill="black" />
    </mask></defs>
    <rect v-if="dim" width="100%" height="100%" fill="#130909" fill-opacity=".64" :mask="`url(#${maskId})`" />
    <rect v-for="(rect, i) in rectangles" :key="i" :x="rect.x + 1" :y="rect.y + 1" :width="Math.max(0, rect.width - 2)" :height="Math.max(0, rect.height - 2)" rx="4" fill="none" stroke="#e9b949" stroke-width="2" />
  </svg>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, useId } from "vue";
import { visibleCardRects } from "@/tutorial/tutorialHighlight.js";
const props = defineProps({ host: Object, targets: { type: Array, default: () => [] }, dim: { type: Boolean, default: true } });
const rectangles = ref([]), size = ref({ width: 1, height: 1 });
const maskId = `tutorial-mask-${useId()}`;
let observer = null, disposed = false, generation = 0, frame = null, transitionUntil = 0;
const measure = () => {
  if (!props.host || disposed) return;
  const bounds = props.host.getBoundingClientRect();
  size.value = { width: bounds.width, height: bounds.height };
  const targets = [...props.host.querySelectorAll("[data-tutorial-target]")]
    .filter((element) => props.targets.includes(element.dataset.tutorialTarget));
  const localRect = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
  };
  const cards = [...props.host.querySelectorAll(".gb-hand > .card")];
  rectangles.value = targets.flatMap((element) => {
    const rect = localRect(element);
    if (!cards.includes(element)) return [{ x: rect.x - 5, y: rect.y - 5, width: rect.width + 10, height: rect.height + 10 }];
    const z = Number(getComputedStyle(element).zIndex);
    const covering = cards.filter((other) => Number(getComputedStyle(other).zIndex) > z).map(localRect);
    return visibleCardRects(rect, covering);
  });
};
const observeTargets = () => {
  observer?.disconnect();
  if (props.host) observer?.observe(props.host);
  for (const element of props.host?.querySelectorAll("[data-tutorial-target]") || []) observer?.observe(element);
};
const trackTransition = (event) => {
  if (!event.target.matches?.(".gb-hand > .card")) return;
  transitionUntil = performance.now() + 250;
  const tick = () => {
    frame = null;
    if (disposed) return;
    measure();
    if (performance.now() < transitionUntil) frame = requestAnimationFrame(tick);
  };
  if (frame === null) frame = requestAnimationFrame(tick);
};
watch(() => [props.host, props.targets], async () => {
  const current = ++generation;
  await nextTick();
  if (disposed || current !== generation) return;
  observeTargets();
  measure();
}, { immediate: true });
onMounted(() => {
  observer = new ResizeObserver(measure); observeTargets(); measure();
  window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
  props.host?.addEventListener("transitionrun", trackTransition);
});
onUnmounted(() => {
  disposed = true; generation++; observer?.disconnect(); cancelAnimationFrame(frame);
  window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true);
  props.host?.removeEventListener("transitionrun", trackTransition);
});
</script>

<style scoped>
.tutorial-spotlight { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.is-operation { z-index: 65; animation: tutorial-card-glow 1.6s ease-in-out infinite; }
@keyframes tutorial-card-glow { 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .is-operation { animation: none; } }
</style>
