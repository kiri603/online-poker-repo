import {
  showSettings,
  roomSettings,
  isClassicMode,
  ownerId,
  userId,
  isReady,
  otherPlayers,
  allReady,
  spectators,
  isSpectator,
} from "@/store/gameState.js";
import { soundStatus, toggleSound, playBGM } from "@/store/audioManager.js";
import { sendMsg, ws } from "@/store/gameSocket.js";
const disbandRoom = () => {
  if (confirm("🚨 警告：确定要彻底从内存中抹除这个房间，并踢出所有人吗？")) {
    sendMsg("DISBAND_ROOM", null);
  }
};
// 修改房间设置同步到后端
const updateSettings = () => {
  if (ownerId.value === userId.value) {
    sendMsg("UPDATE_SETTINGS", roomSettings.value);
  }
};

// 监听锦囊牌模式开关变化
const handleScrollCardsChange = () => {
  if (roomSettings.value.enableScrollCards) {
    alert("牌堆将额外加入两张【南蛮入侵】和两张【万箭齐发】");
  }
  updateSettings();
};

// 房主专属踢人功能
const kickPlayer = (targetId) => {
  if (confirm(`确定要踢出玩家 ${targetId} 吗？`)) {
    sendMsg("KICK_PLAYER", targetId);
  }
};

// 核心流程按钮操作
const startGame = () => sendMsg("START_GAME", null);
const toggleReady = () => sendMsg("READY", null);
const addScriptAi = () => sendMsg("ADD_SCRIPT_AI", null);

// 返回联机大厅 (主动断开 WebSocket)
const returnToLobby = () => {
  if (ws.value) ws.value.close();
};
export {
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
  toggleSound,
  playBGM,
  spectators,
  isSpectator,
  disbandRoom,
};
