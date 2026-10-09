import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { soundStatus, audioLevels, setMusicDucking } from "../store/audioManager.js";
import { createTutorialVoicePlayer } from "./tutorialVoicePlayer.js";
import { TUTORIAL_VOICES, TUTORIAL_VOICE_TIMINGS } from "./tutorialVoiceCatalog.js";

export function useTutorialVoice(getText, getPaused = () => false, getEnabled = () => true) {
  const voiceRef = ref(null), duckingSource = Symbol("xiaotao-voice");
  const playback = ref({ source: "", status: "idle", currentTime: 0, duration: 0 });
  const hasVoice = computed(() => Boolean(TUTORIAL_VOICES[getText()]));
  const subtitleCues = computed(() => TUTORIAL_VOICE_TIMINGS[getText()] || []);
  const enabled = computed(() => soundStatus.value && getEnabled());
  const hidden = ref(document.hidden);
  const isPaused = computed(() => Boolean(getPaused() || hidden.value));
  let player = null;
  const updatePause = () => { hidden.value = document.hidden; player?.setPaused(isPaused.value); };
  const retry = () => player?.retry();
  watch(getText, () => player?.stop(), { flush: "sync" });
  watch(getText, (text) => player?.play(TUTORIAL_VOICES[text]), { flush: "post" });
  watch(enabled, (value) => player?.setEnabled(value), { flush: "sync" });
  watch(getPaused, updatePause, { flush: "sync" });
  watch(() => audioLevels.voice, (volume) => player?.setVolume(volume));
  onMounted(() => {
    player = createTutorialVoicePlayer({ audio: voiceRef.value,
      onActiveChange: (active) => setMusicDucking(duckingSource, active),
      onPlaybackChange: (state) => { playback.value = state; } });
    player.setVolume(audioLevels.voice);
    player.setEnabled(enabled.value);
    updatePause();
    player.play(TUTORIAL_VOICES[getText()]);
    document.addEventListener("visibilitychange", updatePause);
    document.addEventListener("click", retry);
    document.addEventListener("touchend", retry, { passive: true });
    document.addEventListener("keydown", retry);
  });
  onUnmounted(() => {
    player?.dispose();
    document.removeEventListener("visibilitychange", updatePause);
    document.removeEventListener("click", retry);
    document.removeEventListener("touchend", retry);
    document.removeEventListener("keydown", retry);
  });
  return { voiceRef, playback, hasVoice, subtitleCues, enabled, isPaused, stopVoice: () => player?.stop() };
}
