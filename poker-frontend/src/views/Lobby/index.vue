<template src="./Lobby.html"></template>

<script setup>
import SettingsButton from '@/components/SettingsButton.vue';
import PopAccountButton from '@/components/PopAccountButton.vue';
import { uiTheme } from '@/store/uiSettings.js';
import { authUser } from '@/store/gameState.js';
import { logout } from '@/store/authStore.js';
import { computed, nextTick, ref, watch } from 'vue';
const roomFilter = ref('all');
const motionPaused = ref(false);
const createPanel = ref(null);
const paperCards = [
  { rank: 'K', suit: 3, className: 'back-card' },
  { rank: 'Q', suit: 1, className: 'middle-card' },
  { rank: 'A', suit: 0, className: 'front-card' },
];
const roomSuits = [
  'M50 0C36 21 3 44 3 66c0 21 26 32 44 12-1 17-7 27-16 37h38C59 103 53 94 53 78c18 20 44 9 44-12C97 44 64 21 50 0Z',
  'M50 104C32 81 5 60 5 36 5 7 39 8 50 27 61 8 95 7 95 36c0 24-27 45-45 68Z',
  'M49 0c-26 0-32 26-16 43C2 37-10 79 18 91c12 5 22-1 29-10-1 17-7 26-17 34h39C58 105 53 96 53 81c7 9 17 15 29 10 28-12 16-54-15-48C83 26 76 0 49 0Z',
  'M50 3 94 60 50 117 6 60Z',
];
const filteredRooms = computed(() => publicRooms.value.filter(room => roomFilter.value === 'all' || (roomFilter.value === 'classic' ? getRoomModeClass(room) === 'mode-classic' : getRoomModeClass(room) !== 'mode-classic')));
import { onMounted, onUnmounted } from "vue";
import TutorialInvitation from "@/views/Tutorial/TutorialInvitation.vue";
import TutorialSelector from "@/views/Tutorial/TutorialSelector.vue";
import { openTutorialSelection, showTutorialSelector } from "@/store/tutorialState.js";
import {
  activeInfoTab,
  closeInfoPanel,
  confirmCreateRoom,
  getRoomCapacity,
  getRoomModeClass,
  getRoomModeLabel,
  goToRuleDetail,
  handleJoinClick,
  isPrivate,
  openInfoPanel,
  openCreateRoom,
  playBGM,
  publicRooms,
  quickJoin,
  refreshing,
  refreshRooms,
  roomId,
  roomPassword,
  roomSettings,
  setInfoTab,
  showCreateModal,
  showRuleDetail,
  showRules,
  showUpdates,
  startPolling,
  stopPolling,
} from "./Lobby.js";

const _exposeToHtml = {
  openTutorialSelection, showTutorialSelector,
  activeInfoTab,
  closeInfoPanel,
  confirmCreateRoom,
  getRoomCapacity,
  getRoomModeClass,
  getRoomModeLabel,
  goToRuleDetail,
  handleJoinClick,
  isPrivate,
  openInfoPanel,
  openCreateRoom,
  playBGM,
  publicRooms,
  quickJoin,
  refreshing,
  refreshRooms,
  roomId,
  roomPassword,
  roomSettings,
  setInfoTab,
  showCreateModal,
  showRuleDetail,
  showRules,
  showUpdates,
  startPolling,
  stopPolling,
  createPanel, paperCards, motionPaused, updatePaperParallax, resetPaperParallax, handleCreateKeydown, confirmPaperCreate,
};

function updatePaperParallax(event) {
  if (motionPaused.value || window.matchMedia('(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)').matches) return;
  const area = event.currentTarget;
  const rect = area.getBoundingClientRect();
  area.style.setProperty('--paper-x', ((event.clientX - rect.left) / rect.width - .5).toFixed(3));
  area.style.setProperty('--paper-y', ((event.clientY - rect.top) / rect.height - .5).toFixed(3));
}
function resetPaperParallax(event) {
  event.currentTarget.style.removeProperty('--paper-x');
  event.currentTarget.style.removeProperty('--paper-y');
}
function confirmPaperCreate() {
  const invalid = createPanel.value?.querySelector('input:invalid');
  if (invalid) {
    invalid.reportValidity();
    return;
  }
  confirmCreateRoom();
}
function handleCreateKeydown(event) {
  if (uiTheme.value !== 'pop') return;
  if (event.key === 'Escape') { event.preventDefault(); showCreateModal.value = false; }
  if (event.key !== 'Tab') return;
  const controls = [...createPanel.value.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
  if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
}
let createOpener;
watch(showCreateModal, async open => {
  if (uiTheme.value !== 'pop') return;
  if (open) {
    createOpener = document.activeElement;
    await nextTick();
    createPanel.value?.querySelector('.create-roomno-input')?.focus();
  } else {
    // Wait until the lobby's inert binding has been removed before restoring focus.
    await nextTick();
    if (createOpener?.isConnected) createOpener.focus({ preventScroll: true });
  }
});

onMounted(() => {
  startPolling();
  playBGM("Welcome");
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped src="./Lobby.css"></style>
<style scoped src="./LobbyPop.css"></style>
