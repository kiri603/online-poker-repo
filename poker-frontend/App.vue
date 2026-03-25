<template>
  <div class="game-container">
    <button
      v-if="!isConnected"
      class="rule-toggle-btn"
      @click="showRules = true"
    >
      📜 游戏规则
    </button>
    <transition name="float-text">
      <div v-if="errorMessage" class="error-toast">⚠️ {{ errorMessage }}</div>
    </transition>

    <div v-if="showRules" class="rules-modal" @click="showRules = false">
      <div class="rules-content" @click.stop>
        <h2>核心规则玩法</h2>
        <ul>
          <li>
            <strong>发牌与出牌：</strong>开局每人获得 8
            张手牌，由系统随机指定一名玩家先出，随后顺时针轮流。牌型大小依据经典“斗地主”规则。
          </li>
          <li>
            <strong>技能【制衡】：</strong
            >在你的出牌回合，你可以选择“制衡”（弃置 1 张手牌，并重新摸 1
            张），每回合限用 1 次。
          </li>
          <li>
            <strong>过牌惩罚：</strong
            >如果没有牌大过上家，或者主动选择“要不起”，将被惩罚
            <strong>需要摸 2 张牌</strong>。
          </li>
          <li>
            <strong>胜负判定：</strong> <br />🏆
            <strong>获胜：</strong>最先出光所有手牌即可直接获胜！ <br />❌
            <strong>淘汰：</strong>手牌数量
            <strong>超过 14 张</strong
            >，将直接被淘汰。场上其余玩家全被淘汰时，最后存活者“直接获胜”。
          </li>
        </ul>
        <button class="close-rule-btn" @click="showRules = false">
          我知道了
        </button>
      </div>
    </div>
    <button
      v-if="!isConnected"
      class="update-toggle-btn"
      @click="showUpdates = true"
    >
      📢 更新公告
    </button>

    <div v-if="showUpdates" class="rules-modal" @click="showUpdates = false">
      <div class="rules-content" @click.stop>
        <h2>最新更新内容</h2>
        <ul>
          <li>
            <strong>📜 锦囊牌模式：</strong><br />
            新增锦囊卡【南蛮入侵】与【万箭齐发】,可在房间设置中启用！
          </li>
          <li>
            <strong>✨ 体验升级：</strong><br />
            新增剩余手牌提示; 优化了发生错误时的提示界面;
          </li>
          <li>
            <strong>bug修复:</strong><br />
            修复了倒计时系统异常bug; 修复了无法正确洗牌bug;
          </li>
          <li>游戏bug反馈以及建议途径<br />游戏测试群QQ：1082246463</li>
        </ul>
        <button class="close-rule-btn" @click="showUpdates = false">
          我已知道
        </button>
      </div>
    </div>
    <div v-if="!isConnected" class="lobby-wrapper">
      <div class="login-screen">
        <h1 class="art-title">联机大厅</h1>
        <input v-model="roomId" placeholder="请输入房间号 (如 101)" />
        <input
          v-model="userId"
          placeholder="请输入你的昵称"
          @keyup.enter="connectWebSocket"
        />

        <div class="private-checkbox">
          <label
            ><input type="checkbox" v-model="isPrivate" /> 设为私密房间</label
          >
        </div>
        <input
          v-if="isPrivate"
          v-model="roomPassword"
          type="password"
          placeholder="设置4位数字密码"
          maxlength="4"
        />

        <button @click="connectWebSocket">加入 / 创建房间</button>
      </div>

      <div class="room-list-panel">
        <h3>当前公开房间 (点击加入)</h3>
        <div v-if="publicRooms.length === 0" class="empty-rooms">
          暂无公开房间
        </div>
        <div
          v-for="room in publicRooms"
          :key="room.roomId"
          class="room-item"
          @click="quickJoin(room.roomId)"
        >
          <div class="room-info">
            房间号: <strong>{{ room.roomId }}</strong>
          </div>
          <div class="room-stats">
            <span>👫 {{ room.playerCount }}/4</span>
            <span
              :class="[
                'room-status',
                room.status === 'PLAYING' ? 'playing' : 'waiting',
              ]"
            >
              {{ room.status === "PLAYING" ? "对战中" : "准备中" }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="game-table">
      <div class="header">
        <span>房间号: {{ roomId }}</span>
        <span>我的ID: {{ userId }}</span>
      </div>

      <div v-if="!gameStarted" class="waiting-room">
        <div class="top-right-settings">
          <button
            class="settings-btn small"
            @click="showSettings = !showSettings"
          >
            ⚙️ {{ showSettings ? "收起设置" : "房间设置" }}
          </button>

          <div v-if="showSettings" class="settings-panel">
            <h3
              style="
                margin-top: 0;
                color: #f1c40f;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                padding-bottom: 10px;
                font-size: 16px;
              "
            >
              房间高级设置
            </h3>

            <div class="settings-list mini">
              <label class="setting-item">
                <span>🀄 经典场 (默认规则)</span>
                <input type="checkbox" :checked="isClassicMode" disabled />
              </label>

              <label class="setting-item disabled-item">
                <span>🃏 启用赖子牌 (开发中)</span>
                <input
                  type="checkbox"
                  v-model="roomSettings.enableWildcard"
                  disabled
                />
              </label>
              <label class="setting-item">
                <span>📜 启用锦囊牌</span>
                <input
                  type="checkbox"
                  v-model="roomSettings.enableScrollCards"
                  :disabled="ownerId !== userId"
                  @change="handleScrollCardsChange"
                />
              </label>
            </div>

            <p
              v-if="ownerId !== userId"
              class="hint-text"
              style="color: #e74c3c; font-size: 12px; margin-top: 15px"
            >
              （仅房主可修改设置）
            </p>
          </div>
        </div>
        <h2 class="art-subtitle">等待大厅</h2>

        <div v-if="ownerId !== userId && !isReady" class="please-ready-hint">
          ⚠️ 还在等什么？请准备！
        </div>

        <div class="players-list">
          <h3>已就绪玩家 ({{ otherPlayers.length + 1 }}/4)</h3>
          <div class="player-tags">
            <span class="tag me">
              {{ userId }} (你)
              <span class="status-badge">{{
                ownerId === userId
                  ? "👑房主"
                  : isReady
                    ? "✅已准备"
                    : "❌未准备"
              }}</span>
            </span>
            <span class="tag" v-for="p in otherPlayers" :key="p.userId">
              {{ p.userId }}
              <span class="status-badge">{{
                ownerId === p.userId
                  ? "👑房主"
                  : p.isReady
                    ? "✅已准备"
                    : "❌未准备"
              }}</span>

              <button
                class="kick-btn"
                v-if="ownerId === userId"
                @click="kickPlayer(p.userId)"
              >
                踢出
              </button>
            </span>
          </div>
        </div>

        <div class="waiting-actions">
          <template v-if="ownerId === userId">
            <button
              class="start-btn"
              @click="startGame"
              :disabled="otherPlayers.length === 0 || !allReady"
            >
              {{
                otherPlayers.length === 0
                  ? "需要至少2人"
                  : !allReady
                    ? "等待其他玩家准备"
                    : "开始游戏"
              }}
            </button>
          </template>
          <template v-else>
            <button
              class="ready-btn"
              @click="toggleReady"
              :class="{ 'is-ready': isReady }"
            >
              {{ isReady ? "取消准备" : "准备" }}
            </button>
          </template>

          <button class="return-btn" @click="returnToLobby">
            返回修改信息
          </button>
        </div>
      </div>

      <template v-else>
        <div class="other-players-container" v-if="otherPlayers.length > 0">
          <div
            v-for="player in otherPlayers"
            :key="player.userId"
            class="other-player"
            :class="{ 'is-turn': currentTurn === player.userId }"
          >
            <transition name="float-text">
              <div
                v-if="activeActionTexts[player.userId]"
                :key="activeActionTexts[player.userId].id"
                class="floating-action-text"
                :class="activeActionTexts[player.userId].type"
              >
                {{ activeActionTexts[player.userId].text }}
              </div>
            </transition>
            <div class="player-name">
              {{ player.userId }}
              <span v-if="currentTurn === player.userId" class="turn-badge"
                >思考中... ({{ countdown }}s)</span
              >
              <span v-if="player.status === 'WON'">🏆获胜</span>
              <span v-if="player.status === 'LOST'">❌淘汰</span>
              <div
                v-if="activeEmojis[player.userId]"
                class="emoji-bubble other"
              >
                <img :src="`/images/emojis/${activeEmojis[player.userId]}`" />
              </div>
            </div>
            <div class="card-backs">
              <img
                v-for="n in player.cardCount"
                :key="n"
                src="/images/Background.png"
                class="card-back"
              />
            </div>
            <div class="card-count-text">剩余: {{ player.cardCount }} 张</div>
          </div>
        </div>

        <div class="table-center">
          <div v-if="currentAoeType" class="played-cards aoe-table-display">
            <p class="table-hint" style="color: #e74c3c">{{ aoeInitiator }}:</p>
            <div class="card-display-row">
              <div class="card mini aoe-pulse">
                <img
                  :src="
                    getCardImageUrl({ suit: 'SCROLL', rank: currentAoeType })
                  "
                  @error="handleImageError"
                />
              </div>
            </div>
          </div>

          <div v-else-if="tableCards.length > 0" class="played-cards">
            <p class="table-hint">上一手出牌 ({{ lastPlayPlayer }}):</p>
            <div class="card-display-row">
              <div
                v-for="(card, index) in sortedTableCards"
                :key="index"
                class="card mini"
              >
                <img
                  :src="getCardImageUrl(card)"
                  :alt="card.suit + card.rank"
                  @error="handleImageError"
                />
                <span class="fallback-text"
                  >{{ card.suit }}{{ card.rank }}</span
                >
              </div>
            </div>
          </div>

          <div v-else class="empty-table">等待出牌...</div>
        </div>

        <div v-if="isSpectator || myStatus === 'LOST'" class="spectator-hint">
          👁️ 你正在旁观当前对局...
        </div>
        <div class="action-bar" v-else-if="handCards.length > 0">
          <template v-if="currentAoeType">
            <div v-if="amIPendingAoe" class="aoe-action-bar">
              <div class="countdown-timer" :class="{ hurry: countdown <= 3 }">
                ⏰ {{ countdown }}s
              </div>
              <span class="aoe-hint"
                >请弃置:
                {{ currentAoeType === "NMRQ" ? "红色牌" : "黑色牌" }}</span
              >
              <button @click="respondAoe(null)" class="pass-btn">要不起</button>
              <button
                @click="discardAoe"
                class="play-btn"
                :disabled="selectedCards.length !== 1"
              >
                弃牌
              </button>
            </div>
            <div v-else class="wait-text">
              ⏳ 正在等待他人响应
              {{ currentAoeType === "NMRQ" ? "南蛮入侵" : "万箭齐发" }}...
            </div>
          </template>

          <template v-else>
            <div v-if="currentTurn !== userId" class="wait-text">
              ⏳ 正在等待 {{ currentTurn }} 行动...
            </div>
            <template v-else>
              <div class="countdown-timer" :class="{ hurry: countdown <= 5 }">
                ⏰ {{ countdown }}s
              </div>
              <button
                @click="replaceCard"
                :disabled="selectedCards.length !== 1"
              >
                制衡
              </button>
              <button
                @click="passTurn"
                class="pass-btn"
                :disabled="tableCards.length === 0"
              >
                {{ tableCards.length === 0 ? "必须出牌" : "要不起" }}
              </button>
              <button
                @click="playCards"
                class="play-btn"
                :disabled="selectedCards.length === 0"
              >
                出牌
              </button>
            </template>
          </template>
        </div>

        <div class="aoe-anim-layer">
          <div
            v-for="anim in aoeAnimCards"
            :key="anim.id"
            class="aoe-anim-card"
            :class="{
              'from-me': anim.userId === userId,
              'from-other': anim.userId !== userId,
            }"
          >
            <img
              v-if="anim.userId === userId"
              :src="getCardImageUrl(anim.card)"
            />
            <img v-else src="/images/Background.png" />
          </div>
        </div>

        <div class="hand-cards-container">
          <div
            v-for="(card, index) in sortedHandCards"
            :key="card.suit + card.rank + index"
            class="card"
            :class="{ selected: card.selected }"
            @click="toggleSelect(card)"
            :style="{ zIndex: index }"
          >
            <img
              :src="getCardImageUrl(card)"
              :alt="card.suit + card.rank"
              @error="handleImageError"
            />
            <span class="fallback-text">{{ card.suit }}{{ card.rank }}</span>
          </div>
          <transition name="float-text">
            <div
              v-if="activeActionTexts[userId]"
              :key="activeActionTexts[userId].id"
              class="floating-action-text my-float-text"
              :class="activeActionTexts[userId].type"
            >
              {{ activeActionTexts[userId].text }}
            </div>
          </transition>
          <div v-if="activeEmojis[userId]" class="emoji-bubble me">
            <img :src="`/images/emojis/${activeEmojis[userId]}`" />
          </div>

          <div class="my-card-count-vertical">
            <span>剩</span>
            <span>余</span>
            <span class="num">{{ handCards.length }}</span>
            <span>张</span>
          </div>
        </div>

        <div class="emoji-sidebar" v-if="gameStarted">
          <div class="emoji-panel" v-show="showEmojiPanel">
            <div
              class="emoji-item"
              v-for="emoji in emojiList"
              :key="emoji"
              @click="sendEmoji(emoji)"
            >
              <img
                :src="`/images/emojis/${emoji}`"
                alt="emoji"
                @error="handleImageError"
              />
            </div>
          </div>
          <button class="emoji-toggle-btn" @click="toggleEmojiPanel">
            <svg class="icon" aria-hidden="true" style="font-size: 28px">
              <use xlink:href="#icon-shengqi"></use>
            </svg>
          </button>
        </div>
        <button @click="exitGame" class="exit-btn">退出房间</button>

        <div v-if="winner" class="game-over-modal">
          <div class="modal-content">
            <h2 class="bounce-text">🎉 游戏结束 🎉</h2>
            <p class="winner-text">
              本局首名产生：<span>{{ winner }}</span>
            </p>
            <div
              v-if="winningCards && winningCards.length > 0"
              class="winning-display"
            >
              <p class="kill-text">{{ killText }}</p>
              <div
                class="card-display-row"
                style="justify-content: center; transform: scale(0.9)"
              >
                <div
                  v-for="(card, index) in sortedWinningCards"
                  :key="index"
                  class="card mini"
                >
                  <img :src="getCardImageUrl(card)" @error="handleImageError" />
                  <span class="fallback-text"
                    >{{ card.suit }}{{ card.rank }}</span
                  >
                </div>
              </div>
            </div>
            <button @click="returnToRoom" class="return-room-btn">
              返回房间准备
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";

