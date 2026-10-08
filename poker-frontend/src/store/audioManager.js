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
let lastAudioName = "";
let lastAudioTime = 0;
const updateMusicVolume = () => {
  if (currentBGM) currentBGM.volume = audioLevels.music * (voiceAudio ? 0.38 : 1);
};
watch(audioLevels, () => {
  try { window.localStorage.setItem("poker:audio-levels", JSON.stringify(audioLevels)); } catch { /* Storage may be disabled. */ }
  setBattleSoundVolume(audioLevels.effects);
  updateMusicVolume();
  if (voiceAudio) voiceAudio.volume = audioLevels.voice;
}, { deep: true });
setBattleSoundVolume(audioLevels.effects);

export const stopGameAudio = () => {
  voiceQueue = [];
  for (const audio of activeSounds) { audio.pause(); audio.currentTime = 0; }
  activeSounds.clear();
  voiceAudio = null;
  stopCountdownAudio();
  stopBattleSounds();
  updateMusicVolume();
};

// ====== 1. 导出全局统一的声音状态与控制方法 ======
export const soundStatus = computed(() => isSoundOn.value);
export const toggleSound = () => {
  isSoundOn.value = !isSoundOn.value;
};

// ====== 2. 背景音乐 (BGM) 核心控制器 ======
let currentBGM = null;
let currentBGMName = "";
let isExcitingPlaying = false;
let countdownAudio = null;
export const stopCountdownAudio = () => {
  if (countdownAudio) {
    countdownAudio.pause();
    countdownAudio.currentTime = 0; // 进度归零
  }
};

// 监听全局声音开关：用户随时可以暂停/恢复 BGM
watch(isSoundOn, (newVal) => {
  if (!newVal) stopGameAudio();
  if (currentBGM) {
    if (newVal) {
      currentBGM.play().catch((e) => console.warn("恢复BGM失败:", e));
    } else {
      currentBGM.pause();
    }
  } else if (newVal && currentBGMName) {
    playBGM(currentBGMName);
  }
});

// 【核心机制】：现代浏览器严禁无交互自动播放，添加一次性点击解锁防线
const enableAudioOnInteraction = () => {
  if (currentBGMName && isSoundOn.value && (!currentBGM || currentBGM.paused)) {
    playBGM(currentBGMName);
  }
  document.removeEventListener("click", enableAudioOnInteraction);
};
document.addEventListener("click", enableAudioOnInteraction);

// 播放 BGM 的主方法
export const playBGM = (filename, loop = true) => {
  if (currentBGM) {
    currentBGM.pause();
    currentBGM = null;
  }
  currentBGMName = filename;

  if (!isSoundOn.value) return;

  currentBGM = new Audio(`/audios/${filename}.mp3`);
  currentBGM.loop = loop;
  updateMusicVolume();
  currentBGM.play().catch((e) => {
    console.warn(
      `BGM [${filename}] 被浏览器拦截，等待用户第一次点击屏幕自动恢复。`,
    );
  });

  // 如果播放的是激情音乐，监听播放结束事件
  if (filename === "Exciting") {
    isExcitingPlaying = true;
    currentBGM.onended = () => {
      isExcitingPlaying = false;
      // 激情音乐放完一遍后，如果游戏还没结束(BGM标识还是Exciting)，切回 Nomal
      if (currentBGMName === "Exciting") {
        playBGM("Normal", true);
      }
    };
  } else {
    isExcitingPlaying = false;
  }
};

// ====== 3. 音效播放与智能解析器 ======
const playNextVoice = () => {
  if (!isSoundOn.value || voiceAudio) return;
  let next;
  while (voiceQueue.length) {
    const candidate = voiceQueue.shift();
    if (Date.now() - candidate.at < 1500) { next = candidate; break; }
  }
  if (!next) return;
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
    voiceQueue = voiceQueue.slice(-3);
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
