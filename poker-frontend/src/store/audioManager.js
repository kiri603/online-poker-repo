// src/store/audioManager.js
import { isSoundOn } from "@/store/gameState.js";
import { computed, reactive, watch } from "vue";
import { setBattleSoundVolume, stopBattleSounds } from "./battleSound.js";
import { getCardFeedback } from "./battleFeedback.js";

const DEFAULT_LEVELS = { music: 0.3, voice: 0.9, effects: 0.7 };
const readLevels = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem("poker:audio-levels") || "{}");
    return Object.fromEntries(Object.entries(DEFAULT_LEVELS).map(([key, fallback]) =>
      [key, typeof saved[key] === "number" ? Math.max(0, Math.min(1, saved[key])) : fallback],
    ));
  } catch { return { ...DEFAULT_LEVELS }; }
};
export const audioLevels = reactive(readLevels());
const activeSounds = new Set();
let voiceAudio = null;
let voiceQueue = [];
let voiceDelay = null;
let lastAudioName = "";
let lastAudioTime = 0;
const musicDuckingSources = new Set();
const updateMusicVolume = () => {
  if (currentBGM) currentBGM.volume = audioLevels.music * Math.min(voiceAudio ? 0.38 : 1, musicDuckingSources.size ? 0.45 : 1);
};
export const setMusicDucking = (source, enabled) => {
  if (enabled) musicDuckingSources.add(source); else musicDuckingSources.delete(source);
  updateMusicVolume();
};
watch(audioLevels, () => {
  try { window.localStorage.setItem("poker:audio-levels", JSON.stringify(audioLevels)); } catch { /* Storage may be disabled. */ }
  setBattleSoundVolume(audioLevels.effects);
  updateMusicVolume();
  if (voiceAudio) voiceAudio.volume = audioLevels.voice;
}, { deep: true });
setBattleSoundVolume(audioLevels.effects);

export const stopGameAudio = ({ preservePresentations = false } = {}) => {
  if (voiceDelay) clearTimeout(voiceDelay);
  voiceDelay = null;
  voiceQueue = preservePresentations ? voiceQueue.filter((entry) => entry.onStart) : [];
  for (const audio of activeSounds) { audio.pause(); audio.currentTime = 0; }
  activeSounds.clear();
  voiceAudio = null;
  stopCountdownAudio();
  stopBattleSounds();
  updateMusicVolume();
  if (preservePresentations) playNextVoice();
};

// ====== 1. 导出全局统一的声音状态与控制方法 ======
export const soundStatus = computed(() => isSoundOn.value);
export const toggleSound = () => {
  isSoundOn.value = !isSoundOn.value;
};

// ====== 2. 背景音乐 (BGM) 核心控制器 ======
let currentBGM = null;
let currentBGMName = "";
let currentBGMLoop = true;
let bgmEnded = false;
let bgmGeneration = 0;
let bgmPlayAttempt = 0;
let isExcitingPlaying = false;
let countdownAudio = null;
export const stopCountdownAudio = () => {
  if (countdownAudio) {
    countdownAudio.pause();
    countdownAudio.currentTime = 0; // 进度归零
  }
};

const reportBGMError = (error) => {
  console.warn(`BGM [${currentBGMName}] 播放失败，将在用户交互或返回前台时重试。`, error, {
    at: new Date().toISOString(),
    mediaErrorCode: currentBGM?.error?.code,
    readyState: currentBGM?.readyState,
    networkState: currentBGM?.networkState,
    currentTime: currentBGM?.currentTime,
    loop: currentBGMLoop,
    visibility: document.visibilityState,
  });
};

const prepareBGM = () => {
  // iOS 的播放许可属于媒体元素，切换曲目时保留已解锁的播放器。
  if (!currentBGM) currentBGM = new Audio();
  currentBGM.src = `/audios/${currentBGMName}.mp3`;
  currentBGM.loop = currentBGMLoop;
  updateMusicVolume();
  const generation = bgmGeneration;
  currentBGM.onended = () => {
    if (generation !== bgmGeneration || !currentBGM.ended) return;
    bgmEnded = true;
    isExcitingPlaying = false;
    if (currentBGMName === "Exciting") playBGM("Normal", true);
  };
  currentBGM.onerror = () => {
    if (generation === bgmGeneration && currentBGM.error) reportBGMError(currentBGM.error);
  };
};

const resumeBGM = () => {
  if (!isSoundOn.value || !currentBGMName || bgmEnded || currentBGM?.ended) return;
  if (!currentBGM) prepareBGM();
  if (currentBGM.error) currentBGM.load();
  const generation = bgmGeneration;
  const attempt = ++bgmPlayAttempt;
  const failed = (error) => {
    // 切曲或静音会中断旧的 play()，不能把其延迟结果归到当前播放。
    if (generation === bgmGeneration && attempt === bgmPlayAttempt && isSoundOn.value && !bgmEnded) reportBGMError(error);
  };
  try { currentBGM.play()?.catch(failed); }
  catch (error) { failed(error); }
};

// 监听全局声音开关：用户随时可以暂停/恢复 BGM。
watch(isSoundOn, (newVal) => {
  if (newVal) resumeBGM();
  else {
    bgmPlayAttempt++;
    stopGameAudio({ preservePresentations: true });
    currentBGM?.pause();
  }
});

// 保留交互恢复入口，后续切曲或系统中断后也可重试，且不重置进度和循环模式。
const enableAudioOnInteraction = () => {
  if (!currentBGM || currentBGM.paused || currentBGM.error) resumeBGM();
};
document.addEventListener("click", enableAudioOnInteraction);
document.addEventListener("touchend", enableAudioOnInteraction, { passive: true });
document.addEventListener("keydown", enableAudioOnInteraction);
document.addEventListener("visibilitychange", () => { if (!document.hidden) resumeBGM(); });
window.addEventListener("pageshow", resumeBGM);