const roomId = ref("101");
const userId = ref("");
const isConnected = ref(false);
const gameStarted = ref(false);
const ws = ref(null);

const isPrivate = ref(false);
const roomPassword = ref("");
const publicRooms = ref([]);
const myStatus = ref(""); // 记录我在游戏中的实时状态
let roomTimer = null;

const showRules = ref(true);
const showUpdates = ref(false);
// ====== 新增：非阻塞全局错误提示 ======
const errorMessage = ref("");
let errorTimeout = null;
const showError = (msg) => {
  errorMessage.value = msg;
  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorMessage.value = "";
  }, 3000);
};

// ====== 新增：房间设置与胜负卡牌 ======
const showSettings = ref(false);
const winningCards = ref([]);
// 高度可扩展的设置，后续加新功能只需往里加字段
const roomSettings = ref({
  enableWildcard: false,
  enableScrollCards: false,
});

const isClassicMode = computed(
  () =>
    !roomSettings.value.enableWildcard && !roomSettings.value.enableScrollCards,
);
const updateSettings = () => {
  if (ownerId.value === userId.value)
    sendMsg("UPDATE_SETTINGS", roomSettings.value);
};
const handleScrollCardsChange = () => {
  if (roomSettings.value.enableScrollCards) {
    alert("牌堆将额外加入两张【南蛮入侵】和两张【万箭齐发】");
  }
  updateSettings();
};

