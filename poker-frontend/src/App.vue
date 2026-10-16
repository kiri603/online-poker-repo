<template>
  <div class="game-container">
    <div class="app-viewport">
    <ErrorToast />
    <GameSettings />
    <RulesDetail v-if="showRuleDetail" />
    <AccountHub
      v-if="
        authChecked &&
        isAuthenticated &&
        authUser &&
        !authUser.guest &&
        !showRuleDetail &&
        !gameStarted && !showTutorial
      "
    />

    <div
      v-if="
        authChecked &&
        isAuthenticated &&
        authUser &&
        !authUser.guest &&
        dailySignInVisible && !showTutorial
      "
      class="daily-signin-overlay"
    >
      <div class="daily-signin-card">
        <div class="daily-signin-title">每日签到</div>
        <div class="daily-signin-glow">经验 +3</div>
        <button
          class="daily-signin-btn"
          :disabled="dailySignInLoading"
          @click="claimDailySignIn"
        >
          {{ dailySignInLoading ? "签到中..." : "签到" }}
        </button>
        <div v-if="dailySignInMessage" class="daily-signin-message">
          {{ dailySignInMessage }}
        </div>
      </div>
    </div>

    <Transition name="app-page" @before-enter="enableEnteringPage" @before-leave="disableLeavingPage">
    <AuthView v-if="!authChecked || !isAuthenticated" />
    <TutorialView v-else-if="showTutorial && !isConnected && !isReconnecting" :key="tutorialKind" :kind="tutorialKind"
      @exit="closeTutorial" @advanced="openTutorial('advanced')" />
    <Lobby v-else-if="!isConnected && !isReconnecting" />

    <div v-else class="game-table" :class="{ 'game-table--pop-battle': gameStarted && uiTheme === 'pop' }">
      <div v-if="gameStarted && uiTheme !== 'pop'" class="header">
        <span>房间号: {{ roomId }}</span>
        <span>我的ID: {{ userId }}</span>
      </div>

      <Transition name="app-page" @before-enter="enableEnteringPage" @before-leave="disableLeavingPage">
        <WaitingRoom v-if="!gameStarted" />
        <GameBoard v-else />
      </Transition>
    </div>
    </Transition>
    <div v-if="isReconnecting" class="connection-recovery" role="status" aria-live="polite">
      <div>
        <p>连接中断，正在恢复...</p>
        <p>已保留对局，最多等待 30 秒</p>
        <button @click="disconnectWebSocket()">返回大厅</button>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { observeViewport } from "@/layout/viewport.js";
import {
  bootstrapAuth,
  claimDailySignIn,
  verifyCurrentSession,
} from "@/store/authStore.js";
import { fetchSocialOverview, resetSocialState } from "@/store/socialStore.js";
import { disconnectWebSocket } from "@/store/gameSocket.js";
import {
  authChecked,
  authUser,
  dailySignInLoading,
  dailySignInMessage,
  dailySignInVisible,
  gameStarted,
  isAuthenticated,
  isConnected,
  isReconnecting,
  roomId,
  showRuleDetail,
  userId,
} from "@/store/gameState.js";

import ErrorToast from "@/views/Modals/ErrorToast.vue";
import GameSettings from "@/components/GameSettings.vue";
import AuthView from "@/views/Auth/index.vue";
import Lobby from "@/views/Lobby/index.vue";
import WaitingRoom from "@/views/WaitingRoom/index.vue";
import GameBoard from "@/views/GameBoard/index.vue";
import RulesDetail from "@/views/RulesDetail/index.vue";
import AccountHub from "@/views/Social/AccountHub.vue";
import TutorialView from "@/views/Tutorial/index.vue";
import { showTutorial, tutorialKind, openTutorial, closeTutorial } from "@/store/tutorialState.js";
import { uiTheme } from '@/store/uiSettings.js';

let authHeartbeat = null;
let socialHeartbeat = null;
let stopViewport = null;
const disableLeavingPage = (element) => { element.inert = true; };
const enableEnteringPage = (element) => { element.inert = false; };

onMounted(() => {
  stopViewport = observeViewport(window, ({ width, height, left, top }) => {
    const style = document.documentElement.style;
    style.setProperty('--app-width', `${width}px`);
    style.setProperty('--app-height', `${height}px`);
    style.setProperty('--app-left', `${left}px`);
    style.setProperty('--app-top', `${top}px`);
  });
});

onMounted(async () => {
  await bootstrapAuth();
  authHeartbeat = window.setInterval(() => {
    if (
      isAuthenticated.value &&
      authUser.value &&
      !authUser.value.guest
    ) {
      verifyCurrentSession();
    }
  }, 5000);
  socialHeartbeat = window.setInterval(() => {
    if (
      isAuthenticated.value &&
      authUser.value &&
      !authUser.value.guest
    ) {
      fetchSocialOverview();
    }
  }, 2000);
  if (
    isAuthenticated.value &&
    authUser.value &&
    !authUser.value.guest
  ) {
    fetchSocialOverview();
  }
});

