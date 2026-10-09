export function createTutorialDialogueAutoPlayer({ onAdvance, setTimer = setTimeout,
  clearTimer = clearTimeout, now = () => Date.now() }) {
  let key = "", timer = null, due = 0, remaining = null;
  let generation = 0, advanced = false, disposed = false;
  const clear = (preserve = false) => {
    generation++;
    if (timer !== null) {
      if (preserve) remaining = Math.max(0, due - now());
      clearTimer(timer); timer = null;
    }
  };
  return {
    update({ text, enabled, paused, voiceEnabled, hasVoice, status }) {
      if (disposed) return;
      const mode = voiceEnabled && hasVoice ? status === "ended" ? "ended" :
        status === "error" ? "reading" : "waiting" : "reading";
      const nextKey = text + "\0" + mode;
      if (key !== nextKey) {
        clear(); key = nextKey; remaining = null; advanced = false;
      }
      if (!enabled || !text) { clear(); remaining = null; advanced = false; return; }
      if (paused) { clear(true); return; }
      if (mode === "waiting" || advanced || timer !== null) return;
      const delay = remaining ?? (mode === "ended" ? 650 : Math.max(2500, Math.min(20000, Array.from(text).length * 140)));
      const current = generation;
      due = now() + delay;
      timer = setTimer(() => {
        if (disposed || current !== generation || advanced) return;
        timer = null; remaining = null; advanced = true;
        onAdvance();
      }, delay);
    },
    cancel() { clear(); remaining = null; advanced = true; },
    dispose() { clear(); disposed = true; },
  };
}
