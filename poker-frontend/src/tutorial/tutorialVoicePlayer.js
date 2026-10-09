export function getTutorialSubtitleLength(characterCount, cues, playback, revealed = false) {
  if (revealed || !cues.length || ["ended", "error"].includes(playback.status)) return characterCount;
  const time = Number.isFinite(playback.currentTime) ? playback.currentTime : 0;
  let left = 0, right = cues.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (cues[middle].time <= time) left = middle + 1;
    else right = middle;
  }
  return left ? Math.min(characterCount, cues[left - 1].end) : 0;
}

export function createTutorialVoicePlayer({ audio, onActiveChange = () => {}, onPlaybackChange = () => {},
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) }) {
  let source = "", enabled = true, paused = false, finished = true, blocked = false;
  let generation = 0, attempt = 0, disposed = false, active = false;
  let status = "idle", duration = 0, currentTime = 0;
  let frame = null;
  const stopClock = () => { if (frame !== null) cancelFrame?.(frame); frame = null; };
  const publish = (value = status, readClock = true) => {
    status = value;
    if (readClock) currentTime = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
    onPlaybackChange({ source, status, currentTime, duration });
  };
  const setActive = (value) => {
    if (active === value) return;
    active = value;
    onActiveChange(value);
  };
  const pause = () => {
    attempt++; stopClock(); audio.pause(); setActive(false);
    if (source && !finished) publish(enabled ? "paused" : "muted");
  };
  const resume = () => {
    if (disposed || !source || !enabled || paused || finished) return;
    blocked = false;
    const current = generation, playback = ++attempt;
    const failed = (error) => {
      if (current !== generation || playback !== attempt || disposed) return;
      blocked = error?.name === "NotAllowedError";
      if (!blocked) finished = true;
      stopClock();
      setActive(false);
      publish(blocked ? "blocked" : "error");
    };
    publish("loading");
    setActive(true);
    try { audio.play()?.catch(failed); }
    catch (error) { failed(error); }
  };
  const stop = () => {
    generation++;
    pause();
    source = ""; finished = true; blocked = false;
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null;
    audio.ontimeupdate = null; audio.onplaying = null; audio.onwaiting = null; audio.onpause = null;
    duration = 0; currentTime = 0;
    publish("idle", false);
  };
  return {
    play(url) {
      if (disposed || source === url) return;
      stop();
      if (!url) return;
      source = url; finished = false;
      audio.src = url;
      const current = generation;
      const valid = () => current === generation && !disposed;
      const finish = (value) => {
        if (current !== generation || disposed) return;
        stopClock();
        finished = true; blocked = false; setActive(false);
        publish(value);
      };
      audio.onended = () => finish("ended"); audio.onerror = () => finish("error");
      audio.onloadedmetadata = () => {
        if (!valid()) return;
        duration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0;
        publish();
      };
      audio.ontimeupdate = () => { if (valid() && !finished) publish(); };
      audio.onplaying = () => {
        if (!valid() || finished || !enabled || paused) return;
        setActive(true); publish("playing");
        if (frame !== null || !requestFrame) return;
        const tick = () => {
          frame = null;
          if (!valid() || finished || !enabled || paused || audio.paused || status !== "playing") return;
          publish();
          frame = requestFrame(tick);
        };
        frame = requestFrame(tick);
      };
      audio.onwaiting = () => {
        if (!valid() || finished || !enabled || paused) return;
        stopClock(); setActive(false); publish("loading");
      };
      audio.onpause = () => {
        if (valid() && !finished && audio.paused) { stopClock(); setActive(false); publish(enabled ? "paused" : "muted"); }
      };
      publish(!enabled ? "muted" : paused ? "paused" : "loading", false);
      resume();
    },
    setEnabled(value) {
      if (enabled === value) return;
      enabled = value;
      if (enabled) resume(); else pause();
    },
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (paused) pause(); else resume();
    },
    setVolume(value) { audio.volume = Math.max(0, Math.min(1, value)); },
    retry() { if (blocked) resume(); },
    stop,
    dispose() { stop(); disposed = true; },
  };
}
