import { nextTick, ref } from 'vue';
import { UI_THEMES, normalizeUiTheme, readUiTheme, saveUiTheme } from './uiPreferences.js';

const deviceStorage = () => {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
};
export const uiTheme = ref(readUiTheme(deviceStorage()));
export const settingsOpen = ref(false);
export const themes = UI_THEMES;
const paintTheme = () => {
  if (typeof document !== 'undefined') document.documentElement.dataset.uiTheme = uiTheme.value;
};
paintTheme();

export const openSettings = () => { settingsOpen.value = true; };
export const closeSettings = () => { settingsOpen.value = false; };
let themeTransition, themeGeneration = 0;
export const applyUiTheme = (theme) => {
  const nextTheme = normalizeUiTheme(theme);
  const saved = saveUiTheme(nextTheme, deviceStorage());
  const generation = ++themeGeneration;
  const update = () => { if (generation === themeGeneration) { uiTheme.value = nextTheme;paintTheme(); }return nextTick(); };
  themeTransition?.skipTransition();
  if (nextTheme === uiTheme.value) return saved;
  if (typeof document !== 'undefined' && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    themeTransition = document.startViewTransition(update);
    themeTransition.ready.catch(() => {});
  } else {
    update();
  }
  return saved;
};
