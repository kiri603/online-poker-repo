import { createApp, h } from "vue";
import GameBoard from "@/views/GameBoard/index.vue";
import EffectsPreviewDashboard from "./EffectsPreviewDashboard.vue";
import StagePreviewControls from "./StagePreviewControls.vue";
import * as state from "@/store/gameState.js";
import { battleEffects, clearBattleEffects, handleBattleFeedback } from "@/store/battleEffects.js";
import { playAudio, stopGameAudio } from "@/store/audioManager.js";

// A Vite development entry, excluded from the production build. No server connection or real game actions.
const examples = {
  铁骑: { event: "TIEQI_JUDGE", success: true, card: { suit: "♥", rank: "7", weight: 5 }, suppressed: ["赵云", "诸葛亮"] },
  铁骑未命中: { event: "TIEQI_JUDGE", success: false, card: { suit: "♠", rank: "7", weight: 5 } },
  乱箭: { event: "SKILL_USED", skillName: "LUANJIAN" },
  固守: { event: "SKILL_USED", skillName: "GUSHOU" },
  观星: { event: "SKILL_USED", skillName: "GUANXING" },
  苦肉: { event: "SKILL_USED", skillName: "KUROU" },
  觉醒: { event: "SKILL_AWAKEN", skillName: "KUROU" },
  归心: { event: "SKILL_USED", skillName: "GUIXIN" },
  制衡: { event: "PLAYER_REPLACED" },
  万箭齐发: { event: "AOE_PLAYED", aoeName: "万箭齐发" },
  南蛮入侵: { event: "AOE_PLAYED", aoeName: "南蛮入侵" },
  五谷丰登: { event: "AOE_PLAYED", aoeName: "五谷丰登" },
  借刀杀人: { event: "AOE_PLAYED", aoeName: "借刀杀人" },
  炸弹: { event: "CARDS_PLAYED", cards: ["♠", "♥", "♣", "♦"].map((suit) => ({ suit, rank: "A", weight: 12 })) },
  王炸: { event: "CARDS_PLAYED", cards: [{ suit: "JOKER", rank: "小王", weight: 14 }, { suit: "JOKER", rank: "大王", weight: 15 }] },
  飞机: { event: "CARDS_PLAYED", cards: ["7", "7", "7", "8", "8", "8"].map((rank) => ({ rank, suit: "♠", weight: Number(rank) - 2 })) },
  顺子: { event: "CARDS_PLAYED", cards: ["3", "4", "5", "6", "7"].map((rank) => ({ rank, suit: "♠", weight: Number(rank) - 2 })) },
  连对: { event: "CARDS_PLAYED", cards: ["3", "3", "4", "4", "5", "5"].map((rank) => ({ rank, suit: "♠", weight: Number(rank) - 2 })) },
};
const voices = { 铁骑: "action_tieqi", 铁骑未命中: "action_tieqi", 乱箭: "action_luanjian", 固守: "action_gushou", 观星: "action_guanxing", 苦肉: "action_kurou", 觉醒: "action_kurou_awaken", 归心: "action_guixin", 制衡: "action_zhiheng", 万箭齐发: "skill_wjqf", 南蛮入侵: "skill_nmrq", 五谷丰登: "skill_wgfd", 借刀杀人: "skill_jdsr", 炸弹: "combo_bomb", 王炸: "combo_rocket", 飞机: "combo_plane", 顺子: "combo_straight", 连对: "combo_straight_pair" };
const rootStyle = document.createElement("style");
rootStyle.textContent = `html,body,#app {width:100%;height:100%;margin:0;overflow:hidden;background:#100e0c;color:#e7d4b5;font-family:'Microsoft YaHei',sans-serif}*{box-sizing:border-box}.preview-layout{height:100%;display:grid;grid-template-columns:230px 1fr}.preview-controls{padding:22px 18px;overflow-y:auto;border-right:1px solid #ac875833;background:#1b1713}.preview-controls h1{font:500 20px/1.5 serif;letter-spacing:2px;margin:0 0 6px}.preview-controls p{font-size:11px;color:#baa68b;line-height:1.8}.preview-controls h2{font:12px/2 sans-serif;color:#e5c38b;margin:20px 0 8px}.preview-buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px}.preview-controls button,.preview-controls select{padding:9px 7px;background:#2d241b;border:1px solid #a2815144;color:#e8d3ad;border-radius:4px;font:12px sans-serif;cursor:pointer}.preview-controls button:hover{background:#574129;border-color:#dab171}.preview-controls button:focus-visible{outline:2px solid #ffe2a5}.preview-controls select{width:100%}.preview-canvas{display:grid;place-items:center;overflow:auto;padding:24px;background:radial-gradient(ellipse,#28231c,#0c0b09)}.preview-canvas iframe{border:1px solid #a8895544;border-radius:6px;box-shadow:0 12px 60px #0009;flex-shrink:0}.preview-size{display:block;margin-top:20px;font-size:11px}.preview-size select{margin-top:8px}.preview-status{margin-top:16px;font-size:11px;line-height:1.9;color:#c6b697}@media(max-width:700px){.preview-layout{grid-template-columns:170px 1fr}.preview-controls{padding:14px 10px}.preview-canvas{padding:8px}}`;
document.head.appendChild(rootStyle);

