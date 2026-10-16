<template>
  <div ref="layer" class="table-play" aria-hidden="true"></div>
  <button type="button" class="table-play-trigger" aria-label="让一位玩家向桌面出牌" @click="play?.once()"></button>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createGardenCardPlay } from './gardenCardPlay.js';

const props = defineProps({
  seats: { type: Array, required: true },
  paused: { type: Boolean, default: false },
});
const layer = ref(null);
let play;
function restart() {
  play?.destroy();
  if (layer.value) play = createGardenCardPlay(layer.value.parentElement, layer.value, { paused: props.paused });
}
watch(() => JSON.stringify(props.seats.map(slot => slot.player?.userId ?? null)), restart, { flush: 'post' });
watch(() => props.paused, value => play?.setPaused(value));
onMounted(restart);
onBeforeUnmount(() => play?.destroy());
</script>

<style scoped>
.table-play { position: absolute; inset: 0; overflow: clip; pointer-events: none; z-index: 1; }
.table-play-trigger { position: absolute; left: 34%; top: 39%; width: 32%; height: 28%; padding: 0; border: 0; border-radius: 50%; background: none; z-index: 1; cursor: pointer; touch-action: manipulation; }
.table-play-trigger:focus-visible { outline: 2px dashed var(--rose); outline-offset: 6px; }
.table-play :deep(.play-hand) { position: absolute; inset: 0; pointer-events: none; }
.table-play :deep(.play-card) { --card-w: 54px; position: absolute; left: 0; top: 0; width: var(--card-w); height: calc(var(--card-w)*1.42); transform-origin: center; will-change: transform; }
.table-play :deep(.card-face) { position: absolute; inset: 0; display: grid; place-items: center; border: 2px solid var(--ink); border-radius: 1px 6px 1px 1px; background: #fff7e5; color: var(--ink); box-shadow: 3px 4px 0 #2526229f; overflow: hidden; }
.table-play :deep(.card-face.is-red) { color: var(--rose); background: var(--peach); }
.table-play :deep(.card-corner) { position: absolute; left: 5px; top: 5px; font: 700 13px/1 Georgia, serif; text-align: center; }
.table-play :deep(.card-corner small) { display: block; font-size: 10px; margin-top: 2px; }
.table-play :deep(.card-corner:last-child) { inset: auto 5px 5px auto; rotate: 180deg; }
.table-play :deep(.card-pip) { font: 32px/1 Georgia, serif; }
.table-play :deep(.play-card.is-settled) { will-change: auto; }
@media (min-width: 1650px) {
  .table-play :deep(.play-card) { --card-w: 62px; }
}
@media (max-width: 900px) and (min-width: 701px) {
  .table-play :deep(.play-card) { --card-w: 46px; }
}
@media (max-width: 700px) {
  .table-play-trigger { left: 27%; top: 46%; width: 46%; height: 26%; }
  .table-play :deep(.play-card) { --card-w: 36px; }
  .table-play :deep(.card-corner) { font-size: 10px; top: 3px; left: 3px; }
  .table-play :deep(.card-corner small) { font-size: 7px; margin-top: 1px; }
  .table-play :deep(.card-corner:last-child) { inset: auto 3px 3px auto; }
  .table-play :deep(.card-pip) { font-size: 24px; }
}
</style>
