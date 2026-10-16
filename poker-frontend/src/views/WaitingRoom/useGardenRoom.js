import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { authUser, activeEmojis, gameStarted, isConnected, isReconnecting, roomChatMessages, showRuleDetail } from '@/store/gameState.js';
import { settingsOpen } from '@/store/uiSettings.js';
import { socialOverview, socialNotificationCount, socialProfileVisible, socialDrawerOpen, socialInvitePrompt, openProfilePanel } from '@/store/socialStore.js';
import { sendMsg } from '@/store/gameSocket.js';
import * as waiting from './WaitingRoom.js';
import { positionSpeech } from './gardenSpeech.js';

export function useGardenRoom(shell) {
  const dialogName = ref(''), selectedUserId = ref(''), draft = ref(''), entered = ref(false);
  const speech = ref({});
  const timers = new Map();
  let opener, resizeObserver, frame, entryTimer, sequence = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const selectedPlayer = computed(() => waiting.displayPlayers.value.find(player => player.userId === selectedUserId.value));
  const selectedSpectator = computed(() => waiting.spectators.value.includes(selectedUserId.value));
  const pending = computed(() => waiting.displayPlayers.value.filter(player => player.userId !== waiting.ownerId.value && !player.isReady));
  const canStart = computed(() => waiting.isOwner.value && waiting.occupiedCount.value >= 2 && waiting.allReady.value && isConnected.value && !isReconnecting.value);
  const primaryLabel = computed(() => waiting.isManager.value ? '解散房间' : waiting.isSpectator.value ? '旁观中' : waiting.isOwner.value ? waiting.occupiedCount.value < 2 ? '至少 2 人开局' : canStart.value ? '开始游戏' : '等待准备' : waiting.isReady.value ? '取消准备' : '我准备好了');
  const readiness = computed(() => waiting.occupiedCount.value < 2 ? '至少 2 人即可开局' : pending.value.length ? `还差 ${pending.value.length} 人准备` : '全员准备就绪');
  const mode = computed(() => [waiting.isClassicMode.value && !waiting.roomSettings.value.enableSkills ? '经典模式' : '三国模式', waiting.roomSettings.value.enableScrollCards && '锦囊', waiting.roomSettings.value.enableSkills && '武将技能'].filter(Boolean).join(' / '));
  const ownAvatar = computed(() => socialOverview.value.avatar || waiting.avatarForPlayer(null, Math.max(0,waiting.seatSlots.value.findIndex(slot => slot.player?.isSelf))));
  const canManageSelected = computed(() => (waiting.isOwner.value || waiting.isManager.value) && selectedUserId.value && selectedUserId.value !== waiting.userId.value && selectedUserId.value !== 'room_manager');
  const cardPlayPaused = computed(() => !!(dialogName.value || settingsOpen.value || socialProfileVisible.value || socialDrawerOpen.value || socialInvitePrompt.value || !isConnected.value || isReconnecting.value || gameStarted.value || showRuleDetail.value));
  const ready = player => player?.userId === waiting.ownerId.value || player?.isReady;
  const nameFor = id => waiting.displayPlayers.value.find(player => player.userId === id)?.nickname || (id === waiting.userId.value ? authUser.value?.nickname : '') || id;

  function close() { shell.value?.querySelector('dialog[open]')?.close(); }
  function onClose(event) {
    if (event && event.currentTarget.dataset.dialog !== dialogName.value) return;
    dialogName.value = '';
    if (waiting.inviteModalOpen.value) waiting.closeInviteModal();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  async function open(name) {
    close(); opener = document.activeElement; dialogName.value = name;
    if (name === 'invite') waiting.openInviteModal();
    await nextTick();
    if (!shell.value || dialogName.value !== name) return;
    const dialog = shell.value.querySelector(`[data-dialog="${name}"]`);
    dialog?.showModal();
    dialog?.querySelector('[data-close]')?.focus({ preventScroll: true });
  }
  function dismiss(event) {
    const dialog = event.currentTarget;
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }
  function selectSeat(slot) {
    if (!slot.player) return open('invite');
    selectedUserId.value = slot.player.userId; open('player');
  }
  function addAi() { if (waiting.isOwner.value && waiting.occupiedCount.value < 4) { waiting.addScriptAi(); close(); } }
  function primary() {
    if (waiting.isManager.value) return waiting.disbandRoom();
    if (waiting.isSpectator.value || isReconnecting.value) return;
    if (canStart.value) waiting.startGame();
    else if (!waiting.isOwner.value) waiting.toggleReady();
  }
  function saveSettings() { if (waiting.isOwner.value) waiting.updateSettings(); }
  function sendChat(text = draft.value) {
    const content = text.trim();
    if (!content || content.length > 24) return;
    if (sendMsg('SEND_CHAT', content)) {
      draft.value = ''; close();
      const seat = [...shell.value.querySelectorAll('.seat[data-user-id]')].find(node => node.dataset.userId === waiting.userId.value);
      const anchor = seat?.querySelector('.avatar-frame') || shell.value.querySelector('.self-avatar');
      const rect = anchor?.getBoundingClientRect(), bounds = shell.value.getBoundingClientRect();
      if (rect && (rect.top < bounds.top+80 || rect.bottom > bounds.bottom-80)) anchor.scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});
    }
  }
  function leave() { close(); waiting.returnToLobby(); }
  function kick() { waiting.kickPlayer(selectedUserId.value); close(); }
  function position() {
    frame = null;
    const root = shell.value;
    if (!root) return;
    for (const balloon of root.querySelectorAll('[data-bubble-user]')) {
      const item = speech.value[balloon.dataset.bubbleUser];
      if (item) Object.assign(item, positionSpeech(root,balloon,item.userId) || { visible: false });
    }
  }
  function schedulePosition() { if (!frame) frame = requestAnimationFrame(position); }
  async function showSpeech(userId, text, emoji = false) {
    clearTimeout(timers.get(userId));
    entered.value = false;
    const item = { userId, text, emoji, key: ++sequence, path: '', style: {}, width: 1, height: 1, visible: true, animate: false };
    speech.value[userId] = item;
    await nextTick();
    if (!shell.value || speech.value[userId]?.key !== item.key) return;
    position();
    speech.value[userId].animate = true;
    timers.set(userId,setTimeout(() => { delete speech.value[userId]; timers.delete(userId); },4200));
  }
  watch(roomChatMessages, messages => {
    const message = messages.at(-1);
    if (message) showSpeech(message.userId,message.text);
  });
  watch(() => ({ ...activeEmojis.value }), (current, previous) => {
    for (const [id,emoji] of Object.entries(current)) if (typeof emoji === 'string' && /^[\w-]+\.png$/.test(emoji) && emoji !== previous?.[id]) showSpeech(id,emoji,true);
  });
  watch(waiting.displayPlayers, (players,previous) => {
    nextTick(() => {
      schedulePosition();
      if (reduced.matches || !previous?.length || !shell.value) return;
      for (const player of players) {
        const before = previous.find(candidate => candidate.userId === player.userId);
        const node = [...shell.value.querySelectorAll('.seat')].find(seat => seat.dataset.userId === player.userId);
        const target = !before ? node?.querySelector('.avatar-frame') : !ready(before) && ready(player) ? node?.querySelector('.ready-mark') : null;
        target?.animate([{scale:1.3,opacity:.3},{scale:1,opacity:1}],{duration:300,easing:'cubic-bezier(.19,.8,.22,1)'});
      }
    });
  });
  watch(settingsOpen, value => { if (value) close(); });
  onMounted(() => {
    entered.value = true; entryTimer = setTimeout(() => { entered.value = false; },1000);
    resizeObserver = new ResizeObserver(schedulePosition); resizeObserver.observe(shell.value);
    window.addEventListener('resize',schedulePosition,{ passive: true });
  });
  onUnmounted(() => {
    close(); waiting.closeInviteModal();
    resizeObserver?.disconnect(); cancelAnimationFrame(frame);
    clearTimeout(entryTimer);
    for (const timer of timers.values()) clearTimeout(timer);
    window.removeEventListener('resize',schedulePosition);
  });
  return {
    ...waiting, authUser, isConnected, isReconnecting, socialNotificationCount, dialogName, selectedPlayer, selectedSpectator, selectedUserId,
    canManageSelected, cardPlayPaused, primaryLabel, readiness, mode, ownAvatar, canStart, entered,
    draft, speech, roomChatMessages, ready, nameFor, open, close, onClose, dismiss, selectSeat, addAi, primary, saveSettings,
    sendChat, leave, kick, openAccount: () => openProfilePanel('profile'),
  };
}
