<template>
  <div v-if="visible && !blocked" class="tutorial-invitation">
    <GuideDialogue invitation title="第一局让小桃陪你" caption="新手教学 · 约 3–5 分钟"
      text="呀，你来啦！嘿嘿～第一次玩也不用紧张，有小桃陪着你呢！要不要先一起练习一局？别紧张，我会慢慢教你的！要是现在不想玩，之后也可以从大厅找到我哦～"
      continue-label="开始教学" secondary-label="稍后" @continue="start" @secondary="visible = false" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import GuideDialogue from "./GuideDialogue.vue";
import { authUser, dailySignInVisible, showRules, showUpdates, showCreateModal, showRuleDetail, isConnected, isReconnecting } from "@/store/gameState.js";
import { socialDrawerOpen, socialProfileVisible, socialInvitePrompt } from "@/store/socialStore.js";
import { openTutorial, tutorialInvitations } from "@/store/tutorialState.js";
const visible = ref(false);
let offeredTo = null;
const blocked = computed(() => dailySignInVisible.value || showRules.value || showUpdates.value ||
  showCreateModal.value || showRuleDetail.value || isConnected.value || isReconnecting.value ||
  socialDrawerOpen.value || socialProfileVisible.value || !!socialInvitePrompt.value);
watch([authUser, blocked], ([user, waiting]) => {
  if (!user || user.guest || user.id !== offeredTo) visible.value = false;
  if (waiting || !tutorialInvitations.shouldOffer(user)) return;
  tutorialInvitations.markShown(user);
  offeredTo = user.id; visible.value = true;
}, { immediate: true });
const start = () => { visible.value = false; openTutorial(); };
</script>

<style scoped>
.tutorial-invitation { position: fixed; inset: 0; z-index: 1100; background: #130909a3; animation: invitation-appear .22s ease-out; }
@keyframes invitation-appear { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .tutorial-invitation { animation: none; } }
</style>