if (!import.meta.env.DEV) throw new Error("Effects preview is development only");

if (new URLSearchParams(location.search).get("stage") === "1") {
  state.userId.value = "关羽";
  state.currentTurn.value = "关羽";
  state.gameStarted.value = true;
  state.gamePhase.value = "PLAYING";
  state.myStatus.value = "PLAYING";
  state.mySkill.value = "TIEQI";
  state.roomSettings.value = { enableSkills: true, enableScrollCards: true, enableWildcard: false };
  state.handCards.value = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q"].map((rank, i) => ({ rank, suit: ["♠", "♥", "♣", "♦"][i % 4], weight: i + 1, selected: false }));
  state.otherPlayers.value = ["赵云", "诸葛亮", "孙策"].map((userId, i) => ({ userId, cardCount: 6 + i, status: "PLAYING", skill: ["GUSHOU", "GUANXING", "KUROU"][i] }));
  state.countdown.value = 16;
  const showScenario = (name, mode = "live") => {
    clearBattleEffects();
    stopGameAudio();
    state.handCards.value = state.handCards.value.map((card) => ({ ...card, selected: false }));
    if (name === "清除") { clearBattleEffects(); state.currentAoeType.value = null; state.tieqiJudgeCards.value = []; return; }
    if (name === "固守弃牌" || name === "他人弃牌" || name === "觉醒弃黑" || name === "归心抉择") {
      clearBattleEffects();
      state.currentAoeType.value = name.includes("弃牌") ? "GUSHOU_DISCARD" : name === "觉醒弃黑" ? "KUROU_AWAKEN_DISCARD" : "GUIXIN_DECISION";
      state.pendingAoePlayers.value = [name === "他人弃牌" ? "赵云" : "关羽"];
      state.guixinPendingPasser.value = "赵云";
      state.tieqiJudgeCards.value = [];
      return;
    }
    if (!examples[name]) return;
    state.currentAoeType.value = null;
    state.tieqiJudgeCards.value = [];
    const message = { ...examples[name], userId: "关羽" };
    const tieqi = message.event === "TIEQI_JUDGE";
    if (tieqi && mode === "live") {
      const cards = [{ suit: "♥", rank: "7", weight: 5 }];
      state.tableCards.value = cards;
      state.lastPlayPlayer.value = "关羽";
      playAudio("single_7");
      handleBattleFeedback({ event: "CARDS_PLAYED", userId: "关羽", cards });
    }
    if (tieqi && mode !== "live") {
      battleEffects.value = [{ kind: message.success ? "cavalry" : "judgement", title: "铁骑", tone: "gold", duration: 3200, id: Date.now(), startedAt: Date.now(), ...message }];
    } else {
      handleBattleFeedback(message);
    }
    if (mode !== "live") {
      const impacts = { cavalry: .57, invasion: .57, bomb: .39, rocket: .59, airplane: .48, stars: .45 };
      const now = Date.now();
      battleEffects.value = battleEffects.value.map((effect) => {
        const keyframes = effect.kind === "cavalry" ? { entry: .12, windup: .16, strike: .36, end: .8 } : { entry: .24, windup: .42, strike: .51, end: .8 };
        const progress = keyframes[mode] ?? impacts[effect.kind] ?? .42;
        return { ...effect, previewProgress: progress, previewDuration: effect.duration, duration: 600000, startedAt: now - progress * 600000 };
      });
    }
    if (!tieqi) playAudio(voices[name]);
  };
  window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.source === window.parent) showScenario(event.data?.scenario);
  });
  if (new URLSearchParams(location.search).get("controls") === "1") {
    createApp({ render: () => h("div", [h(GameBoard), h(StagePreviewControls, { scenarios: [...Object.keys(examples), "固守弃牌", "他人弃牌", "觉醒弃黑", "归心抉择", "清除"], onScenario: showScenario })]) }).mount("#app");
  } else createApp(GameBoard).mount("#app");
} else {
  createApp(EffectsPreviewDashboard, { examples: Object.keys(examples) }).mount("#app");
}
