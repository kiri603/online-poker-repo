<template>
  <section ref="host" class="tutorial-view" :data-kind="lesson.kind" :data-step="snapshot.stepIndex + 1" :data-phase="phase" :data-focus="step.focus">
    <GameBoard :session="session" :inert="modalActive || undefined" />
    <header class="tutorial-topbar" :inert="modalActive || undefined">
      <div class="tutorial-brand"><div>{{ lesson.title }}<small>{{ lesson.subtitle }}</small></div></div>
      <div class="tutorial-top-actions">
        <button v-if="phase === 'operation'" type="button" @click="controller.explain()">重新讲解</button>
        <button type="button" @click="session.bindings.exitGame()">退出教学</button>
      </div>
    </header>
    <TutorialSpotlight v-if="phase === 'operation'" :host="host" :targets="operationTargets" :dim="false" />
    <div v-if="phase === 'operation' || phase === 'demo'" class="tutorial-task" role="status">
      <span class="tutorial-task-number">{{ snapshot.stepIndex + 1 }}<small>/ {{ lesson.steps.length }}</small></span>
      <div><span class="tutorial-task-title">{{ step.title }}</span><p>{{ phase === 'demo' ? step.success : step.instruction }}</p></div>
      <span v-if="phase === 'operation' && step.cards.length" class="tutorial-selected">已选 {{ snapshot.selected.length }}/{{ step.cards.length }}</span>
      <div class="tutorial-progress" aria-hidden="true"><i v-for="n in lesson.steps.length" :key="n" :class="{ done: n <= snapshot.stepIndex + 1 }"></i></div>
    </div>

    <Transition name="tutorial-guide">
      <div v-if="phase === 'dialogue'" class="tutorial-modal" @keydown.esc="session.bindings.exitGame()">
        <TutorialSpotlight :host="host" :targets="spotlightTargets" />
        <GuideDialogue :text="step.dialogue[snapshot.dialoguePage]" :title="step.title" :caption="`${lesson.title} · ${snapshot.stepIndex + 1} / ${lesson.steps.length}`"
          :page-label="`${snapshot.dialoguePage + 1} / ${step.dialogue.length}`" :paused="snapshot.paused"
          :continue-label="snapshot.dialoguePage === step.dialogue.length - 1 ? '开始操作' : '下一句'"
          @continue="controller.continueDialogue()" @secondary="session.bindings.exitGame()">
          <div v-if="step.showRanks" class="tutorial-ranks" aria-label="点数从小到大">
            <span>小</span> 3 ‹ 4 ‹ 5 ‹ 6 ‹ 7 ‹ 8 ‹ 9 ‹ 10 ‹ J ‹ Q ‹ K ‹ A ‹ 2 ‹ 小王 ‹ 大王 <span>大</span>
          </div>
        </GuideDialogue>
      </div>
    </Transition>
    <div v-if="phase === 'complete' || phase === 'error'" class="tutorial-modal" :inert="showRuleDetail || undefined">
      <div class="tutorial-shade"></div>
      <GuideDialogue :title="phase === 'complete' ? lesson.completionTitle : '这局练习需要重新开始'"
        :caption="lesson.title" :text="phase === 'complete' ? lesson.completionText : '哎呀，练习好像出了点小问题……呜，重新开始一次吧！'"
        :paused="snapshot.paused" :continue-label="phase === 'error' ? '重新开始' : lesson.kind === 'basic' ? '进入锦囊牌进阶教程' : '再练一次'" secondary-label="返回大厅"
        @continue="phase === 'complete' && lesson.kind === 'basic' ? $emit('advanced') : restart()" @secondary="$emit('exit')">
        <div v-if="phase === 'complete'" class="tutorial-review">
          <span v-for="item in lesson.review" :key="item">{{ item }}</span>
        </div>
        <p v-if="phase === 'complete'" class="tutorial-more">
          <template v-if="lesson.kind === 'basic'">炸弹、王炸和更多组合，可以在详细规则里复习。<button type="button" @click="restart">重玩基础教程</button><br /></template>
          <template v-else>万箭、南蛮不弃牌时摸 2 张；每回合限用一张锦囊。</template>
          <button type="button" @click="showRuleDetail = true">查看详细规则 ›</button>
        </p>
        <p v-if="phase === 'error' && snapshot.error" class="tutorial-more tutorial-error-detail">错误详情：{{ snapshot.error }}</p>
      </GuideDialogue>
    </div>
    <div v-if="exitRequested" class="tutorial-confirm" role="dialog" aria-modal="true" aria-labelledby="tutorial-exit-title" @keydown="trapExitFocus" @keydown.esc="cancelExit">
      <div class="tutorial-confirm-card">
        <h2 id="tutorial-exit-title">先休息一下？</h2><p>欸？这就要走啦？好吧好吧～想继续练习的话，随时都能从大厅重新开始教学，小桃会等你的哦！</p>
        <div><button ref="cancelButton" type="button" @click="cancelExit">继续练习</button><button type="button" @click="$emit('exit')">返回大厅</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, nextTick } from "vue";
import GameBoard from "@/views/GameBoard/index.vue";
import GuideDialogue from "./GuideDialogue.vue";
import TutorialSpotlight from "./TutorialSpotlight.vue";
import { useTutorialSession } from "@/tutorial/useTutorialSession.js";
import { showRuleDetail } from "@/store/gameState.js";
const props = defineProps({ kind: { type: String, default: "basic" } });
defineEmits(["exit", "advanced"]);
const session = useTutorialSession(props.kind);
const { lesson } = session;
const { snapshot, phase, step, controller, restart, exitRequested, cancelExit } = session;
const host = ref(null), cancelButton = ref(null);
const modalActive = computed(() => ["dialogue", "complete", "error"].includes(phase.value) || exitRequested.value);
const cardTargets = computed(() => step.value.cards.map((id) => (step.value.focus === "pool" ? "wgfd-card:" : "card:") + id));
const spotlightTargets = computed(() => [
  ...cardTargets.value,
  ...(step.value.focus === "table" ? ["table"] : []),
  ...(step.value.action === "pass" ? ["count", "pass"] : []),
  ...(step.value.action === "respondAoe" ? ["count", "respondAoe", "phase"] : []),
  ...(step.value.action === "discardAoe" ? ["phase", "discardAoe"] : []),
]);
const operationTargets = computed(() => snapshot.value.selected.length === step.value.cards.length ? [] :
  cardTargets.value);
const focusAction = async () => {
  await nextTick();
  if (exitRequested.value || phase.value !== "operation") return;
  const target = host.value?.querySelector('[data-tutorial-target][tabindex="0"]') || host.value?.querySelector("[data-tutorial-highlight='true']:not([disabled])");
  target?.focus({ preventScroll: true });
};
watch(phase, focusAction);
watch(exitRequested, async (open) => {
  await nextTick();
  if (open) cancelButton.value?.focus();
  else if (phase.value === "dialogue") host.value?.querySelector(".guide-primary")?.focus();
  else focusAction();
});
watch(showRuleDetail, (visible) => controller.setPaused("rules", visible));
function trapExitFocus(event) {
  if (event.key !== "Tab") return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
}
</script>

<style src="./Tutorial.css"></style>
