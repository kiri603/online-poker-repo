// Layout measurements only: no game state or network side effects.
export function readViewport(win, previous) {
  const viewport = win.visualViewport;
  if (viewport && Math.abs((viewport.scale ?? 1) - 1) > 0.01) {
    return previous || { width: win.innerWidth, height: win.innerHeight, left: 0, top: 0 };
  }
  const rect = {
    width: viewport?.width ?? win.innerWidth,
    height: viewport?.height ?? win.innerHeight,
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
  };
  if (!(rect.width > 0 && rect.height > 0) || !Object.values(rect).every(Number.isFinite)) {
    return previous;
  }
  return rect;
}

export function observeViewport(win, update) {
  let previous;
  let frame = null;
  const measure = () => {
    frame = null;
    const rect = readViewport(win, previous);
    if (rect && (!previous || Object.keys(rect).some(key => rect[key] !== previous[key]))) {
      previous = rect;
      update(rect);
    }
  };
  const schedule = () => {
    if (frame === null && win.document.visibilityState !== 'hidden') {
      frame = win.requestAnimationFrame(measure);
    }
  };
  const events = [[win, 'resize'], [win, 'pageshow'], [win.document, 'visibilitychange']];
  if (win.visualViewport) events.push([win.visualViewport, 'resize'], [win.visualViewport, 'scroll']);
  events.forEach(([target, name]) => target.addEventListener(name, schedule));
  measure();
  return () => {
    events.forEach(([target, name]) => target.removeEventListener(name, schedule));
    if (frame !== null) win.cancelAnimationFrame(frame);
  };
}
