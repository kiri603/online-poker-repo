import { computed, nextTick, ref, watch } from "vue";
import { authUser } from "@/store/gameState.js";
import { logout } from "@/store/authStore.js";
import {
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
  socialProfile,
  socialProfileLoading,
  socialProfileVisible,
  socialSearchKeyword,
  socialSearchEmptyMessage,
  socialSearchResults,
} from "./socialBindings.js";

const profile = computed(() => socialProfile.value || {});

const records = computed(() => profile.value.recentRecords || []);

const isViewingSelf = computed(() => profile.value.self !== false);

const displayInitial = computed(() => {
  const raw = authUser.value?.nickname || authUser.value?.username || "";
  const char = Array.from(String(raw).trim())[0] || "?";
  return char.toUpperCase();
});

const levelProgressWidth = computed(() => ({
  width: `${Math.max(0, Math.min(100, profile.value.levelProgressPercent || 0))}%`,
}));

const activeChatFriend = computed(
  () =>
    friends.value.find((friend) => friend.userId === socialChatFriendId.value) ||
    null,
);

// Mobile-only sub-view within the Friends tab: 'list' shows list/search/requests,
// 'chat' shows the chat pane. Desktop ignores this ref via CSS.
const mobileFriendView = ref("list");

const handleAccountClick = async () => {
  if (!canUseSocial.value) {
    alert("游客登录暂不支持个人详情与好友功能");
    return;
  }
  await openProfilePanel("profile");
  await fetchSocialOverview();
};

const openSelfProfile = async () => {
  await openProfilePanel("profile");
};

const confirmRemoveFriend = async (friendUserId) => {
  if (!window.confirm(`确定要删除好友 ${friendUserId} 吗？`)) {
    return;
  }
  await removeFriend(friendUserId);
};

const openFriendConversation = (friendUserId) => {
  openConversation(friendUserId);
  mobileFriendView.value = "chat";
};

const backToFriendList = () => {
  mobileFriendView.value = "list";
};

const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace("T", " ").slice(0, 16);
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Reset mobile sub-view whenever the panel is closed or tab changes,
// and move focus into the dialog when it opens so keyboard + screen reader
// users don't stay anchored on the trigger pill beneath the overlay.
watch(socialProfileVisible, async (visible) => {
  if (visible) {
    await nextTick();
    if (typeof document !== "undefined") {
      const closeBtn = document.querySelector(".hub-panel .hub-close");
      if (closeBtn && typeof closeBtn.focus === "function") {
        closeBtn.focus({ preventScroll: true });
      }
    }
  } else {
    mobileFriendView.value = "list";
  }
});

watch(socialActiveTab, () => {
  mobileFriendView.value = "list";
});

// Global ESC handler — registered once at module load, checks reactive state
// so it's a no-op when the panel is closed. Safe because AccountHub is mounted
// as a single global overlay inside App.vue.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && socialProfileVisible.value) {
      closeProfilePanel();
    }
  });
}

export {
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
};
