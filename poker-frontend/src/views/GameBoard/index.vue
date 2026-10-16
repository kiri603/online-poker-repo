<template src="./GameBoard.html"></template>

<script setup>
import SettingsButton from '@/components/SettingsButton.vue';
import PlayerAvatar from '@/components/PlayerAvatar.vue';
import BattleEffectsLayer from "./BattleEffectsLayer.vue";
import BattlePhaseNotice from "./BattlePhaseNotice.vue";
import PopBattleTable from './PopBattleTable.vue';
import PopCardFace from './PopCardFace.vue';
import { uiTheme } from '@/store/uiSettings.js';
import { roomId } from '@/store/gameState.js';
import { measurePopBattle } from './popBattleLayout.js';
// 【核心修复 1】：移除了 onMounted 中的 playBGM("Normal")。
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { handSpacing } from "@/layout/hand.js";
import * as liveBindings from "./GameBoard.js";
import { cardLabel as boardCardLabel } from "@/tutorial/tutorialMatch.js";
const props = defineProps({ session: { type: Object, default: null } });
const tutorialMode = !!props.session;
const isPopBattle = computed(() => uiTheme.value === 'pop' && !tutorialMode);
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
const boardElement = ref(null);
const handElement = ref(null);
const popEmojiDialog = ref(null);
const popSkillArmed = ref(false);
const skillNames = { ZHIHENG:'制衡', LUANJIAN:'乱箭', GUANXING:'观星', GUSHOU:'固守', KUROU:'苦肉', TIEQI:'铁骑', GUIXIN:'归心' };
const popSkillName = computed(() => skillNames[mySkill.value] || '制衡');
const popSkillRequired = computed(() => ({ZHIHENG:1,LUANJIAN:2,KUROU:2}[mySkill.value] || 0));
const popSkillUnavailable = computed(() => !canBoardAction('replace') || jdsrTarget.value === userId.value ||
  (mySkill.value === 'GUSHOU' && !tableCards.value.length && !onlyHasScrolls.value) ||
  (mySkill.value === 'KUROU' && kurouUsesThisTurn.value >= 2) || (mySkill.value === 'GUIXIN' && guixinDisabled.value));
