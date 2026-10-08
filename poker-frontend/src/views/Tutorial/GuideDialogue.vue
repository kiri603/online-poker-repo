<template>
  <div class="guide-stage" :class="{ 'guide-stage--invitation': invitation }">
    <div class="guide-portrait" aria-hidden="true">
      <img src="/images/waiting-mascot.png" alt="" draggable="false" />
    </div>
    <section ref="windowRef" class="guide-window" role="dialog" aria-modal="true"
      aria-labelledby="guide-title" aria-describedby="guide-text" @keydown="trapFocus">
      <div class="guide-heading">
        <span class="guide-name">小桃</span>
        <span class="guide-caption">{{ caption }}</span>
        <button class="guide-sound" type="button" @click="toggleSound" :aria-label="soundStatus ? '关闭所有声音' : '开启所有声音'">
          {{ soundStatus ? '声音：开' : '声音：关' }}
        </button>
      </div>
      <div class="guide-body">
        <h2 id="guide-title">{{ title }}</h2>
        <p id="guide-text" @click="reveal">
          <span class="guide-sr-only">{{ text }}</span>
          <span aria-hidden="true">{{ typedText }}<span v-if="!fullyShown" class="guide-caret">▏</span></span>
        </p>
        <slot />
      </div>
      <div class="guide-footer">
        <span class="guide-page">{{ pageLabel || '点击文字可显示全文' }}</span>
        <div class="guide-buttons">
          <button type="button" class="guide-secondary" @click="$emit('secondary')">{{ secondaryLabel }}</button>
          <button ref="continueRef" type="button" class="guide-primary" @click="advance">
            {{ fullyShown ? continueLabel : '显示全文' }} <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { soundStatus, toggleSound } from "@/store/audioManager.js";
const props = defineProps({ text: { type: String, required: true }, title: String, caption: String,
  continueLabel: { type: String, default: "开始操作" }, secondaryLabel: { type: String, default: "退出教学" },
  pageLabel: String, paused: Boolean, invitation: Boolean });