onUnmounted(() => {
  stopViewport?.();
  if (authHeartbeat) {
    clearInterval(authHeartbeat);
    authHeartbeat = null;
  }
  if (socialHeartbeat) {
    clearInterval(socialHeartbeat);
    socialHeartbeat = null;
  }
});

watch(
  () => [isAuthenticated.value, authUser.value?.guest],
  ([authed, guest]) => {
    if (!authed) closeTutorial();
    if (authed && !guest) {
      fetchSocialOverview();
      return;
    }
    resetSocialState();
  },
  { immediate: false },
);
</script>

<style>
@media(prefers-reduced-motion:no-preference) {
  .app-page-enter-active { transition:opacity 320ms ease,translate 420ms cubic-bezier(.2,.8,.2,1); }
  .app-page-leave-active { position:absolute!important;inset:0;pointer-events:none;transition:opacity 180ms ease; }
  .app-page-enter-from { opacity:0;translate:0 16px; }
  .app-page-leave-to { opacity:0; }
  ::view-transition-old(root) { animation:theme-fade-out 260ms ease both; }
  ::view-transition-new(root) { animation:theme-reveal 480ms cubic-bezier(.2,.8,.2,1) both; }
  @keyframes theme-fade-out { to { opacity:0; } }
  @keyframes theme-reveal { from { clip-path:inset(0 100% 0 0); }to { clip-path:inset(0); } }
}
@media(prefers-reduced-motion:reduce) { ::view-transition-group(*) { animation-duration:0s!important; } }
[data-ui-theme=pop] .daily-signin-overlay { background:#20212499;backdrop-filter:none; }
[data-ui-theme=pop] .daily-signin-card { background:#fff5e6;border:0;border-radius:4px;box-shadow:none;color:#202124; }
[data-ui-theme=pop] :is(.daily-signin-title,.daily-signin-glow) { color:#a53542;background:none;text-shadow:none;animation:none; }
[data-ui-theme=pop] .daily-signin-btn { background:#202124;color:#fff1d7;border:0;border-radius:2px;box-shadow:none; }
[data-ui-theme=pop] .daily-signin-message { color:#68615c; }
.connection-recovery {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 8, 8, 0.88);
  color: #fff5e6;
  text-align: center;
}
.connection-recovery button {
  padding: 10px 24px;
  border: 1px solid #d6ae64;
  border-radius: 8px;
  background: #6d2020;
  color: #fff5e6;
  cursor: pointer;
}
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  max-width: none !important;
  overflow: hidden;
}

.game-container {
  position: fixed;
  left: var(--app-left, 0px);
  top: var(--app-top, 0px);
  width: var(--app-width, 100vw);
  height: var(--app-height);
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  position: relative;
}

.game-table > .header {
  padding: 2px 8px;
  gap: 4px 12px;
  font-size: 12px;
  line-height: 1.5;
  flex-wrap: wrap;
}
.game-table.game-table--pop-battle { grid-template-rows: minmax(0,1fr); }

.header {
  padding: 3px 12px;
  background: rgba(10, 10, 10, 0.2);
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 12px;
}

.daily-signin-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 18, 29, 0.56);
  backdrop-filter: blur(6px);
}

.daily-signin-card {
  width: min(420px, calc(100vw - 32px));
  padding: 28px 24px;
  border-radius: 24px;
  background: linear-gradient(145deg, #2a4055, #314b63);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 48px rgba(9, 15, 23, 0.42);
  text-align: center;
  color: #fff;
}

.daily-signin-title {
  font-size: 30px;
  font-weight: 800;
}

.daily-signin-glow {
  margin-top: 14px;
  font-size: 36px;
  font-weight: 900;
  color: #69f1a7;
  text-shadow:
    0 0 12px rgba(105, 241, 167, 0.7),
    0 0 24px rgba(255, 199, 94, 0.32);
  animation: signinPulse 2s ease-in-out infinite;
}

.daily-signin-desc {
  margin-top: 14px;
  line-height: 1.7;
  color: #dbe8f5;
}

.daily-signin-btn {
  margin-top: 22px;
  min-width: 180px;
  padding: 12px 24px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #2fb96f, #36d079);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
}

.daily-signin-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.daily-signin-message {
  margin-top: 14px;
  font-size: 14px;
  color: #ffe096;
}

@keyframes signinPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.04);
    opacity: 0.88;
  }
}

@media screen and (max-width: 768px) {
  .header {
    font-size: 14px;
    padding: 10px;
    flex-wrap: wrap;
  }

  .daily-signin-card {
    padding: 24px 18px;
    border-radius: 20px;
  }

  .daily-signin-title {
    font-size: 26px;
  }

  .daily-signin-glow {
    font-size: 32px;
  }
}
</style>