const popSelectionText = computed(() => popSkillArmed.value ? `选择 ${popSkillRequired.value} 张牌发动${popSkillName.value}` : selectedCards.value.length ? `已选 ${selectedCards.value.length} 张` : '');
const popPlayerName = id => id === userId.value ? '你' : otherPlayers.value.find(player => player.userId === id)?.nickname || id;
const popCardLabel = card => card.suit === 'SCROLL' ? boardCardLabel(card) : card.suit === 'JOKER' ? card.rank : ({'♠':'黑桃','♥':'红桃','♣':'梅花','♦':'方块'}[card.suit] || card.suit) + card.rank;
const popUseSkill = () => {
  if (popSkillUnavailable.value) return;
  if (popSkillRequired.value && selectedCards.value.length !== popSkillRequired.value) {
    popSkillArmed.value = !popSkillArmed.value;
    selectedCards.value.forEach(card => { card.selected = false; });
    return;
  }
  popSkillArmed.value = false;
  replaceCard();
};
const closePopEmoji = () => { showEmojiPanel.value = false; };
watch(showEmojiPanel, async (open) => {
  await nextTick();
  if (!isPopBattle.value || !popEmojiDialog.value) return;
  if (open) popEmojiDialog.value.showModal();
  else popEmojiDialog.value.close();
});
const popKeydown = event => {
  if (!isPopBattle.value || event.target.closest('dialog')) return;
  const modal = event.target.closest('.game-over-modal,.skill-action-overlay');
  if (modal) {
    if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
      if (!controls.length) { event.preventDefault();return; }
      if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) {
        event.preventDefault();(event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    }
    return;
  }
  if (event.key === 'Escape') { popSkillArmed.value = false;selectedCards.value.forEach(card => { card.selected = false; }); }
  if (event.ctrlKey && event.key === 'Enter') { event.preventDefault();boardElement.value.querySelector('[data-tutorial-target="play"]:not(:disabled)')?.click(); }
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !event.target.closest('.gb-hand > .card')) return;
  event.preventDefault();
  const cards = [...handElement.value.querySelectorAll(':scope > .card')];
  const index = cards.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length-1 : (index+(event.key==='ArrowRight'?1:-1)+cards.length)%cards.length;
  cards[next]?.focus({preventScroll:true});
  cards[next]?.scrollIntoView({block:'nearest',inline:'nearest'});
};
watch(() => [currentTurn.value,currentAoeType.value,winner.value,uiTheme.value], () => {
  if (isPopBattle.value) { popSkillArmed.value = false;closePopEmoji(); }
  nextTick(scheduleLayout);
});
let popPreviousFocus;
watch(() => !!(showSkillSelection.value || showGuanxingModal.value || showWgfdModal.value || winner.value), async (open) => {
  if (!isPopBattle.value) return;
  if (open) popPreviousFocus = document.activeElement;
  await nextTick();
  if (open) {
    const modal = boardElement.value?.querySelector('.game-over-modal,.skill-action-overlay');
    (modal?.querySelector('button:not(:disabled),[tabindex="0"]') || modal)?.focus();
  }
  else if (popPreviousFocus?.isConnected) popPreviousFocus.focus({preventScroll:true});
});
let layoutObserver;
let layoutFrame = null;
const measureLayout = () => {
  layoutFrame = null;
  const board = boardElement.value;
  const hand = handElement.value;
  if (!board || !hand) return;
  const height = board.clientHeight;
  board.classList.toggle('gb-landscape', board.clientWidth > height && height <= 540);
  board.classList.toggle('gb-compact', height <= 360);
  board.style.setProperty('--board-height', `${height}px`);
  if (isPopBattle.value) {
    measurePopBattle(board, hand, sortedHandCards.value.length);
    board.dispatchEvent(new Event('game-board-layout', { bubbles:true }));
    return;
  }
  for (const strip of board.querySelectorAll('.card-backs')) {
    const card = strip.firstElementChild;
    if (!card) continue;
    const width = card.getBoundingClientRect().width;
    const count = strip.children.length;
    const step = count > 1 ? Math.max(.5, Math.min(width * .4, (strip.clientWidth - width) / (count - 1))) : 0;
    strip.style.setProperty('--back-step', `${step}px`);
    strip.style.setProperty('--back-pack-width', `${width + (count - 1) * step}px`);
  }
  const arena = board.querySelector('.gb-arena');
  const heading = board.querySelector('.gb-arena-heading');
  const notice = board.querySelector('.jdsr-floating-notification');
  const phase = board.querySelector('.phase-notice');
  const display = board.querySelector('.played-cards');
  const row = display?.querySelector('.card-display-row');
  const verticalSpace = (element) => {
    if (!element) return 0;
    const css = getComputedStyle(element);
    return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth', 'marginTop', 'marginBottom'].reduce((sum, property) => sum + (parseFloat(css[property]) || 0), 0);
  };
  const sideBySide = phase && getComputedStyle(display).display === 'grid';
  const tableSpace = ['.gb-table', '.gb-table-frame', '.gb-table-felt'].reduce((sum, selector) => sum + verticalSpace(board.querySelector(selector)), verticalSpace(row));
  const captionSpace = sideBySide ? 0 : (phase?.offsetHeight || display?.querySelector('.gb-played-owner')?.offsetHeight || 0) + (parseFloat(display && getComputedStyle(display).rowGap) || 0);
  // The table borrows only the remaining arena height, keeping buttons and hand reserved.
  const tableHeight = Math.max(30, Math.min(112, arena.clientHeight - (heading?.offsetHeight || 0) - (notice?.offsetHeight || 0) - captionSpace - tableSpace));
  board.style.setProperty('--table-card-height', `${tableHeight}px`);
  if (row) {
    const tableWidth = tableHeight * .714286;
    const { step } = handSpacing(row.clientWidth - 6, tableWidth, row.children.length, tableWidth + 4);
    row.style.setProperty('--table-step', `${step}px`);
  }
  const style = getComputedStyle(hand);
  if (tutorialMode) board.parentElement.style.setProperty('--tutorial-hand-space', `${hand.offsetHeight + (board.querySelector('.gb-action-region')?.offsetHeight || 0)}px`);
  const available = hand.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const cardWidth = parseFloat(getComputedStyle(hand.querySelector('.card') || hand).width);
  const { step, width } = handSpacing(available, cardWidth, sortedHandCards.value.length);
  hand.style.setProperty('--hand-step', `${step}px`);
  hand.style.setProperty('--hand-width', `${width}px`);
  // Card spacing can move targets without resizing them. Notify local overlays
  // after the layout variables are applied; this event never enters the socket.
  board.dispatchEvent(new Event('game-board-layout', { bubbles: true }));
};
const scheduleLayout = () => {
  if (layoutFrame === null) layoutFrame = requestAnimationFrame(measureLayout);
};
onMounted(() => {
  layoutObserver = new ResizeObserver(scheduleLayout);
  layoutObserver.observe(boardElement.value);
  layoutObserver.observe(handElement.value);
  layoutObserver.observe(boardElement.value.querySelector('.gb-arena'));
  layoutObserver.observe(boardElement.value.querySelector('.gb-arena-heading'));
  layoutObserver.observe(boardElement.value.querySelector('.gb-table-frame'));
  measureLayout();
});
watch(() => sortedHandCards.value.length, () => nextTick(scheduleLayout));
watch(() => [sortedTableCards.value.length, phaseNotice.value, ...otherPlayers.value.map(player => player.cardCount)], () => nextTick(scheduleLayout));
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
  layoutObserver?.disconnect();
  if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
  if (!tutorialMode) cancelExitGame();
});

// ====== 【核心修复 2：防脱发防白屏机制】 ======
const _exposeToHtml = {
  boardElement, handElement,
  isPopBattle, roomId, PopBattleTable, PopCardFace, popEmojiDialog, closePopEmoji, popSkillArmed, popSkillName, popSkillUnavailable, popSelectionText, popPlayerName, popCardLabel, popUseSkill, popKeydown,
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
<style scoped src="./GameBoard.layout.css"></style>
<style scoped src="./GameBoardPop.css"></style>
