<template>
  <div class="tutorial-selector" @click.self="closeTutorialSelection" @keydown.esc="closeTutorialSelection">
    <section ref="panel" class="tutorial-selector-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-selector-title" @keydown="trapFocus">
      <div class="tutorial-selector-heading"><span>小桃的练习牌桌</span><button type="button" aria-label="关闭教程选择" @click="closeTutorialSelection">关闭</button></div>
      <h2 id="tutorial-selector-title">想从哪里开始？</h2>
      <p>第一次打牌，或想试试锦囊？选一局，小桃陪你慢慢练。</p>
      <div class="tutorial-selector-options">
        <button v-for="lesson in lessons" :key="lesson.kind" type="button" @click="openTutorial(lesson.kind)">
          <span class="tutorial-selector-title">{{ lesson.title }}</span>
          <span class="tutorial-selector-description">{{ lesson.subtitle }}</span>
          <span class="tutorial-selector-duration">{{ lesson.duration }} · 不限时</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { openTutorial, closeTutorialSelection } from "@/store/tutorialState.js";
import { getTutorialLesson } from "@/tutorial/tutorialLessons.js";
const lessons = [getTutorialLesson("basic"), getTutorialLesson("advanced")];
const panel = ref(null);
let previousFocus = null;
function trapFocus(event) {
  if (event.key !== "Tab") return;
  const buttons = [...panel.value.querySelectorAll("button")];
  if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
}
onMounted(() => { previousFocus = document.activeElement; nextTick(() => panel.value?.querySelector(".tutorial-selector-options button")?.focus()); });
onUnmounted(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<style scoped>
.tutorial-selector { position: fixed; inset: 0; z-index: 1400; display: grid; place-items: center; padding: 20px; background: #130909b8; color: #fbf3dd; font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
.tutorial-selector-panel { width: min(560px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; box-sizing: border-box; padding: 28px; background: linear-gradient(145deg, #48181a, #220e10); border: 1px solid #cba761; border-radius: 10px 10px 20px 10px; text-align: left; }
.tutorial-selector-heading { display: flex; justify-content: space-between; align-items: center; color: #d5bd98; font-size: 12px; }
.tutorial-selector-heading button { border: 0; padding: 8px; background: transparent; color: #d5bd98; }
h2 { margin: 14px 0 10px; color: #fff0c8; font: 600 26px/1.4 "Noto Serif SC", "KaiTi", serif; }
p { margin: 0 0 24px; color: #e0c99f; font-size: 14px; line-height: 1.8; }
.tutorial-selector-options { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tutorial-selector-options button { min-height: 140px; padding: 20px 16px; border: 1px solid #cba76170; border-left: 3px solid #e9b949; border-radius: 6px; background: #fbf3dd08; color: #fbf3dd; text-align: left; }
.tutorial-selector-options button:hover { background: #fbf3dd12; }
.tutorial-selector-title { display: block; font-size: 18px; line-height: 1.5; color: #ffde9a; }
.tutorial-selector-description, .tutorial-selector-duration { display: block; margin-top: 12px; font-size: 12px; color: #e0c99f; line-height: 1.5; }
.tutorial-selector-duration { color: #bcaa89; }
button { cursor: pointer; font-family: inherit; }
button:focus-visible { outline: 2px solid #fff4c4; outline-offset: 4px; }
@media (max-width: 480px) { .tutorial-selector-panel { padding: 20px; } .tutorial-selector-options { grid-template-columns: 1fr; } .tutorial-selector-options button { min-height: 112px; padding: 16px; } }
@media (max-height: 450px) and (orientation: landscape) { .tutorial-selector-panel { padding: 16px 24px; } p { margin-bottom: 12px; } .tutorial-selector-options button { min-height: 110px; padding: 12px; } }
</style>
