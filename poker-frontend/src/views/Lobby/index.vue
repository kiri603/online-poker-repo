<template src="./Lobby.html"></template>

<script setup>
import { onMounted, onUnmounted } from "vue";
import TutorialInvitation from "@/views/Tutorial/TutorialInvitation.vue";
import { openTutorial } from "@/store/tutorialState.js";
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
  soundStatus,
  startPolling,
  stopPolling,
  toggleSound,
} from "./Lobby.js";

const _exposeToHtml = {
  openTutorial,
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
  soundStatus,
  startPolling,
  stopPolling,
  toggleSound,
};

onMounted(() => {
  startPolling();
  playBGM("Welcome");
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped src="./Lobby.css"></style>