const fetchRooms = async () => {
  if (isConnected.value) return; // 进了房间就不用再刷大厅了
  try {
    // 【注意】上线时请把 localhost 改为你的服务器公网 IP，例如 http://39.102.60.181:8080/api/rooms
    const res = await fetch("http://39.102.60.181:8080/api/rooms");
    //const res = await fetch("http://localhost:8080/api/rooms");
    publicRooms.value = await res.json();
  } catch (e) {}
};
onMounted(() => {
  fetchRooms();
  roomTimer = setInterval(fetchRooms, 3000); // 每 3 秒刷新一次大厅
});
onUnmounted(() => clearInterval(roomTimer));
const quickJoin = (id) => {
  roomId.value = id;
  isPrivate.value = false; // 公开房间必然没密码
  roomPassword.value = "";
  // 提醒输入名字
  if (!userId.value) {
    alert("请先输入你的昵称！");
  } else {
    // 【修复】：填好房间号后，直接自动调用加入方法！
    connectWebSocket();
  }
};
const kickPlayer = (targetId) => {
  if (confirm(`确定要踢出玩家 ${targetId} 吗？`)) {
    sendMsg("KICK_PLAYER", targetId);
  }
};
// ====== 新增：表情包系统数据 ======
const showEmojiPanel = ref(false);
// 扩展表情：你只需把图片丢到前端 public/images/emojis/ 目录下，在这里加上文件名即可
const emojiList = ref([
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
const activeEmojis = ref({}); // 记录谁正在发表情 { userId: '1.png' }
const emojiTimeouts = {}; // 记录表情消失的定时器
// 改成你在 Iconfont 里的图标代号
const aliEmojiList = ref(["icon-shengqi"]);

const activeActionTexts = ref({});
const actionTextTimeouts = {};

const showActionText = (targetUserId, text, type = "skill") => {
  // 使用 Date.now() 作为 key，确保连续触发相同文字也能重置动画
  activeActionTexts.value[targetUserId] = { text, type, id: Date.now() };

  if (actionTextTimeouts[targetUserId])
    clearTimeout(actionTextTimeouts[targetUserId]);

  // 1.5 秒后自动清除状态
  actionTextTimeouts[targetUserId] = setTimeout(() => {
    delete activeActionTexts.value[targetUserId];
  }, 1500);
};

const handCards = ref([]);
const tableCards = ref([]);
const lastPlayPlayer = ref("");
const currentTurn = ref("");
const otherPlayers = ref([]);
const spectators = ref([]);

// 新增房间状态数据
const ownerId = ref("");
const winner = ref("");
const isReady = ref(false);

const isSpectator = computed(() => spectators.value.includes(userId.value));
const sortedHandCards = computed(() =>
  [...handCards.value].sort((a, b) => a.weight - b.weight),
);
// 【新增】：将桌面的牌按权重从小到大排序 (左到右)
const sortedTableCards = computed(() =>
  [...tableCards.value].sort((a, b) => a.weight - b.weight),
);
// ===== 【新增下面这行】 =====
// 将结算界面的绝杀牌也按权重从小到大排序
const sortedWinningCards = computed(() =>
  [...winningCards.value].sort((a, b) => a.weight - b.weight),
);
const selectedCards = computed(() =>
  handCards.value.filter((card) => card.selected),
);

// 判断其他人是否全都准备好了
const allReady = computed(
  () =>
    otherPlayers.value.length > 0 && otherPlayers.value.every((p) => p.isReady),
);
const killText = computed(() => {
  const count = otherPlayers.value.length;
  if (count === 1) return "一破 卧龙出山！";
  if (count === 2) return "双连 一战成名！";
  if (count === 3) return "三连 举世皆惊！";
  return "一破 卧龙出山！"; // 默认兜底
});
const aoeInitiator = ref(""); // 记录是谁打出了锦囊
// ====== 新增：服务器级绝对同步倒计时系统 ======
const countdown = ref(20);
const currentAoeType = ref(null);
const pendingAoePlayers = ref([]);
const aoeStartTime = ref(0);
const amIPendingAoe = computed(() =>
  pendingAoePlayers.value.includes(userId.value),
);
const aoeAnimCards = ref([]); // 弃牌动画列队
const serverTimeOffset = ref(0); // 记录本地与服务器的时间差
const currentTurnStartTime = ref(0); // 记录当前回合的开始时间
let globalTimer = null;
let isTimeoutTriggered = false;

onMounted(() => {
  fetchRooms();
  roomTimer = setInterval(fetchRooms, 3000);

  // 全局倒计时驱动器升级（兼容 AOE 模式）
  globalTimer = setInterval(() => {
    if (gameStarted.value) {
      const nowServerTime = Date.now() - serverTimeOffset.value;

      // 模式A：正在进行锦囊牌结算
      if (currentAoeType.value && amIPendingAoe.value && aoeStartTime.value) {
        const elapsedSeconds = Math.floor(
          (nowServerTime - aoeStartTime.value) / 1000,
        );
        let remain = 10 - elapsedSeconds; // 锦囊回合 10 秒
        if (remain < 0) remain = 0;
        countdown.value = remain;

        if (remain === 0 && !isTimeoutTriggered) {
          isTimeoutTriggered = true;
          respondAoe(null); // 超时自动要不起
        }
        if (remain > 0) isTimeoutTriggered = false;
      }
      // 模式B：正常的出牌回合
      else if (
        !currentAoeType.value &&
        currentTurn.value &&
        currentTurnStartTime.value
      ) {
        const elapsedSeconds = Math.floor(
          (nowServerTime - currentTurnStartTime.value) / 1000,
        );
        let remain = 20 - elapsedSeconds; // 普通回合 20 秒
        if (remain < 0) remain = 0;
        countdown.value = remain;

        if (
          remain === 0 &&
          currentTurn.value === userId.value &&
          !isTimeoutTriggered
        ) {
          isTimeoutTriggered = true;
          handleTimeout();
        }
        if (remain > 0) isTimeoutTriggered = false;
      }
    }
  }, 500);
});

onUnmounted(() => {
  clearInterval(roomTimer);
  if (globalTimer) clearInterval(globalTimer);
});

// 超时自动托管
const handleTimeout = () => {
  if (tableCards.value.length === 0) {
    // 桌面没牌（自由出牌阶段），系统强行帮你出最小的一张单牌
    let cardToPlay = sortedHandCards.value.find((c) => c.suit !== "SCROLL");
    if (sortedHandCards.value.length > 0) {
      const smallestCard = sortedHandCards.value[0];
      sendMsg("PLAY_CARD", [
        {
          suit: smallestCard.suit,
          rank: smallestCard.rank,
          weight: smallestCard.weight,
        },
      ]);
    }
  } else {
    // 桌上有牌，直接自动要不起
    passTurn();
  }
};

const getCardImageUrl = (card) => {
  if (card.suit === "SCROLL") return `/images/${card.rank}.png`; // 直接映射 NMRQ.png 和 WJQF.png
  if (card.suit === "JOKER") {
    return card.rank === "小王"
      ? `/images/JokerSmall.png`
      : `/images/JokerBig.png`;
  }
  const suitMap = { "♠": "Spade", "♥": "Heart", "♣": "Club", "♦": "Diamond" };
  return `/images/${suitMap[card.suit]}${card.rank}.png`;
};

const handleImageError = (e) => {
  e.target.style.display = "none";
};

const toggleSelect = (card) => {
  if (currentTurn.value === userId.value || amIPendingAoe.value) {
    card.selected = !card.selected;
  }
};
const toggleEmojiPanel = () => {
  showEmojiPanel.value = !showEmojiPanel.value;
};
const sendEmoji = (emoji) => {
  sendMsg("SEND_EMOJI", emoji);
  showEmojiPanel.value = false; // 发完自动收起面板
};
const connectWebSocket = () => {
  if (!roomId.value || !userId.value) return alert("请输入完整信息");
  if (isPrivate.value && roomPassword.value.length !== 4) {
    return alert("创建私密房间必须设置 4 位密码！");
  }
  // 本地测试请保留 localhost，线上请改为公网 IP
  ws.value = new WebSocket("ws://39.102.60.181:8080/ws/game");
  //ws.value = new WebSocket("ws://localhost:8080/ws/game");

  ws.value.onopen = () => {
    isConnected.value = true;
    // 传给后端私密设置和密码
    sendMsg("JOIN_ROOM", {
      isPrivate: isPrivate.value,
      password: roomPassword.value,
    });
  };

  ws.value.onmessage = (event) => {
    const res = JSON.parse(event.data);

    switch (res.event) {
      case "SYNC_STATE":
        currentTurn.value = res.currentTurn;
        currentAoeType.value = res.currentAoeType;
        if (res.tableCards) tableCards.value = res.tableCards;
        if (res.lastPlayPlayer) lastPlayPlayer.value = res.lastPlayPlayer;
        pendingAoePlayers.value = res.pendingAoePlayers || [];
        aoeInitiator.value = res.aoeInitiator || "";
        if (res.aoeStartTime) aoeStartTime.value = Number(res.aoeStartTime);
        ownerId.value = res.ownerId;
        if (res.serverTime)
          serverTimeOffset.value = Date.now() - Number(res.serverTime);
        if (res.currentTurnStartTime)
          currentTurnStartTime.value = Number(res.currentTurnStartTime);
        otherPlayers.value = res.players.filter(
          (p) => p.userId !== userId.value,
        );
        spectators.value = res.spectators || [];
        if (res.isStarted !== undefined) {
          gameStarted.value = res.isStarted;
        }
        // 解析我自己的准备状态
        const me = res.players.find((p) => p.userId === userId.value);
        if (me) {
          isReady.value = me.isReady;
          myStatus.value = me.status;
        }
        if (res.settings)
          roomSettings.value.enableWildcard =
            res.settings.enableWildcard === true;
        roomSettings.value.enableScrollCards =
          res.settings.enableScrollCards === true;
        break;
      case "AOE_ANIMATION":
        aoeAnimCards.value.push({
          id: Date.now() + Math.random(),
          userId: res.userId,
          card: res.card,
        });
        setTimeout(() => {
          aoeAnimCards.value.shift();
        }, 1000); // 1秒后清除DOM
        break;
      case "KICKED":
        if (res.targetId === userId.value) {
          alert("你已被房主踢出房间！");
          if (ws.value) ws.value.close();
          isConnected.value = false;
        }
        break;
      case "SYNC_HAND":
        handCards.value = res.cards.map((c) => ({ ...c, selected: false }));
        break;

      case "GAME_STARTED":
        gameStarted.value = true;
        winner.value = "";
        tableCards.value = [];
        lastPlayPlayer.value = "";
        break;

      case "CARDS_PLAYED":
        tableCards.value = res.cards;
        lastPlayPlayer.value = res.userId;
        break;

      case "ROUND_RESET":
        tableCards.value = [];
        lastPlayPlayer.value = "";
        break;

      case "GAME_OVER":
        winner.value = res.winner;
        winningCards.value = res.winningCards || [];

        break;

      case "ROOM_RESET":
        // 所有玩家从游戏状态返回到未准备的房间状态
        gameStarted.value = false;
        winner.value = "";
        handCards.value = [];
        tableCards.value = [];
        lastPlayPlayer.value = "";
        currentTurn.value = "";

        break;

      case "GAME_ABORTED":
        alert(res.msg);
        gameStarted.value = false;
        winner.value = "";
        handCards.value = [];
        tableCards.value = [];

        break;
      case "AOE_PLAYED":
        showActionText(res.userId, res.aoeName, "skill");
        break;

      case "ERROR":
        if (res.msg === "REQUIRE_PASSWORD") {
          const pwd = prompt("该房间为私密房间，请输入 4 位密码：");
          if (pwd !== null && pwd.trim() !== "") {
            roomPassword.value = pwd; // 把用户输入的密码存入变量
            connectWebSocket(); // 带着密码自动重新发起连接请求！
          }
        } else {
          // 【核心修复1】：将阻塞线程的 alert 换成无缝提示，防止挂机玩家卡死整个游戏
          showError(res.msg);
          handCards.value.forEach((c) => (c.selected = false));

          // 如果是倒计时触发的自动出牌报错，为了防止卡死在 0s，1.5秒后强制要不起
          if (countdown.value === 0 && isTimeoutTriggered) {
            setTimeout(() => {
              passTurn();
            }, 1500);
          }
        }
        break;
      case "EMOJI_RECEIVED":
        activeEmojis.value[res.userId] = res.emoji;
        // 如果他之前发的表情还没消失，先清除之前的定时器
        if (emojiTimeouts[res.userId]) clearTimeout(emojiTimeouts[res.userId]);
        // 气泡停留 3 秒后自动消失
        emojiTimeouts[res.userId] = setTimeout(() => {
          delete activeEmojis.value[res.userId];
        }, 3000);
        break;
      // 【新增】：监听玩家制衡和要不起的事件
      case "PLAYER_REPLACED":
        // 后续如果有别的技能，直接改文字即可，比如 showActionText(res.userId, "顺手牵羊", "skill")
        showActionText(res.userId, "制衡", "skill");
        break;

      case "PLAYER_PASSED":
        showActionText(res.userId, "要不起", "pass");
        break;
    }
  };

  ws.value.onclose = () => {
    isConnected.value = false;
    gameStarted.value = false;
    winner.value = "";
    handCards.value = [];
    tableCards.value = [];
    otherPlayers.value = [];
    roomSettings.value = {
      enableWildcard: false,
      enableScrollCards: false,
    };
  };
};

const sendMsg = (type, data) => {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(
      JSON.stringify({
        type,
        roomId: roomId.value,
        userId: userId.value,
        data,
      }),
    );
  }
};
// ====== 【新增】：智能判断是否有牌可以响应锦囊 ======
const hasValidAoeCard = computed(() => {
  if (!currentAoeType.value || !amIPendingAoe.value) return true;

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

// ====== 【新增】：监听锦囊状态，无牌时自动要不起 ======
watch([currentAoeType, amIPendingAoe], ([newAoe, newPending]) => {
  // 如果进入了锦囊阶段，且轮到我响应，并且我没有合法的牌可以丢
  if (newAoe && newPending && !hasValidAoeCard.value) {
    // 延迟 1.5 秒自动发给后端，留出时间让玩家看清对方打出了什么锦囊
    setTimeout(() => {
      // 再次确认状态没变（防止这 1.5 秒内游戏被中断）
      if (currentAoeType.value === newAoe && amIPendingAoe.value) {
        respondAoe(null);
      }
    }, 1500);
  }
});
// AOE 响应逻辑 (带严格本地校验)
const respondAoe = (card) => {
  if (card) {
    if (currentAoeType.value === "NMRQ") {
      const isRed = card.suit === "♥" || card.suit === "♦";
      const isBigJoker = card.suit === "JOKER" && card.rank === "大王";
      if (!isRed && !isBigJoker)
        return alert("南蛮入侵：必须弃置一张红色花色卡牌或大王！");
    } else if (currentAoeType.value === "WJQF") {
      const isBlack = card.suit === "♠" || card.suit === "♣";
      const isSmallJoker = card.suit === "JOKER" && card.rank === "小王";
      if (!isBlack && !isSmallJoker)
        return alert("万箭齐发：必须弃置一张黑色花色卡牌或小王！");
    }
    sendMsg("RESPOND_AOE", {
      suit: card.suit,
      rank: card.rank,
      weight: card.weight,
    });
  } else {
    sendMsg("RESPOND_AOE", null);
  }
};
const discardAoe = () => respondAoe(selectedCards.value[0]);

const startGame = () => sendMsg("START_GAME", null);
const toggleReady = () => sendMsg("READY", null);
const returnToRoom = () => sendMsg("RETURN_TO_ROOM", null);

const passTurn = () => sendMsg("PASS", null);
const playCards = () =>
  sendMsg(
    "PLAY_CARD",
    selectedCards.value.map((c) => ({
      suit: c.suit,
      rank: c.rank,
      weight: c.weight,
    })),
  );
const replaceCard = () =>
  sendMsg("REPLACE_CARD", {
    suit: selectedCards.value[0].suit,
    rank: selectedCards.value[0].rank,
    weight: selectedCards.value[0].weight,
  });

const exitGame = () => {
  if (confirm("确定要退出当前房间吗？(游戏中退出会导致对局中止)")) {
    if (ws.value) ws.value.close();
  }
};
const returnToLobby = () => {
  if (ws.value) ws.value.close();
};
</script>
<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  max-width: none !important; /* 强制取消 1280px 的最大宽度限制 */
  overflow: hidden; /* 防止出现多余的滚动条 */
}
</style>
<style scoped>
/* 原有的样式完全保留 */
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
/* ====== 艺术字与醒目标题样式 ====== */

/* 联机大厅：白色主色，蓝色发光特效，放大字号，增加字间距 */
.art-title {
  color: #f5f2f2;
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 8px;
  text-align: center;
  margin-bottom: 25px;
  font-family:
    "Microsoft YaHei", "YouYuan", sans-serif; /* 尽量调用圆润或厚重的系统字体 */
  text-shadow:
    0 0 10px rgba(255, 255, 255, 0.8),
    0 0 20px #3498db,
    0 0 30px #2980b9,
    0 0 40px #3498db;
}

/* 等待大厅：放大字体，白色主色，橙色发光投影以区分层级 */
.art-subtitle {
  color: #ffffff;
  font-size: 42px;
  font-weight: bold;
  letter-spacing: 4px;
  margin-bottom: 10px;
  text-shadow:
    2px 2px 4px rgba(0, 0, 0, 0.8),
    0 0 15px #f39c12,
    0 0 25px #e67e22;
}

/* ====== 未准备提示：红色呼吸灯动画 ====== */
.please-ready-hint {
  color: #ff4757;
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 15px;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6);
  animation: pulseFade 0.8s infinite alternate; /* 0.8秒来回交替的呼吸动画 */
}

/* 定义呼吸灯动画的关键帧 */
@keyframes pulseFade {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
    text-shadow: 0 0 5px #ff4757;
  }
  100% {
    transform: scale(1.05);
    opacity: 1;
    text-shadow:
      0 0 20px #ff4757,
      0 0 30px #ff6b81;
  }
}
.login-screen {
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: rgba(0, 0, 0, 0.5);
  padding: 40px;
  border-radius: 10px;
}
.login-screen input,
.login-screen button {
  padding: 10px;
  font-size: 16px;
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

/* 准备状态标签 */
.status-badge {
  font-size: 14px;
  margin-left: 8px;
  color: #f1c40f;
}
.ready-btn {
  padding: 12px 30px;
  background-color: #e67e22;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}
.ready-btn.is-ready {
  background-color: #27ae60;
}

/* 原有大厅样式 */
.waiting-room {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  margin: 20px;
  border-radius: 15px;
  position: relative;
}
.players-list {
  margin: 40px 0;
  text-align: center;
}
.player-tags {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-top: 20px;
}
.tag {
  padding: 10px 20px;
  background-color: #34495e;
  border-radius: 30px;
  font-size: 18px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}
.tag.me {
  background-color: #2980b9;
  font-weight: bold;
  border: 2px solid #3498db;
}
.waiting-actions {
  display: flex;
  gap: 20px;
}
.start-btn {
  padding: 12px 30px;
  background-color: #27ae60;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}
.start-btn:disabled {
  background-color: #7f8c8d;
  cursor: not-allowed;
  opacity: 0.8;
}
.return-btn {
  padding: 12px 30px;
  background-color: #95a5a6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
}

/* 游戏区样式 */
.other-players-container {
  display: flex;
  justify-content: space-around;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.15);
  min-height: 100px;
}
.other-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0.7;
  transition: all 0.3s;
  position: relative;
}
.other-player.is-turn {
  opacity: 1;
  transform: scale(1.05);
}
.player-name {
  font-weight: bold;
  margin-bottom: 5px;
}
.turn-badge {
  color: #f1c40f;
  font-size: 14px;
  margin-left: 5px;
}
.card-count-text {
  font-size: 12px;
  margin-top: 5px;
  color: #bdc3c7;
}
.card-backs {
  display: flex;
  justify-content: center;
}
.card-back {
  width: 35px;
  height: 50px;
  margin-left: -20px;
  border-radius: 3px;
  box-shadow: -1px 0 3px rgba(0, 0, 0, 0.5);
}
.card-back:first-child {
  margin-left: 0;
}
.table-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.table-hint {
  margin-bottom: 10px;
  color: #f39c12;
  font-weight: bold;
}
.card-display-row {
  display: flex;
  gap: 10px;
}
.action-bar {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
  height: 40px;
  align-items: center;
}
.wait-text {
  font-size: 20px;
  font-weight: bold;
  color: #f1c40f;
}
.action-bar button {
  padding: 10px 25px;
  font-size: 18px;
  cursor: pointer;
  border-radius: 5px;
  border: none;
}
.play-btn {
  background-color: #e74c3c;
  color: white;
}
.play-btn:disabled {
  background-color: #7f8c8d;
  cursor: not-allowed;
}
.pass-btn {
  background-color: #3498db;
  color: white;
}
.pass-btn:disabled {
  background-color: #7f8c8d;
  cursor: not-allowed;
  opacity: 0.8;
}
.hand-cards-container {
  display: flex;
  justify-content: center;
  height: 180px;
  margin-bottom: 30px;
  position: relative;
}
.card {
  width: 100px;
  height: 140px;
  background-color: white;
  border-radius: 8px;
  border: 1px solid #ccc;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.2s ease-out;
  margin-left: -60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #333;
  font-size: 24px;
  font-weight: bold;
  overflow: hidden;
  position: relative;
}
.card:first-child {
  margin-left: 0;
}
.card:hover {
  filter: brightness(0.95);
}
.card.selected {
  transform: translateY(-20px);
  border: 2px solid #3498db;
}
.card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
}
.card.mini {
  width: 70px;
  height: 100px;
  margin-left: 0;
  font-size: 18px;
  cursor: default;
}
.exit-btn {
  position: absolute;
  bottom: 20px;
  left: 20px;
  padding: 10px 20px;
  background-color: #c0392b;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}
.spectator-hint {
  text-align: center;
  font-size: 20px;
  color: #2ecc71;
  font-weight: bold;
  margin-bottom: 20px;
}

/* ====== 结算弹窗样式 ====== */
.game-over-modal {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}
.modal-content {
  background: linear-gradient(135deg, #f1c40f, #e67e22);
  padding: 50px 80px;
  border-radius: 15px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: #fff;
}
.bounce-text {
  font-size: 40px;
  margin-bottom: 20px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  animation: bounce 1s infinite alternate;
}
.winner-text {
  font-size: 24px;
  margin-bottom: 40px;
}
.winner-text span {
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  background: #c0392b;
  padding: 5px 15px;
  border-radius: 8px;
  margin-left: 10px;
}
.return-room-btn {
  padding: 15px 40px;
  font-size: 20px;
  background-color: #2ecc71;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition:
    transform 0.2s,
    background-color 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}
.return-room-btn:hover {
  background-color: #27ae60;
  transform: scale(1.05);
}
/* 为其他玩家头像定位做准备 */
.player-name {
  position: relative;
}

/* ====== 表情包侧边栏样式 ====== */
.emoji-sidebar {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  z-index: 100;
}
.emoji-toggle-btn {
  width: 45px;
  height: 45px;
  font-size: 24px;
  background: rgba(255, 255, 255);
  border: 1px solid #7f8c8d;
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);
  transition: background 0.2s;
}
.emoji-toggle-btn:hover {
  background: rgba(52, 152, 219, 0.8);
}

/* ====== 升级版：表情面板样式 ====== */
.emoji-panel {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 15px;
  /* 【关键修改1】：改成 grid 网格布局，实现一行多个 */
  display: grid;
  grid-template-columns: repeat(3, 1fr); /* 一行固定显示 3 个表情 */
  gap: 15px; /* 表情之间的上下左右间距 */

  /* 【关键修改2】：增加宽度，让展示框向左扩大 */
  width: 250px;
  height: 250px;

  /* 开启上下滚动（电脑端鼠标滚轮，手机端手指滑动） */
  overflow-y: auto;
  margin-right: 5px;
  box-shadow: -2px 2px 10px rgba(0, 0, 0, 0.3);
}

/* 隐藏滚动条但保留功能，显得更美观 */
.emoji-panel::-webkit-scrollbar {
  width: 4px;
}
.emoji-panel::-webkit-scrollbar-thumb {
  background: #bdc3c7;
  border-radius: 4px;
}

/* ====== 升级版：单个表情样式 ====== */
.emoji-item {
  /* 【关键修改3】：将表情的点击区域和图片本身变大 */
  width: 60px;
  height: 60px;
  cursor: pointer;
  transition: transform 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}
.emoji-item:hover {
  transform: scale(1.15);
}

.emoji-item img,
.emoji-item svg {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* ====== 聊天气泡公共样式 ====== */
.emoji-bubble {
  position: absolute;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  padding: 5px;
  width: 45px;
  height: 45px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  z-index: 50;
  display: flex; /* 【新增】：让内部图片完美居中 */
  justify-content: center; /* 【新增】 */
  align-items: center; /* 【新增】 */
}
.emoji-bubble img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.emoji-bubble::after {
  content: "";
  position: absolute;
  border-width: 8px;
  border-style: solid;
}

/* 其他玩家气泡 (靠名字右边) */
.emoji-bubble.other {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 15px;
  animation: popOther 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
.emoji-bubble.other::after {
  top: 50%;
  right: 100%;
  margin-top: -8px;
  border-color: transparent rgba(255, 255, 255, 0.95) transparent transparent;
}

/* 我自己的气泡 (手牌正上方) */
.emoji-bubble.me {
  bottom: 100%;
  left: 20%;
  margin-bottom: 10px;
  animation: popMe 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
.emoji-bubble.me::after {
  top: 100%;
  left: 20%;
  margin-left: -8px;
  border-color: rgba(255, 255, 255, 0.95) transparent transparent transparent;
}
/* 新增：阿里 Iconfont SVG 通用样式 */
.icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
}
/* 大厅双栏布局 */
.lobby-wrapper {
  display: flex;
  gap: 30px;
  background: rgba(0, 0, 0, 0.6);
  padding: 40px;
  border-radius: 12px;
  max-width: 800px;
  width: 90%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.login-screen {
  flex: 1;
  background: transparent;
  padding: 0;
  box-shadow: none;
}
.private-checkbox {
  font-size: 16px;
  display: flex;
  align-items: center;
  color: #f1c40f;
  margin-top: 10px;
}
.private-checkbox input {
  margin-right: 8px;
  width: 18px;
  height: 18px;
}

/* 房间滑动列表 */
.room-list-panel {
  width: 300px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
}
.room-list-panel h3 {
  margin-top: 0;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 10px;
}
.empty-rooms {
  text-align: center;
  color: #bdc3c7;
  margin-top: 50px;
}
.room-item {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.room-item:hover {
  background: rgba(52, 152, 219, 0.5);
  transform: translateY(-2px);
}
.room-info {
  font-size: 16px;
  margin-bottom: 5px;
}
.room-stats {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}
.room-status.playing {
  color: #e74c3c;
  font-weight: bold;
}
.room-status.waiting {
  color: #2ecc71;
  font-weight: bold;
}

/* 踢人小按钮 */
.kick-btn {
  background: #c0392b;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  margin-left: 10px;
  cursor: pointer;
}
.kick-btn:hover {
  background: #e74c3c;
}
/* ====== 游戏规则按钮与弹窗样式 ====== */
.rule-toggle-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  padding: 10px 15px;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  z-index: 100;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}
.rule-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.rules-modal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px); /* 磨砂玻璃背景效果 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}

.rules-content {
  background: linear-gradient(135deg, #2c3e50, #34495e);
  padding: 30px 40px;
  border-radius: 12px;
  max-width: 500px;
  width: 85%;
  color: #ecf0f1;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  border: 1px solid #7f8c8d;
  animation: popModal 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.rules-content h2 {
  margin-top: 0;
  text-align: center;
  color: #f1c40f;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 15px;
}

.rules-content ul {
  line-height: 1.8;
  padding-left: 20px;
  font-size: 16px;
}

.rules-content li {
  margin-bottom: 12px;
}

.rules-content strong {
  color: #e74c3c; /* 重点文字标红 */
}

.close-rule-btn {
  display: block;
  width: 100%;
  margin-top: 25px;
  padding: 12px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.2s;
}
.close-rule-btn:hover {
  background: #2ecc71;
}

@keyframes popModal {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
/* ====== 浮动动作文字特效 ====== */
.floating-action-text {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px;
  font-weight: 900;
  z-index: 300;
  pointer-events: none; /* 穿透点击，绝不影响抓牌 */
  white-space: nowrap;
  font-family: "Microsoft YaHei", "YouYuan", sans-serif;
}

/* 针对我自己的位置微调（因为我的手牌很大） */
.floating-action-text.my-float-text {
  top: 30%;
  font-size: 40px;
}

/* 样式一：主动技能色 (金黄色发光) */
.floating-action-text.skill {
  color: #f1c40f;
  text-shadow:
    2px 2px 0 #d35400,
    -1px -1px 0 #d35400,
    1px -1px 0 #d35400,
    -1px 1px 0 #d35400,
    0 0 15px #e67e22;
}

/* 样式二：消极动作色 (灰蓝色冷光) */
.floating-action-text.pass {
  color: #ecf0f1;
  text-shadow:
    2px 2px 0 #7f8c8d,
    -1px -1px 0 #7f8c8d,
    1px -1px 0 #7f8c8d,
    -1px 1px 0 #7f8c8d,
    0 0 10px #bdc3c7;
}

/* 动画效果：进入时放大弹跳，离开时向上飘走淡出 */
.float-text-enter-active {
  animation: floatUpIn 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
.float-text-leave-active {
  animation: floatUpOut 0.5s ease-in forwards;
}
/* 高级设置界面样式 */
.settings-btn {
  padding: 12px 30px;
  background-color: #8e44ad;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}
.settings-btn:hover {
  background-color: #9b59b6;
}
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 20px;
}
.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.2);
  padding: 15px;
  border-radius: 8px;
  font-size: 18px;
}
.setting-item input[type="checkbox"] {
  width: 24px;
  height: 24px;
  cursor: pointer;
}

/* 倒计时样式 */
.countdown-timer {
  font-size: 24px;
  font-weight: bold;
  color: #2ecc71;
  background: rgba(0, 0, 0, 0.4);
  padding: 8px 15px;
  border-radius: 8px;
  border: 2px solid #2ecc71;
  transition: all 0.3s;
}
.countdown-timer.hurry {
  color: #e74c3c;
  border-color: #e74c3c;
  animation: pulseFade 0.5s infinite alternate; /* 借用之前的呼吸灯动画，时间变急促 */
}
/* ====== 右上角设置面板样式 ====== */
.top-right-settings {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.settings-btn.small {
  padding: 8px 15px;
  font-size: 14px;
  background-color: rgba(142, 68, 173, 0.8);
  border-radius: 20px;
}
.settings-panel {
  margin-top: 10px;
  background: rgba(44, 62, 80, 0.95);
  border: 1px solid #7f8c8d;
  border-radius: 8px;
  padding: 15px;
  width: 250px;
  text-align: left;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  animation: slideDown 0.2s ease-out;
}
.settings-list.mini {
  gap: 10px;
  margin-top: 10px;
}
.settings-list.mini .setting-item {
  padding: 10px;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.3);
}

/* 开发中功能的置灰效果 */
.setting-item.disabled-item {
  opacity: 0.5;
  cursor: not-allowed;
}
.setting-item.disabled-item input {
  cursor: not-allowed;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* ====== 连杀播报动态特效 ====== */
.kill-text {
  font-size: 28px;
  font-weight: 900;
  color: #feca57;
  margin-bottom: 20px;
  letter-spacing: 2px;
  text-shadow:
    0 0 10px #ee5253,
    0 0 20px #ff9f43;
  animation: killPop 0.8s ease-in-out infinite alternate;
}
/* ====== 竖版手牌提示与外层容器 ====== */
.hand-cards-wrapper {
  position: relative; /* 为右侧计数器提供绝对定位锚点 */
  width: 100%;
  /* 移除原本的 display: flex，让内部的 hand-cards-container 恢复 100% 宽度并自然居中 */
}

/* 极简风的竖向计数器，固定在屏幕最右侧，与手牌同高 */
.my-card-count-vertical {
  position: absolute;
  right: 20px; /* 固定在最右侧，保留 20px 边距防贴边 */
  top: 50%;
  transform: translateY(-50%); /* 垂直居中对齐手牌 */
  display: flex;
  flex-direction: column; /* 文字竖排 */
  align-items: center;
  color: #bdc3c7; /* 【修改】：与第三人称保持一致的低调灰白色 */
  font-size: 14px;
  /* 移除了之前喧宾夺主的背景、阴影和粗体 */
}

/* 数字稍微拉开一点间距，但不强调颜色 */
.my-card-count-vertical .num {
  margin: 4px 0;
}

/* AOE 操作提示条 */
.aoe-action-bar {
  display: flex;
  gap: 15px;
  align-items: center;
  background: rgba(192, 57, 43, 0.8);
  padding: 5px 20px;
  border-radius: 30px;
  box-shadow: 0 0 15px rgba(231, 76, 60, 0.5);
}
.aoe-hint {
  font-weight: bold;
  color: white;
  font-size: 18px;
  margin-right: 10px;
}

/* 弃牌飞行动画特效 */
.aoe-anim-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 500;
}
.aoe-anim-card {
  position: absolute;
  width: 80px;
  height: 115px;
  opacity: 0;
}
.aoe-anim-card img {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
}

/* 第一人称：从下方飞向正中间然后消失 */
.aoe-anim-card.from-me {
  bottom: 25%;
  left: 50%;
  transform: translateX(-50%);
  animation: flyToCenterMe 1s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
/* 第三人称：从上方飞向正中间然后消失 */
.aoe-anim-card.from-other {
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  animation: flyToCenterOther 1s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
/* ====== 桌面锦囊暂留脉冲动画 ====== */
.aoe-table-display {
  animation: slideDown 0.3s ease-out;
}
.aoe-pulse {
  box-shadow:
    0 0 15px #e74c3c,
    0 0 30px #c0392b;
  border: 2px solid #e74c3c;
  animation: aoeHeartbeat 1.5s infinite; /* 危险预警呼吸灯 */
}
/* ====== 全局错误提示飘窗 ====== */
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
@keyframes aoeHeartbeat {
  0% {
    transform: scale(1);
    box-shadow: 0 0 15px #e74c3c;
  }
  50% {
    transform: scale(1.15);
    box-shadow: 0 0 30px #ff4757;
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 15px #e74c3c;
  }
}
@keyframes flyToCenterMe {
  0% {
    transform: translate(-50%, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -150px) scale(0.8);
    opacity: 0;
  }
}
@keyframes flyToCenterOther {
  0% {
    transform: translate(-50%, 0) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, 150px) scale(0.8);
    opacity: 0;
  }
}

@keyframes killPop {
  0% {
    transform: scale(0.95);
    text-shadow:
      0 0 5px #ee5253,
      0 0 10px #ff9f43;
  }
  100% {
    transform: scale(1.1);
    text-shadow:
      0 0 15px #ff4757,
      0 0 30px #ff9f43,
      0 0 45px #feca57;
  }
}
/* ====== 新增：更新公告按钮样式 ====== */
.update-toggle-btn {
  position: absolute;
  top: 70px; /* 放在规则按钮的正下方 */
  left: 20px;
  padding: 10px 15px;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  z-index: 100;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}
.update-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}
/* 手机端适配：按钮和面板稍微缩放，防止挡住屏幕 */
@media screen and (max-width: 768px) {
  .top-right-settings {
    top: 15px;
    right: 15px;
  }
  .settings-btn.small {
    font-size: 12px;
    padding: 6px 12px;
  }
  .settings-panel {
    width: 220px;
    padding: 10px;
  }
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

/* 手机端稍微缩小文字 */
@media screen and (max-width: 768px) {
  .floating-action-text {
    font-size: 24px;
  }
  .floating-action-text.my-float-text {
    font-size: 28px;
    top: 0;
  }
}
/* 手机端稍微缩小弹窗内边距 */
@media screen and (max-width: 768px) {
  .rules-content {
    padding: 20px;
    font-size: 14px;
  }
  .rules-content h2 {
    font-size: 20px;
  }
}

/* 手机端把大厅改成上下堆叠 */
@media screen and (max-width: 768px) {
  .lobby-wrapper {
    flex-direction: column;
    padding: 20px;
    margin-top: 60px;
  }
  .room-list-panel {
    width: 92%;
    height: 250px;
    overflow-y: auto;
  }
  .rule-toggle-btn {
    top: 10px;
    left: 10px;
    padding: 6px 12px;
    font-size: 13px;
  }
  .update-toggle-btn {
    top: 50px; /* 紧跟在手机端规则按钮下方 */
    left: 10px;
    padding: 6px 12px;
    font-size: 13px;
  }
}
@keyframes popOther {
  0% {
    transform: translateY(-50%) scale(0.5);
    opacity: 0;
  }
  100% {
    transform: translateY(-50%) scale(1);
    opacity: 1;
  }
}
@keyframes popMe {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes bounce {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-10px);
  }
}

/* 手机端自适应 */
@media screen and (max-width: 768px) {
  .card {
    width: 50px;
    height: 75px;
    margin-left: -30px;
    font-size: 16px;
    border-radius: 4px;
  }
  .card.selected {
    transform: translateY(-10px);
  }
  .card.mini {
    width: 40px;
    height: 60px;
    font-size: 14px;
  }
  .hand-cards-container {
    height: 90px;
    margin-bottom: 10px;
  }
  .action-bar button {
    padding: 8px 12px;
    font-size: 14px;
  }
  .wait-text {
    font-size: 16px;
  }
  .header {
    font-size: 14px;
    padding: 10px;
    flex-wrap: wrap;
  }
  .card-back {
    width: 20px;
    height: 30px;
    margin-left: -12px;
  }
  .modal-content {
    padding: 30px 40px;
  }
  .bounce-text {
    font-size: 28px;
  }
  .exit-btn {
    bottom: auto;
    right: auto;
    top: 60%; /* 放在屏幕左侧 75% 的高度，避开中间的玩家列表 */
    left: 0; /* 紧贴左侧边缘 */
    transform: translateY(-50%);
    padding: 10px 8px;
    font-size: 13px;
    border-radius: 0 8px 8px 0; /* 左侧方角贴边，右侧圆角 */
    z-index: 99; /* 保证不被手牌盖住 */
    box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.3);
    background-color: rgba(192, 57, 43, 0.85); /* 稍微半透明，显得更精致 */
  }

  /*【新增】：手机端稍微缩小一点面板尺寸，防止太高顶到屏幕边缘 */
  .emoji-panel {
    width: 210px;
    height: 180px;
    padding: 10px;
    gap: 8px;
  }
  .art-title {
    font-size: 36px;
    letter-spacing: 4px;
  }
  .art-subtitle {
    font-size: 32px;
  }
  .please-ready-hint {
    font-size: 18px;
  }
  .emoji-item {
    width: 45px;
    height: 45px;
  }
  .emoji-bubble.me {
    bottom: 180%;
    left: 20%;
    margin-bottom: 10px;
    animation: popMe 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
  }
}
</style>