// 播放 BGM 的主方法。
export const playBGM = (filename, loop = true) => {
  currentBGM?.pause();
  currentBGMName = filename;
  currentBGMLoop = loop;
  bgmEnded = false;
  bgmGeneration++;
  isExcitingPlaying = filename === "Exciting";
  if (currentBGM || isSoundOn.value) prepareBGM();
  resumeBGM();
};

// ====== 3. 音效播放与智能解析器 ======
const playNextVoice = () => {
  if (voiceAudio || voiceDelay) return;
  let next;
  while (voiceQueue.length) {
    const candidate = voiceQueue.shift();
    if (candidate.onStart || (isSoundOn.value && Date.now() - candidate.at < 1500)) { next = candidate; break; }
  }
  if (!next) return;
  if (next.notBefore > Date.now()) {
    voiceQueue.unshift(next);
    voiceDelay = setTimeout(() => { voiceDelay = null; playNextVoice(); }, next.notBefore - Date.now());
    return;
  }
  next.onStart?.();
  if (!isSoundOn.value) { playNextVoice(); return; }
  const audio = new Audio(`/audios/${next.filename}.mp3`);
  voiceAudio = audio;
  activeSounds.add(audio);
  audio.volume = audioLevels.voice;
  updateMusicVolume();
  const finish = () => {
    activeSounds.delete(audio);
    if (voiceAudio !== audio) return;
    voiceAudio = null;
    updateMusicVolume();
    playNextVoice();
  };
  audio.onended = finish;
  audio.onerror = finish;
  audio.play().catch(finish);
};

// Reserve a skill's presentation in the same queue as card speech. Muting skips
// audio but preserves visual stages; leaving the room cancels the reservation.
export const playVoicePresentation = (filename, onStart, notBefore = 0) => {
  voiceQueue.push({ filename, onStart, notBefore, at: Date.now() });
  playNextVoice();
};

export const playAudio = (filename) => {
  if (!filename || !isSoundOn.value) return;
  if (filename === "countdown") {
    if (countdownAudio) {
      countdownAudio.pause();
      countdownAudio.currentTime = 0;
    }
    countdownAudio = new Audio(`/audios/countdown.mp3`);
    countdownAudio.volume = audioLevels.effects * 0.8;
    countdownAudio.play().catch((e) => {});
    return; // 倒计时属于高频短音效，不需要往下走高能 BGM 的判断，直接结束
  }
  const now = Date.now();
  if (lastAudioName === filename && now - lastAudioTime < 250) return;
  lastAudioName = filename;
  lastAudioTime = now;
  if (filename !== "shuffle" && filename !== "skill_tieqi_horse") {
    voiceQueue.push({ filename, at: now });
    const ordinary = voiceQueue.filter((entry) => !entry.onStart).slice(-3);
    voiceQueue = voiceQueue.filter((entry) => entry.onStart || ordinary.includes(entry));
    playNextVoice();
  } else {
    const audio = new Audio(`/audios/${filename}.mp3`);
    audio.volume = audioLevels.effects * (filename === "skill_tieqi_horse" ? 0.6 : 0.7);
    activeSounds.add(audio);
    const finish = () => activeSounds.delete(audio);
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }

  // 【高能拦截】：如果打出了炸弹、王炸，或者只剩 1、2张牌，强制切入激情 BGM！
  if (["combo_bomb", "combo_rocket", "last_1", "last_2"].includes(filename)) {
    // 只有在放 Nomal (普通对局) 时才允许切 Exciting，防止重复打断
    if (!isExcitingPlaying && currentBGMName === "Normal") {
      playBGM("Exciting", false); // 激情音乐只放一遍
    }
  }
};

const getRankKey = (rank) => {
  if (rank === "小王") return "joker_small";
  if (rank === "大王") return "joker_big";
  return rank;
};

export const playCardAudio = (cards) => {
  if (!cards || cards.length === 0) return;
  const special = getCardFeedback(cards);
  const specialAudio = { bomb: "combo_bomb", rocket: "combo_rocket", airplane: "combo_plane", straight: "combo_straight", "straight-pair": "combo_straight_pair" };
  if (special) {
    playAudio(specialAudio[special.kind]);
    return;
  }

  const counts = {};
  cards.forEach((c) => {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
  });
  const freqs = Object.values(counts).sort((a, b) => b - a);
  const ranks = Object.keys(counts);
  const len = cards.length;

  let audioName = null;

  if (len === 1) {
    audioName = `single_${getRankKey(cards[0].rank)}`;
  } else if (len === 2) {
    if (freqs[0] === 2) audioName = `pair_${getRankKey(cards[0].rank)}`;
    else if (ranks.includes("小王") && ranks.includes("大王"))
      audioName = "combo_rocket";
  } else if (len === 3) {
    if (freqs[0] === 3) audioName = "combo_three";
  } else if (len === 4) {
    if (freqs[0] === 4) audioName = "combo_bomb";
    else if (freqs[0] === 3) audioName = "combo_three_one";
  } else if (len >= 5) {
    if (freqs[0] === 3) {
      if (len === 5 && freqs[1] === 2) audioName = "combo_three_pair";
      else if (freqs.filter((f) => f >= 3).length >= 2)
        audioName = "combo_plane";
    } else if (freqs.every((f) => f === 2)) {
      audioName = "combo_straight_pair";
    } else if (freqs.every((f) => f === 1)) {
      audioName = "combo_straight";
    }
  }

  playAudio(audioName);
};
