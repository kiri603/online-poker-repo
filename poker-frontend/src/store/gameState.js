// src/store/gameState.js
import { ref, computed } from "vue";

// ==========================================
// 1. 基础网络与联机大厅状态
// ==========================================
export const ws = ref(null);
export const isConnected = ref(false);
export const roomId = ref("101");
export const userId = ref("");
export const isPrivate = ref(false);
export const roomPassword = ref("");
export const publicRooms = ref([]);

// ==========================================
// 2. 游戏对局核心状态
// ==========================================
export const gameStarted = ref(false);
export const ownerId = ref("");
export const isReady = ref(false);
export const myStatus = ref(""); // 记录我在游戏中的实时状态
export const currentTurn = ref("");
export const lastPlayPlayer = ref("");
export const winner = ref("");

// ====== 【新增：借刀杀人状态】 ======
export const jdsrTarget = ref(null);
export const jdsrInitiator = ref(null);

export const handCards = ref([]);
export const tableCards = ref([]);
export const winningCards = ref([]);
export const otherPlayers = ref([]);
export const spectators = ref([]);

// ==========================================
// 3. 房间高级设置
// ==========================================
export const showSettings = ref(false);
export const roomSettings = ref({
  enableWildcard: false,
  enableScrollCards: false,
  enableSkills: false,
});

// ==========================================
// 4. 倒计时与 AOE (锦囊牌) 系统状态
// ==========================================
export const countdown = ref(20);
export const currentAoeType = ref(null);
export const pendingAoePlayers = ref([]);
export const aoeStartTime = ref(0);
export const aoeInitiator = ref("");
export const luanjianInitiator = ref("");
export const aoeAnimCards = ref([]);

export const serverTimeOffset = ref(0);
export const currentTurnStartTime = ref(0);
export const showSkillSelection = ref(false);
export const mySkill = ref("ZHIHENG");
export const showGuanxingModal = ref(false);
export const guanxingCards = ref([]);
export const selectedGuanxingCards = ref([]);

// ==========================================
// 5. UI 与特效弹窗状态
// ==========================================
export const errorMessage = ref("");
export const showRules = ref(true);
export const showUpdates = ref(true);
export const showRuleDetail = ref(false);
export const showCreateModal = ref(false);

export const showEmojiPanel = ref(false);
export const activeEmojis = ref({});
export const activeActionTexts = ref({});
export const isSoundOn = ref(true);
export const isShuffling = ref(false);
export const warningUserId = ref("");
// ====== 【新增：技能倒计时相关】 ======
export const skillCountdown = ref(20);
export const skillTimer = ref(null);
// 表情包静态列表
export const emojiList = ref([
  "image_emoticon.png",
  "image_emoticon2.png",
  "image_emoticon3.png",
  "image_emoticon6.png",
  "image_emoticon9.png",
  "image_emoticon10.png",
  "image_emoticon15.png",
  "image_emoticon16.png",
  "image_emoticon17.png",
  "image_emoticon22.png",
  "image_emoticon23.png",
  "image_emoticon24.png",
  "image_emoticon27.png",
  "image_emoticon28.png",
  "image_emoticon33.png",
  "image_emoticon34.png",
  "image_emoticon35.png",
  "image_emoticon36.png",
  "image_emoticon73.png",
  "image_emoticon88.png",
]);
export const aliEmojiList = ref(["icon-shengqi"]);

// ==========================================
// 6. 全局计算属性 (Computed)
// ==========================================

// 判断是否为经典模式
export const isClassicMode = computed(
  () =>
    !roomSettings.value.enableWildcard && !roomSettings.value.enableScrollCards,
);

// 判断我是否是旁观者
export const isSpectator = computed(() =>
  spectators.value.includes(userId.value),
);

// 将手牌按权重从小到大排序
export const sortedHandCards = computed(() =>
  [...handCards.value].sort((a, b) => a.weight - b.weight),
);

// 将桌面的牌按权重从小到大排序
export const sortedTableCards = computed(() =>
  [...tableCards.value].sort((a, b) => a.weight - b.weight),
);

// 将结算界面的绝杀牌按权重从小到大排序
export const sortedWinningCards = computed(() =>
  [...winningCards.value].sort((a, b) => a.weight - b.weight),
);

// 过滤出当前被选中的手牌
export const selectedCards = computed(() =>
  handCards.value.filter((card) => card.selected),
);

// 判断其他人是否全都准备好了
export const allReady = computed(
  () =>
    otherPlayers.value.length > 0 && otherPlayers.value.every((p) => p.isReady),
);

// 生成连杀播报文字
export const killText = computed(() => {
  const count = otherPlayers.value.length;
  if (count === 1) return "一破 卧龙出山！";
  if (count === 2) return "双连 一战成名！";
  if (count === 3) return "三连 举世皆惊！";
  return "一破 卧龙出山！";
});

// 判断自己是否在等待响应锦囊的列表中
export const amIPendingAoe = computed(() =>
  pendingAoePlayers.value.includes(userId.value),
);

// 智能判断是否有合法的牌可以响应当前的锦囊
export const hasValidAoeCard = computed(() => {
  if (!currentAoeType.value || !amIPendingAoe.value) return true;
  if (currentAoeType.value === "GUANXING" || currentAoeType.value === "WGFD")
    return true;
  if (currentAoeType.value === "NMRQ") {
    // 南蛮：检查是否有红桃、方块或大王
    return handCards.value.some(
      (c) =>
        c.suit === "♥" ||
        c.suit === "♦" ||
        (c.suit === "JOKER" && c.rank === "大王"),
    );
  } else if (currentAoeType.value === "WJQF") {
    // 万箭：检查是否有黑桃、梅花或小王
    return handCards.value.some(
      (c) =>
        c.suit === "♠" ||
        c.suit === "♣" ||
        (c.suit === "JOKER" && c.rank === "小王"),
    );
  }
  return true;
});
// 判断手里是否只剩下锦囊牌（用于解开死锁）
export const onlyHasScrolls = computed(() => {
  return (
    handCards.value.length > 0 &&
    handCards.value.every((c) => c.suit === "SCROLL")
  );
});
export const showWgfdModal = ref(false);
export const wgfdCards = ref([]);
export const selectedWgfdCard = ref([]);
