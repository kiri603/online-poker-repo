export const UI_THEME_KEY = 'poker:ui-theme';
export const UI_THEMES = Object.freeze([
  { id: 'original', name: '原版', preview: '/images/themes/original-login-cover.png' },
  { id: 'pop', name: '简约波普', preview: '/images/themes/pop-login-cover.png' },
]);

export const normalizeUiTheme = (value) => value === 'pop' ? 'pop' : 'original';
export function readUiTheme(storage) {
  try { return normalizeUiTheme(storage?.getItem(UI_THEME_KEY)); }
  catch { return 'original'; }
}
export function saveUiTheme(theme, storage) {
  try {
    if (!storage) return false;
    storage.setItem(UI_THEME_KEY, normalizeUiTheme(theme));
    return true;
  } catch { return false; }
}
