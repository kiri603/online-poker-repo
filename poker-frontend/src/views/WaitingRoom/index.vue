<template src="./WaitingRoom.html"></template>

<script setup>
import {
  showSettings,
  roomSettings,
  isClassicMode,
  ownerId,
  userId,
  isReady,
  otherPlayers,
  allReady,
  handleScrollCardsChange,
  kickPlayer,
  startGame,
  addScriptAi,
  toggleReady,
  returnToLobby,
  soundStatus,
  disbandRoom,
  toggleSound,
  spectators,
  isSpectator,
  playBGM,
} from "./WaitingRoom.js";

// ====== 【核心防白屏机制】：强制暴露变量，防 Vite 误删 ======
const _exposeToHtml = {
  showSettings,
  roomSettings,
  isClassicMode,
  ownerId,
  userId,
  isReady,
  otherPlayers,
  allReady,
  handleScrollCardsChange,
  kickPlayer,
  startGame,
  addScriptAi,
  toggleReady,
  returnToLobby,
  soundStatus,
  disbandRoom,
  toggleSound,
  spectators,
  isSpectator,
  playBGM,
};
</script>

<style scoped src="./WaitingRoom.css"></style>