const emit = defineEmits(["continue", "secondary"]);
const windowRef = ref(null), continueRef = ref(null), length = ref(0);
const characters = computed(() => Array.from(props.text));
const typedText = computed(() => characters.value.slice(0, length.value).join(""));
const fullyShown = computed(() => length.value >= characters.value.length);
let timer = null, previousFocus = null;
const reveal = () => { clearTimeout(timer); length.value = characters.value.length; };
const typeNext = () => {
  clearTimeout(timer);
  if (fullyShown.value) return;
  timer = setTimeout(() => {
    if (!props.paused && !document.hidden) length.value++;
    typeNext();
  }, props.paused || document.hidden ? 150 : 26);
};
watch(() => props.text, () => {
  clearTimeout(timer);
  length.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? characters.value.length : 0;
  typeNext();
  nextTick(() => continueRef.value?.focus({ preventScroll: true }));
}, { immediate: true });
const advance = () => { if (props.paused) return; if (!fullyShown.value) reveal(); else emit("continue"); };
function trapFocus(event) {
  if (event.key !== "Tab") return;
  const buttons = [...windowRef.value.querySelectorAll("button:not([disabled])")];
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => { previousFocus = document.activeElement; nextTick(() => continueRef.value?.focus({ preventScroll: true })); });
onUnmounted(() => { clearTimeout(timer); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<style scoped>
.guide-stage { position: absolute; inset: 0; color: #fbf3dd; font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
.guide-portrait { position: absolute; left: 3%; bottom: 205px; width: clamp(250px, 29vw, 430px); height: min(57vh, 510px); overflow: hidden; pointer-events: none; filter: drop-shadow(0 12px 24px #0008); }
.guide-portrait img { width: 100%; height: auto; display: block; }
.guide-window { position: absolute; left: 31%; right: 5%; bottom: 205px; padding: 20px 26px 18px; border: 1px solid #cba761; border-radius: 10px 10px 20px 10px; background: linear-gradient(145deg, #48181af5, #220e10f8); box-shadow: 0 18px 50px #0009, inset 0 0 0 5px #d6b5680b; text-align: left; display: flex; flex-direction: column; max-height: calc(100dvh - 235px); box-sizing: border-box; }
.guide-window::before { content: ""; position: absolute; left: -1px; top: 24px; width: 3px; height: 38px; background: #e9b949; }
.guide-heading { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.guide-name { font: 600 20px/1.4 "Noto Serif SC", "KaiTi", serif; letter-spacing: 3px; color: #ffde9a; }
.guide-caption { font-size: 11px; letter-spacing: 2px; color: #d5bd98; }
.guide-sound { margin-left: auto; color: #d5bd98; border: 0; background: none; padding: 8px 0 8px 8px; font-size: 11px; white-space: nowrap; }
.guide-body { min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.guide-body h2 { font: 600 clamp(19px, 2vw, 28px)/1.4 "Noto Serif SC", "KaiTi", serif; color: #fff0c8; margin: 12px 0 10px; letter-spacing: 2px; }
.guide-body p { font-size: clamp(15px, 1.35vw, 18px); line-height: 1.9; margin: 0; min-height: 3.8em; cursor: pointer; }
.guide-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid #d1a65830; flex-shrink: 0; }
.guide-page { color: #d5bd98; font-size: 11px; letter-spacing: 1px; }
.guide-buttons { display: flex; gap: 10px; }
button { cursor: pointer; font-family: inherit; }
.guide-primary, .guide-secondary { min-height: 42px; padding: 8px 18px; border-radius: 7px; font-size: 14px; }
.guide-primary { border: 1px solid #f2cc79; background: linear-gradient(180deg, #eed295, #c9a153); color: #38200e; font-weight: 700; display: flex; gap: 16px; align-items: center; }
.guide-secondary { border: 1px solid #c6a36b60; background: #ffffff05; color: #f1dfbd; }
button:focus-visible { outline: 2px solid #fff4c4; outline-offset: 4px; }
.guide-caret { color: #ffde9a; }
.guide-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.guide-stage--invitation .guide-window { bottom: 10%; }
.guide-stage--invitation .guide-portrait { bottom: 10%; }
@media (max-width: 600px) and (orientation: portrait) {
  .guide-window { left: 12px; right: 12px; bottom: 170px; padding: 14px 16px; max-height: calc(100dvh - 210px); }
  .guide-portrait { left: 6px; bottom: 360px; width: 170px; height: 230px; }
  .guide-heading { gap: 8px; }
  .guide-name { font-size: 17px; }
  .guide-caption { font-size: 10px; letter-spacing: 0; }
  .guide-body h2 { font-size: 21px; margin: 8px 0; }
  .guide-body p { font-size: 14px; line-height: 1.75; }
  .guide-footer { margin-top: 12px; padding-top: 10px; flex-wrap: wrap; }
  .guide-page { font-size: 10px; letter-spacing: 0; }
  .guide-primary, .guide-secondary { padding: 8px 12px; font-size: 13px; white-space: nowrap; }
  .guide-buttons { gap: 8px; margin-left: auto; flex-shrink: 0; }
  .guide-stage--invitation .guide-window { bottom: 28px; max-height: calc(100dvh - 80px); }
  .guide-stage--invitation .guide-portrait { bottom: 250px; }
}
@media (max-width: 600px) and (orientation: portrait) and (max-height: 650px) {
  .guide-portrait { width: 145px; height: 150px; bottom: min(360px, calc(100dvh - 170px)); }
  .guide-stage--invitation .guide-portrait { bottom: min(250px, calc(100dvh - 170px)); }
}
@media (max-height: 540px) and (orientation: landscape) {
  .guide-window { left: 56%; right: 3%; bottom: 128px; padding: 10px 14px; max-height: calc(100dvh - 160px); }
  .guide-portrait { left: 1%; bottom: 125px; width: 190px; height: min(63vh, 260px); }
  .guide-name { font-size: 16px; letter-spacing: 1px; }
  .guide-caption { font-size: 10px; letter-spacing: 0; }
  .guide-heading { flex-wrap: wrap; gap: 4px 8px; }
  .guide-body h2 { font-size: 18px; margin: 6px 0; letter-spacing: 0; }
  .guide-body p { font-size: 13px; line-height: 1.65; }
  .guide-footer { margin-top: 8px; padding-top: 8px; }
  .guide-page { display: none; }
  .guide-buttons { margin-left: auto; }
  .guide-primary, .guide-secondary { min-height: 36px; font-size: 12px; padding: 6px 10px; }
  .guide-stage--invitation .guide-window { left: 32%; bottom: 24px; max-height: calc(100dvh - 48px); }
  .guide-stage--invitation .guide-portrait { bottom: 24px; }
}
</style>
