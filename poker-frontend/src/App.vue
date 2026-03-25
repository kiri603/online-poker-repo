<template>
  <div class="game-container">
    <ErrorToast />
    <RulesDetail v-if="showRuleDetail" />

    <Lobby v-if="!isConnected" />

    <div v-else class="game-table">
      <div class="header">
        <span>房间号: {{ roomId }}</span>
        <span>我的ID: {{ userId }}</span>
      </div>

      <WaitingRoom v-if="!gameStarted" />
      <GameBoard v-else />
    </div>
  </div>
</template>

<script setup>
// 1. 引入全局状态，用于控制页面的切换
import {
  isConnected,
  gameStarted,
  roomId,
  userId,
  showRuleDetail,
} from "@/store/gameState.js";

// 2. 引入拆分好的核心组件
import ErrorToast from "@/views/Modals/ErrorToast.vue";
import Lobby from "@/views/Lobby/index.vue";
import WaitingRoom from "@/views/WaitingRoom/index.vue";
import GameBoard from "@/views/GameBoard/index.vue";
import RulesDetail from "@/views/RulesDetail/index.vue";
</script>

<style>
/* ==========================================
   全局基础 CSS (CSS Reset 与根容器)
   注: 业务组件的 CSS 已经全部分散到了各自的文件夹中
   ========================================== */
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  max-width: none !important; /* 强制取消框架可能带的 1280px 限制 */
  overflow: hidden; /* 防止出现多余的滚动条 */
}

.game-container {
  width: 100vw;
  height: 100vh;
  background-color: #2c3e50;
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: Arial, sans-serif;
}

.game-table {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}

.header {
  padding: 15px 20px;
  background: rgba(10, 10, 10, 0.2);
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 18px;
}

/* 手机端 Header 适配 */
@media screen and (max-width: 768px) {
  .header {
    font-size: 14px;
    padding: 10px;
    flex-wrap: wrap;
  }
}
</style>
