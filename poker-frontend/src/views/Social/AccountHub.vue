<template src="./AccountHub.html"></template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { uiTheme } from '@/store/uiSettings.js';
import PlayerAvatar from '@/components/PlayerAvatar.vue';
import PopAccountButton from '@/components/PopAccountButton.vue';
import { isConnected, isReconnecting } from '@/store/gameState.js';
import {
  authUser,
  canUseSocial,
  closeProfilePanel,
  fetchSocialOverview,
  friends,
  openConversation,
  openFriendProfile,
  openProfilePanel,
  pendingRequests,
  removeFriend,
  respondFriendRequest,
  respondRoomInvite,
  searchSocialUsers,
  sendFriendRequest,
  sendSocialMessage,
  socialActiveTab,
  socialChatDraft,
  socialChatFriendId,
  socialChatMessages,
  socialFriendNotificationCount,
  socialInvitePrompt,
  socialNotificationCount,
  socialProfileLoading,
  socialProfileVisible,
  socialSearchEmptyMessage,
  socialSearchKeyword,
  socialSearchResults,
  logout,
  profile,
  records,
  isViewingSelf,
  displayInitial,
  levelProgressWidth,
  activeChatFriend,
  mobileFriendView,
  handleAccountClick,
  openSelfProfile,
  confirmRemoveFriend,
  openFriendConversation,
  backToFriendList,
  formatTime,
  accountAvatar, avatarPreview, avatarOptions, selectedAvatarId, avatarLoading,
  avatarSaving, avatarError, avatarMessage, loadAvatarOptions, saveSelectedAvatar, trapHubFocus,
} from "./AccountHub.js";

const popProfileDialog = ref(null);
const popChatMessages = ref(null);
const popAccountTabs = [{ id: 'account', label: '账号' }, { id: 'profile', label: '战绩' }, { id: 'friends', label: '好友' }];
const popAccountTitle = computed(() => isViewingSelf.value
  ? popAccountTabs.find((tab) => tab.id === socialActiveTab.value)?.label || '战绩'
  : '战绩');
let popDialogOpener;
watch([socialProfileVisible, uiTheme], async ([visible, theme]) => {
  if (theme !== 'pop') return;
  await nextTick();
  const dialog = popProfileDialog.value;
  if (!dialog) return;
  if (visible && !dialog.open) {
    popDialogOpener = document.activeElement;
    dialog.showModal();
    dialog.querySelector('.account-heading button')?.focus({ preventScroll: true });
  } else if (!visible && dialog.open) {
    dialog.close();
    const opener = popDialogOpener?.isConnected && popDialogOpener.getClientRects().length
      ? popDialogOpener : document.querySelector('.pop-lobby .player-trigger,.peach-hub .player-trigger');
    opener?.focus({ preventScroll: true });
  }
});
watch([socialChatMessages, socialActiveTab, socialChatFriendId], async () => {
  await nextTick();
  const list = popChatMessages.value;
  if (list) list.scrollTop = list.scrollHeight;
});
onUnmounted(() => {
  popProfileDialog.value?.close();
  if (socialProfileVisible.value) closeProfilePanel();
});

const _exposeToHtml = {
  isConnected, isReconnecting,
  popProfileDialog, popChatMessages, popAccountTabs, popAccountTitle,
  authUser,
  canUseSocial,
  closeProfilePanel,
  fetchSocialOverview,
  friends,
  openConversation,
  openFriendProfile,
  openProfilePanel,
  pendingRequests,
  removeFriend,
  respondFriendRequest,
  respondRoomInvite,
  searchSocialUsers,
  sendFriendRequest,
  sendSocialMessage,
  socialActiveTab,
  socialChatDraft,
  socialChatFriendId,
  socialChatMessages,
  socialFriendNotificationCount,
  socialInvitePrompt,
  socialNotificationCount,
  socialProfileLoading,
  socialProfileVisible,
  socialSearchEmptyMessage,
  socialSearchKeyword,
  socialSearchResults,
  logout,
  profile,
  records,
  isViewingSelf,
  displayInitial,
  levelProgressWidth,
  activeChatFriend,
  mobileFriendView,
  handleAccountClick,
  openSelfProfile,
  confirmRemoveFriend,
  openFriendConversation,
  backToFriendList,
  formatTime,
  accountAvatar, avatarPreview, avatarOptions, selectedAvatarId, avatarLoading,
  avatarSaving, avatarError, avatarMessage, loadAvatarOptions, saveSelectedAvatar, trapHubFocus,
};
</script>

<style scoped src="./AccountHub.css"></style>
<style scoped src="./AccountHubPop.css"></style>
