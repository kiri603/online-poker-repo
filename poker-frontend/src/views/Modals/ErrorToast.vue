<template>
  <transition name="float-text">
    <div v-if="errorMessage" class="error-toast">⚠️ {{ errorMessage }}</div>
  </transition>
</template>

<script setup>
import { errorMessage } from "@/store/gameState.js";
</script>

<style scoped>
/* 全局错误提示飘窗 */
.error-toast {
  position: absolute;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(231, 76, 60, 0.95);
  color: white;
  padding: 12px 25px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: bold;
  z-index: 9999;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

/* 飘窗的进入与离开动画 */
.float-text-enter-active {
  animation: floatUpIn 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
.float-text-leave-active {
  animation: floatUpOut 0.5s ease-in forwards;
}

@keyframes floatUpIn {
  0% {
    transform: translate(-50%, 20px) scale(0.5);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}
@keyframes floatUpOut {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -100px) scale(0.8);
    opacity: 0;
  }
}
</style>
