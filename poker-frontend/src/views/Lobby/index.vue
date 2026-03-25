<template src="./Lobby.html"></template>

<script setup>
// 【核心修复】：在 Vue 组件内部执行生命周期钩子
import { onMounted, onUnmounted } from "vue";
import {
  roomId,
  userId,
  isPrivate,
  roomPassword,
  publicRooms,
  showRules,
  showUpdates,
  connectWebSocket,
  quickJoin,
  goToRuleDetail,
  showCreateModal,
  roomSettings,
  handleJoinClick,
  confirmCreateRoom,
  startPolling,
  stopPolling,
  soundStatus,
  toggleSound,
  playBGM,
} from "./Lobby.js";

// ====== 【核心防白屏机制】：强制暴露变量，防 Vite 误删 ======
const _exposeToHtml = {
  roomId,
  userId,
  isPrivate,
  roomPassword,
  publicRooms,
  showRules,
  showUpdates,
  connectWebSocket,
  quickJoin,
  goToRuleDetail,
  showCreateModal,
  roomSettings,
  handleJoinClick,
  confirmCreateRoom,
  startPolling,
  stopPolling,
  soundStatus,
  toggleSound,
  playBGM,
};

onMounted(() => {
  startPolling(); // 组件挂载时启动轮询
  playBGM("Welcome");
});

onUnmounted(() => {
  stopPolling(); // 组件销毁时停止轮询
});
</script>

<style scoped src="./Lobby.css"></style>
