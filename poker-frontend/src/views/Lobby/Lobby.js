// 从统一的数据仓库引入 Lobby 需要的变量
import { soundStatus, toggleSound, playBGM } from "@/store/audioManager.js";
import {
  roomId,
  userId,
  isPrivate,
  roomPassword,
  publicRooms,
  showRules,
  showUpdates,
  showRuleDetail,
  roomSettings,
  showCreateModal,
} from "@/store/gameState.js";
import { connectWebSocket } from "@/store/gameSocket.js";

// ====== 房间列表轮询逻辑 ======
let roomTimer = null;

const fetchRooms = async () => {
  try {
    // ====== 【自动环境识别】 ======
    const currentHost = window.location.hostname;
    const isLocal = currentHost === "localhost" || currentHost === "127.0.0.1";
    const serverIp = isLocal ? "localhost:8080" : "39.102.60.181:8080";
    // ============================

    const res = await fetch(`http://${serverIp}/api/rooms`); // 使用动态 IP
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        publicRooms.value = data;
      }
    }
  } catch (e) {
    console.error("大厅轮询：等待服务器响应...");
  }
};

// 【核心修复】：将启动和停止的方法暴露出去，供 Vue 组件调度
const startPolling = () => {
  fetchRooms();
  roomTimer = setInterval(fetchRooms, 3000);
};

const stopPolling = () => {
  if (roomTimer) clearInterval(roomTimer);
};

// ====== 交互逻辑 ======
const handleJoinClick = async () => {
  if (!roomId.value || !userId.value) return alert("请输入完整信息");

  try {
    // ====== 【自动环境识别】 ======
    const currentHost = window.location.hostname;
    const isLocal = currentHost === "localhost" || currentHost === "127.0.0.1";
    const serverIp = isLocal ? "localhost:8080" : "39.102.60.181:8080";
    // ============================

    const res = await fetch(
      `http://${serverIp}/api/rooms/check?roomId=${roomId.value}`, // 使用动态 IP
    );
    const data = await res.json();

    if (data.exists) {
      if (data.isPrivate) {
        const pwd = prompt("该房间为私密房间，请输入 4 位密码：");
        if (!pwd) return;
        roomPassword.value = pwd;
      } else {
        roomPassword.value = "";
      }
      connectWebSocket(false);
    } else {
      showCreateModal.value = true;
    }
  } catch (e) {
    console.error("网络预检失败", e);
  }
};

const confirmCreateRoom = () => {
  if (isPrivate.value && roomPassword.value.length !== 4) {
    return alert("创建私密房间必须设置 4 位数字密码！");
  }
  showCreateModal.value = false;
  connectWebSocket(true);
};

const quickJoin = (id) => {
  roomId.value = id;
  handleJoinClick();
};

const goToRuleDetail = () => {
  showRules.value = false;
  showRuleDetail.value = true;
};

export {
  roomId,
  userId,
  isPrivate,
  roomPassword,
  publicRooms,
  showRules,
  showUpdates,
  connectWebSocket,
  quickJoin,
  goToRuleDetail,
  showCreateModal,
  roomSettings,
  handleJoinClick,
  confirmCreateRoom,
  startPolling, // 导出启动方法
  stopPolling, // 导出停止方法
  soundStatus,
  toggleSound,
  playBGM,
};
