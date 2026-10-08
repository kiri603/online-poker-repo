import { computed, shallowRef, ref, watch, onMounted, onUnmounted } from "vue";
import { createTutorialController } from "./tutorialController.js";
import { cardId } from "./tutorialMatch.js";
import { TUTORIAL_NAMES, TUTORIAL_STEPS } from "./tutorialScript.js";
import { getCardImageUrl, handleImageError } from "../views/GameBoard/GameBoard.js";
import { soundStatus, toggleSound, playAudio, playCardAudio, playBGM, stopGameAudio, setMusicDucking } from "../store/audioManager.js";
import { createBattleEffectsSession, effectsQuality } from "../store/battleEffects.js";

export function useTutorialSession() {
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
    onChange: (state) => { snapshot.value = state; },
    onAction: (event, match) => {
      battleSession.handleBattleFeedback({
        event: event.action === "play" ? "CARDS_PLAYED" : event.action === "replace" ? "PLAYER_REPLACED" : "PLAYER_PASSED",
        userId: TUTORIAL_NAMES[event.actor], cards: match.table,
      });
      if (event.action === "play") playCardAudio(match.table);
      else playAudio(event.action === "replace" ? "action_zhiheng" : "action_pass");
      if (match.winner === "you") playBGM("Win", false);
      // Settlement publishes before this callback; reschedule with the actual effect duration.
      scheduleDemo();
    },
  });
  snapshot.value = controller.state;
  const step = computed(() => TUTORIAL_STEPS[snapshot.value.stepIndex]);
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
  const unsupported = ["respondAoe", "discardAoe", "toggleEmojiPanel", "sendEmoji", "selectSkill", "toggleGuanxingSelect",
    "confirmGuanxing", "toggleWgfdSelect", "confirmWgfd", "confirmGushouDiscard", "confirmGuixinDecision",
    "confirmKurouAwakenDiscard", "skipKurouAwakenDiscard"];
  for (const name of unsupported) bindings[name] = () => false;
  Object.assign(bindings, {
    userId: ref("你"), handCards: hand,
    sortedHandCards: computed(() => [...hand.value].sort((a, b) => a.weight - b.weight)),
    selectedCards: computed(() => hand.value.filter((c) => c.selected)),
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
      if (!event || phase.value !== "demo" || snapshot.value.paused || event.action === "play") return {};
      return { [TUTORIAL_NAMES[event.actor]]: { id: event.id, type: event.action === "pass" ? "pass" : "skill",
        text: event.action === "pass" ? "要不起" : "制衡" } };
    }),
    getCardImageUrl, handleImageError, soundStatus, toggleSound, playBGM, effectsQuality,
    toggleSelect: (c) => controller.toggleCard(cardId(c)),
    playCards: () => controller.execute("play"), passTurn: () => controller.execute("pass"),
    replaceCard: () => controller.execute("replace"),
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
  return { bindings, policy, battleSession, snapshot, step, phase, controller, restart, exitRequested, cancelExit };
}
