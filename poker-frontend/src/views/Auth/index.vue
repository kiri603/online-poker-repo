<template src="./Auth.html"></template>

<script setup>
import SettingsButton from '@/components/SettingsButton.vue';
import { uiTheme } from '@/store/uiSettings.js';
import { useAuthArtwork } from './useAuthArtwork.js';
import { nextTick, onUnmounted, ref, watch } from 'vue';
const { popHero, artworkReady, moveArtwork, resetArtwork } = useAuthArtwork();
const authPasswordVisible = ref(false);
import {
  authCaptchaCode,
  authCaptchaImage,
  authChecked,
  authError,
  authLoading,
  authMode,
  authModalVisible,
  authPassword,
  authSuccess,
  authUsername,
  closeAuthModal,
  openAuthModal,
  refreshCaptcha,
  submitAuth,
  submitGuestLogin,
  switchAuthMode,
} from "./Auth.js";

let authOpener;
const trapAuthFocus = (event) => {
  if (uiTheme.value === 'pop') return;
  const items = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(element => element.getClientRects().length);
  const first=items[0], last=items.at(-1);
  if(event.shiftKey && document.activeElement===first) { event.preventDefault();last?.focus(); }
  else if(!event.shiftKey && document.activeElement===last) { event.preventDefault();first?.focus(); }
};
const focusAuthInput = () => document.querySelector('.auth-modal input')?.focus({ preventScroll: true });
watch(authModalVisible,async visible=>{
  if(visible) { authOpener=document.activeElement; }
  else { authPasswordVisible.value=false;await nextTick();const opener=authOpener?.isConnected ? authOpener : document.querySelector('.pop-account-button');if(opener?.getClientRects().length) opener.focus({preventScroll:true}); }
});
watch(uiTheme, async () => { if(authModalVisible.value) { await nextTick();focusAuthInput(); } });
onUnmounted(closeAuthModal);

const _exposeToHtml = {
  authCaptchaCode,
  authCaptchaImage,
  authChecked,
  authError,
  authLoading,
  authMode,
  authModalVisible,
  authPassword,
  authSuccess,
  authUsername,
  closeAuthModal,
  openAuthModal,
  refreshCaptcha,
  submitAuth,
  submitGuestLogin,
  switchAuthMode,
};
</script>

<style scoped src="./Auth.css"></style>
<style scoped src="./AuthPop.css"></style>
