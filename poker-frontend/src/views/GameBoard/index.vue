<template src="./GameBoard.html"></template>

<script setup>
import BattleEffectsLayer from "./BattleEffectsLayer.vue";
import BattlePhaseNotice from "./BattlePhaseNotice.vue";
// 【核心修复 1】：移除了 onMounted 中的 playBGM("Normal")。
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import * as liveBindings from "./GameBoard.js";
import { cardLabel as boardCardLabel } from "@/tutorial/tutorialMatch.js";
const props = defineProps({ session: { type: Object, default: null } });
const tutorialMode = !!props.session;
const battleSession = props.session?.battleSession || null;
const tutorialPhase = computed(() => props.session?.phase.value || "");
const canBoardAction = (action) => props.session?.policy.canAction(action) ?? true;
const cardIsSelectable = (card) => props.session?.policy.canSelect(card) ?? true;
const cardIsTarget = (card) => props.session?.policy.isTarget(card) ?? false;
const actionIsTarget = (action) => props.session?.policy.isActionTarget(action) ?? false;
const boardCardId = (card) => card.suit === "JOKER" ? card.rank : card.suit + card.rank;
const {
  phaseNotice,
  effectsSettingsOpen,
  effectsQuality,
  audioLevels,
  userId,
  otherPlayers,
  currentTurn,
  countdown,
  activeActionTexts,
  activeEmojis,
  currentAoeType,
  pendingAoePlayers,
  aoeInitiator,
  tableCards,
  lastPlayPlayer,
  sortedTableCards,
  isSpectator,
  myStatus,
  handCards,
  amIPendingAoe,
  selectedCards,
  aoeAnimCards,
  sortedHandCards,
  showEmojiPanel,
  emojiList,
  winner,
  winningCards,
  killText,
  sortedWinningCards,
  getCardImageUrl,
  handleImageError,
  toggleSelect,
  respondAoe,
  discardAoe,
  playCards,
  replaceCard,
  passTurn,
  toggleEmojiPanel,
  sendEmoji,
  exitGame,
  returnToRoom,
  onlyHasScrolls,
  soundStatus,
  toggleSound,
  isShuffling,
  warningUserId,
  mySkill,
  showSkillSelection,
  showGuanxingModal,
  guanxingCards,
  selectedGuanxingCards,
  selectSkill,
  toggleGuanxingSelect,
  confirmGuanxing,
  playBGM,
  skillCountdown,
  showWgfdModal,
  wgfdCards,
  selectedWgfdCard,
  toggleWgfdSelect,
  confirmWgfd,
  confirmGushouDiscard,
  jdsrTarget,
  jdsrInitiator,
  luanjianInitiator, // <--- 干净的唯一引入
  kurouUseCount,
  kurouUsesThisTurn,
  kurouAwakened,
  guixinDisabled,
  guixinPendingPasser,
  showGuixinModal,
  confirmGuixinDecision,
  confirmKurouAwakenDiscard,
  skipKurouAwakenDiscard,
  tieqiJudgeCards,
} = props.session?.bindings || liveBindings;

const { showExitConfirm, cancelExitGame, confirmExitGame } = liveBindings;
const exitDialog = ref(null);
const trapExitFocus = (event) => {
  if (event.key !== "Tab") return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  if (event.shiftKey && document.activeElement === buttons[0]) {
    event.preventDefault();
    buttons.at(-1)?.focus();
  } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
    event.preventDefault();
    buttons[0]?.focus();
  }
};
watch(showExitConfirm, async (open) => {
  await nextTick();
  if (open) exitDialog.value?.showModal();
  else exitDialog.value?.close();
});
onUnmounted(() => {
  if (!tutorialMode) cancelExitGame();
});

// ====== 【核心修复 2：防脱发防白屏机制】 ======
const _exposeToHtml = {
  exitDialog, showExitConfirm, cancelExitGame, confirmExitGame, trapExitFocus,
  tutorialMode, tutorialPhase, battleSession, canBoardAction, cardIsSelectable, cardIsTarget, actionIsTarget, boardCardId, boardCardLabel,
  phaseNotice,
  effectsSettingsOpen,
  effectsQuality,
  audioLevels,
  userId,
  otherPlayers,
  currentTurn,
  countdown,
  activeActionTexts,
  activeEmojis,
  currentAoeType,
  pendingAoePlayers,
  aoeInitiator,
  tableCards,
  lastPlayPlayer,
  sortedTableCards,
  isSpectator,
  myStatus,
  handCards,
  amIPendingAoe,
  selectedCards,
  aoeAnimCards,
  sortedHandCards,
  showEmojiPanel,
  emojiList,
  winner,
  winningCards,
  killText,
  sortedWinningCards,
  getCardImageUrl,
  handleImageError,
  toggleSelect,
  respondAoe,
  discardAoe,
  playCards,
  replaceCard,
  passTurn,
  toggleEmojiPanel,
  sendEmoji,
  exitGame,
  returnToRoom,
  onlyHasScrolls,
  soundStatus,
  toggleSound,
  isShuffling,
  warningUserId,
  mySkill,
  showSkillSelection,
  showGuanxingModal,
  guanxingCards,
  selectedGuanxingCards,
  selectSkill,
  toggleGuanxingSelect,
  confirmGuanxing,
  playBGM,
  skillCountdown,
  showWgfdModal,
  wgfdCards,
  selectedWgfdCard,
  toggleWgfdSelect,
  confirmWgfd,
  confirmGushouDiscard,
  jdsrTarget,
  jdsrInitiator,
  luanjianInitiator, // <--- 干净的唯一暴露
  kurouUseCount,
  kurouUsesThisTurn,
  kurouAwakened,
  guixinDisabled,
  guixinPendingPasser,
  showGuixinModal,
  confirmGuixinDecision,
  confirmKurouAwakenDiscard,
  skipKurouAwakenDiscard,
  tieqiJudgeCards,
};
</script>

<style scoped src="./GameBoard.css"></style>
