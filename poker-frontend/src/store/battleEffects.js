import { ref } from "vue";
import { createFeedbackDirector } from "./battleFeedback.js";
import { playBattleSound, stopBattleSounds } from "./battleSound.js";

export const battleEffects = ref([]);
export const effectsQuality = ref("full");
let direct = createFeedbackDirector();
let sequence = 0;

export const clearBattleEffects = () => {
  battleEffects.value = [];
  direct = createFeedbackDirector();
  stopBattleSounds();
};

export const handleBattleFeedback = (message) => {
  const effect = direct(message);
  if (!effect) return;
  const now = Date.now();
  battleEffects.value = battleEffects.value.filter((entry) =>
    now - entry.startedAt < entry.duration && !(entry.userId === effect.userId && entry.kind === effect.replaces),
  );
  battleEffects.value.push({ ...effect, id: ++sequence, startedAt: now });
  // Bound simultaneous performances during rapid AI turns.
  battleEffects.value = battleEffects.value.slice(-4);
  playBattleSound(effect.kind);
};

export const expireBattleEffects = (now = Date.now()) => {
  const active = battleEffects.value.filter((effect) => now - effect.startedAt < effect.duration);
  if (active.length !== battleEffects.value.length) battleEffects.value = active;
};
