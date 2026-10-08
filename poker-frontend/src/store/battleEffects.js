import { ref } from "vue";
import { CAVALRY_TIMING, createFeedbackDirector } from "./battleFeedback.js";
import { playBattleSound, playCavalrySounds, stopBattleSounds } from "./battleSound.js";
import { playVoicePresentation } from "./audioManager.js";

export const effectsQuality = ref("full");
export const createBattleEffectsSession = () => {
  const battleEffects = ref([]);
  let direct = createFeedbackDirector();
  let sequence = 0;
  let generation = 0;
  const presentationTimers = new Set();
  const cardEnds = new Map();

  const clearBattleEffects = () => {
    generation++;
    for (const timer of presentationTimers) clearTimeout(timer);
    presentationTimers.clear();
    cardEnds.clear();
    battleEffects.value = [];
    direct = createFeedbackDirector();
    stopBattleSounds();
  };

  const startEffect = (effect) => {
    const now = Date.now();
    battleEffects.value = battleEffects.value.filter((entry) =>
      now - entry.startedAt < entry.duration && !(entry.userId === effect.userId && entry.kind === effect.replaces),
    );
    const entry = { ...effect, id: ++sequence, startedAt: now };
    battleEffects.value.push(entry);
    // Bound simultaneous performances during rapid AI turns.
    battleEffects.value = battleEffects.value.slice(-4);
    if (effect.kind === "cavalry") playCavalrySounds(effect.duration);
    else playBattleSound(effect.kind);
    return entry;
  };

  const handleBattleFeedback = (message, onResult) => {
    const effect = direct(message);
    if (!effect) return;
    if (message.event === "CARDS_PLAYED") cardEnds.set(message.userId, Date.now() + effect.duration);
    if (message.event !== "TIEQI_JUDGE") { startEffect(effect); return; }
    const ticket = generation;
    playVoicePresentation("action_tieqi", () => {
      if (ticket !== generation) return;
      const judgement = startEffect(effect);
      const timer = setTimeout(() => {
        presentationTimers.delete(timer);
        if (ticket !== generation) return;
        battleEffects.value = battleEffects.value.filter((entry) => entry.id !== judgement.id);
        if (effect.success) startEffect({ ...effect, kind: "cavalry", duration: CAVALRY_TIMING.duration });
        onResult?.(effect);
      }, effect.duration);
      presentationTimers.add(timer);
    }, cardEnds.get(effect.userId) || 0);
  };

  const expireBattleEffects = (now = Date.now()) => {
    const active = battleEffects.value.filter((effect) => now - effect.startedAt < effect.duration);
    if (active.length !== battleEffects.value.length) battleEffects.value = active;
  };
  return { battleEffects, handleBattleFeedback, clearBattleEffects, expireBattleEffects };
};

// Existing consumers keep using the default live session.
const liveSession = createBattleEffectsSession();
export const battleEffects = liveSession.battleEffects;
export const handleBattleFeedback = liveSession.handleBattleFeedback;
export const clearBattleEffects = liveSession.clearBattleEffects;
export const expireBattleEffects = liveSession.expireBattleEffects;
