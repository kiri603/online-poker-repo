import { computed, shallowRef, ref, watch, onMounted, onUnmounted } from "vue";
import { createTutorialController } from "./tutorialController.js";
import { cardId, createTutorialCard, TUTORIAL_SCROLLS } from "./tutorialMatch.js";
import { TUTORIAL_NAMES } from "./tutorialScript.js";
import { getTutorialLesson } from "./tutorialLessons.js";
import { getCardImageUrl, handleImageError } from "../views/GameBoard/GameBoard.js";
import { soundStatus, toggleSound, playAudio, playCardAudio, playBGM, stopGameAudio, setMusicDucking } from "../store/audioManager.js";
import { createBattleEffectsSession, effectsQuality } from "../store/battleEffects.js";

export function useTutorialSession(kind = "basic") {
  const lesson = getTutorialLesson(kind);
  const snapshot = shallowRef(null);
  const exitRequested = ref(false);
  const battleSession = createBattleEffectsSession();
  let demoTimer = null, demoGeneration = 0;
  const clearDemo = () => { demoGeneration++; if (demoTimer !== null) clearTimeout(demoTimer); demoTimer = null; };
  const scheduleDemo = () => {
    clearDemo();
    const state = snapshot.value;
    if (state.phase !== "demo" || state.paused) return;
    const remaining = battleSession.battleEffects.value.map((effect) => effect.startedAt + effect.duration - Date.now() + 80);
    const generation = demoGeneration;
    demoTimer = setTimeout(() => {
      if (generation !== demoGeneration) return;
      demoTimer = null; controller.advanceDemo();
    }, Math.max(state.lastEvent?.action === "pass" ? 1500 : 1300, ...remaining));
  };
  const controller = createTutorialController({
    kind,
    onChange: (state) => { snapshot.value = state; },
    onAction: (event, match) => {
      const cards = event.cards.map(createTutorialCard);
      const scroll = event.action === "play" && cards[0]?.suit === "SCROLL" ? TUTORIAL_SCROLLS[cards[0].rank] : null;
      battleSession.handleBattleFeedback({
        event: scroll ? "AOE_PLAYED" : event.action === "play" ? "CARDS_PLAYED" : event.action === "replace" ? "PLAYER_REPLACED" : "PLAYER_PASSED",
        userId: TUTORIAL_NAMES[event.actor], cards, aoeName: scroll?.name,
      });
      if (scroll) playAudio(scroll.audio);
      else if (event.action === "play") playCardAudio(cards);
      else if (event.action === "replace" || event.action === "pass" || event.action === "respondAoe")
        playAudio(event.action === "replace" ? "action_zhiheng" : "action_pass");
      if (match.winner === "you") playBGM("Win", false);
      // Settlement publishes before this callback; reschedule with the actual effect duration.
      scheduleDemo();
    },
  });
  snapshot.value = controller.state;
  const step = computed(() => lesson.steps[snapshot.value.stepIndex]);
  const phase = computed(() => snapshot.value.phase);
  const hand = computed(() => snapshot.value.match.hands.you.map((c) => ({ ...c, selected: snapshot.value.selected.includes(cardId(c)) })));
  const neutral = {
    phaseNotice: null, effectsSettingsOpen: false, audioLevels: {}, countdown: 0,
    activeEmojis: {}, currentAoeType: null, pendingAoePlayers: [], aoeInitiator: "",
    isSpectator: false, amIPendingAoe: false, aoeAnimCards: [], showEmojiPanel: false, emojiList: [],
    winner: "", winningCards: [], killText: "", sortedWinningCards: [], onlyHasScrolls: false,
    isShuffling: false, mySkill: "ZHIHENG", showSkillSelection: false, showGuanxingModal: false,
    guanxingCards: [], selectedGuanxingCards: [], skillCountdown: 0, showWgfdModal: false,
    wgfdCards: [], selectedWgfdCard: [], jdsrTarget: null, jdsrInitiator: null, luanjianInitiator: "",
    kurouUseCount: 0, kurouUsesThisTurn: 0, kurouAwakened: false, guixinDisabled: false,
    guixinPendingPasser: "", showGuixinModal: false, tieqiJudgeCards: [],
  };
  const bindings = Object.fromEntries(Object.entries(neutral).map(([key, value]) => [key, ref(value)]));
  const unsupported = ["toggleEmojiPanel", "sendEmoji", "selectSkill", "toggleGuanxingSelect",
    "confirmGuanxing", "confirmGushouDiscard", "confirmGuixinDecision",
    "confirmKurouAwakenDiscard", "skipKurouAwakenDiscard"];
  for (const name of unsupported) bindings[name] = () => false;
  Object.assign(bindings, {
    userId: ref("你"), handCards: hand,
    sortedHandCards: computed(() => [...hand.value].sort((a, b) => a.weight - b.weight)),
    selectedCards: computed(() => hand.value.filter((c) => c.selected)),
    currentAoeType: computed(() => snapshot.value.match.currentAoeType || null),
    pendingAoePlayers: computed(() => (snapshot.value.match.pendingAoePlayers || []).map((id) => TUTORIAL_NAMES[id])),
    aoeInitiator: computed(() => TUTORIAL_NAMES[snapshot.value.match.aoeInitiator] || ""),
    amIPendingAoe: computed(() => snapshot.value.match.pendingAoePlayers?.includes("you") || false),
    showWgfdModal: computed(() => snapshot.value.match.currentAoeType === "WGFD"),
    wgfdCards: computed(() => (snapshot.value.match.wgfdCards || []).map((c) => ({ ...c, selected: snapshot.value.selected.includes(cardId(c)) }))),
    selectedWgfdCard: computed(() => bindings.wgfdCards.value.filter((c) => c.selected)),
    jdsrTarget: computed(() => TUTORIAL_NAMES[snapshot.value.match.jdsrTarget] || null),
    jdsrInitiator: computed(() => TUTORIAL_NAMES[snapshot.value.match.jdsrInitiator] || null),
    phaseNotice: computed(() => {
      const type = snapshot.value.match.currentAoeType;
      if (!type) return null;
      const mine = bindings.amIPendingAoe.value;
      return { title: TUTORIAL_SCROLLS[type].name, owner: mine ? "你" : bindings.pendingAoePlayers.value[0],
        stage: mine ? "等待你的行动" : "等待响应", selected: snapshot.value.selected.length,
        required: mine && type !== "WGFD" ? 1 : 0, tone: type === "NMRQ" ? "crimson" : type === "WGFD" ? "jade" : "gold",
        symbol: type === "WGFD" ? "grain" : "arrow",
        instruction: type === "WGFD" ? "依次选择一张牌加入手牌" : !mine ? "等待其他玩家响应" :
          type === "NMRQ" ? "弃置 1 张红色牌或大王，或接受罚牌" : "弃置 1 张黑色牌或小王，或接受罚牌" };
    }),
    aoeAnimCards: computed(() => {
      const event = snapshot.value.lastEvent;
      return event?.action === "discardAoe" && phase.value === "demo" && !snapshot.value.paused
        ? [{ id: event.id, userId: TUTORIAL_NAMES[event.actor], card: createTutorialCard(event.cards[0]) }] : [];
    }),
    tableCards: computed(() => snapshot.value.match.table),
    sortedTableCards: computed(() => [...snapshot.value.match.table].sort((a, b) => a.weight - b.weight)),
    lastPlayPlayer: computed(() => TUTORIAL_NAMES[snapshot.value.match.last] || ""),
    currentTurn: computed(() => TUTORIAL_NAMES[snapshot.value.match.turn]),
    myStatus: computed(() => snapshot.value.match.statuses.you),
    otherPlayers: computed(() => ["dragon", "tortoise"].map((id) => ({ userId: TUTORIAL_NAMES[id],
      cardCount: snapshot.value.match.hands[id].length, status: snapshot.value.match.statuses[id] }))),
    warningUserId: computed(() => {
      const id = Object.keys(snapshot.value.match.hands).find((id) => snapshot.value.match.hands[id].length >= 13);
      return TUTORIAL_NAMES[id] || "";
    }),
    activeActionTexts: computed(() => {
      const event = snapshot.value.lastEvent;
      if (!event || phase.value !== "demo" || snapshot.value.paused) return {};
      const scroll = event.action === "play" && event.cards[0]?.startsWith("SCROLL") ? TUTORIAL_SCROLLS[event.cards[0].slice(6)] : null;
      const text = scroll?.name || { pass: "要不起", replace: "制衡", discardAoe: "弃牌", respondAoe: "摸 2 张", confirmWgfd: "挑选一张" }[event.action];
      return text ? { [TUTORIAL_NAMES[event.actor]]: { id: event.id, type: ["pass", "respondAoe"].includes(event.action) ? "pass" : "skill", text } } : {};
    }),
    getCardImageUrl, handleImageError, soundStatus, toggleSound, playBGM, effectsQuality,
    toggleSelect: (c) => controller.toggleCard(cardId(c)),
    playCards: () => controller.execute("play"), passTurn: () => controller.execute("pass"),
    replaceCard: () => controller.execute("replace"),
    respondAoe: (c) => c ? controller.execute("discardAoe", [cardId(c)]) : controller.execute("respondAoe", []),
    discardAoe: () => controller.execute("discardAoe"),
    toggleWgfdSelect: (c) => controller.toggleCard(cardId(c)),
    confirmWgfd: () => controller.execute("confirmWgfd"),
    exitGame: () => { exitRequested.value = true; battleSession.clearBattleEffects(); stopGameAudio(); controller.setPaused("exit", true); },
    returnToRoom: () => false,
  });
  watch(snapshot, (state) => {
    setMusicDucking("tutorial", ["dialogue", "complete", "error"].includes(state.phase) || state.paused);
    scheduleDemo();
  }, { flush: "sync", immediate: true });
  const visibility = () => {
    controller.setPaused("hidden", document.hidden);
    if (document.hidden) { battleSession.clearBattleEffects(); stopGameAudio(); }
  };
  onMounted(() => { playBGM("Normal"); document.addEventListener("visibilitychange", visibility); visibility(); });
  onUnmounted(() => {
    controller.dispose(); clearDemo(); battleSession.clearBattleEffects(); stopGameAudio(); setMusicDucking("tutorial", false);
    document.removeEventListener("visibilitychange", visibility);
  });
  const restart = () => { clearDemo(); battleSession.clearBattleEffects(); stopGameAudio(); exitRequested.value = false; controller.setPaused("exit", false); controller.restart(); playBGM("Normal"); };
  const cancelExit = () => { exitRequested.value = false; controller.setPaused("exit", false); };
  const policy = {
    canAction: (action) => controller.canExecute(action),
    canSelect: (c) => controller.canSelect(cardId(c)),
    isTarget: (c) => phase.value === "operation" && !controller.canExecute(step.value.action) && step.value.cards.includes(cardId(c)),
    isActionTarget: (action) => controller.canExecute(action),
  };
  return { lesson, bindings, policy, battleSession, snapshot, step, phase, controller, restart, exitRequested, cancelExit };
}
