// The approved 顺手推牌 choreography is decorative and never sends game actions.
const random = (min, max) => min + Math.random() * (max - min);
const pick = values => values[Math.floor(Math.random() * values.length)];
function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function cardMarkup() {
  const suit = pick(['♠', '♥', '♣', '♦']), rank = pick(['A', '3', '7', 'J', 'K']);
  const corner = `<span class="card-corner">${rank}<small>${suit}</small></span>`;
  return `<div class="card-face ${'♥♦'.includes(suit) ? 'is-red' : ''}">${corner}<span class="card-pip">${suit}</span>${corner}</div>`;
}
const transform = (x, y, angle, scale = 1) => `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${angle}deg) scale(${scale})`;

export function createGardenCardPlay(stage, layer, options = {}) {
  const seats = [...stage.querySelectorAll('.seat.occupied')];
  const indices = seats.map(seat => Number(seat.dataset.seat));
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set(), jobs = new Set(), hands = new Map();
  let destroyed = false, running = false, onScreen = true, paused = !!options.paused, reduced = media.matches;
  let queue = [], lastSeat = null, lastPhrase = null, handNumber = 0;
  let resizeFrame = null, lastManual = -Infinity;

  function arm(job) {
    job.started = performance.now();
    job.id = setTimeout(() => {
      jobs.delete(job);
      if (!destroyed) job.run();
    }, Math.max(0, job.remaining));
  }
  function later(run, delay) {
    const job = { run, remaining: delay, started: 0, id: null };
    jobs.add(job);
    if (running) arm(job);
  }
  function clearJobs() {
    for (const job of jobs) clearTimeout(job.id);
    jobs.clear();
  }
  function animate(node, frames, timing, finished) {
    const animation = node.animate(frames, { fill: 'both', ...timing });
    animations.add(animation);
    animation.oncancel = () => animations.delete(animation);
    animation.onfinish = () => {
      animations.delete(animation);
      animation.cancel();
      if (!destroyed && node.isConnected) finished?.();
    };
    if (!running) animation.pause();
  }
  function removeHand(hand, immediate) {
    for (const animation of hand.getAnimations({ subtree: true })) {
      animations.delete(animation); animation.cancel();
    }
    if (immediate || !running) { hand.remove(); return; }
    animate(hand, [
      { opacity: 1, transform: 'translate(0,0)' },
      { opacity: 0, transform: 'translate(18px,8px)' },
    ], { duration: 280, easing: 'ease-in' }, () => hand.remove());
  }
  function clearVisuals() {
    for (const animation of animations) animation.cancel();
    // Cancel events are asynchronous; don't let pause/play revive a cancelled one.
    animations.clear();
    layer.replaceChildren(); hands.clear();
  }
  function geometry(index) {
    const bounds = stage.getBoundingClientRect();
    const avatar = stage.querySelector(`[data-seat="${index}"] .avatar-frame`).getBoundingClientRect();
    const mobile = innerWidth <= 700;
    const scale = mobile ? .67 : innerWidth > 1650 ? 1.15 : innerWidth <= 900 ? .85 : 1;
    const centre = { x: bounds.width * .5, y: bounds.height * (mobile ? .57 : .53) };
    const offsets = [[36, 6], [28, -12], [-24, -22], [-28, -12]];
    const landing = [[-10, -29], [-58, 8], [30, 32], [62, -8]][index];
    const geometry = {
      scale,
      origin: { x: avatar.x - bounds.x + avatar.width / 2 + offsets[index][0] * scale,
        y: avatar.y - bounds.y + avatar.height / 2 + offsets[index][1] * scale },
      target: { x: centre.x + landing[0] * scale + random(-7, 7) * scale,
        y: centre.y + landing[1] * scale + random(-5, 5) * scale },
    };
    if (index === 0) {
      const seat = stage.querySelector('[data-seat="0"]');
      const range = document.createRange(); range.selectNodeContents(seat.querySelector('.seat-name'));
      const labels = [range.getBoundingClientRect(), ...[...seat.querySelectorAll('.seat-role,.ready-mark')].map(node => node.getBoundingClientRect())];
      const cardWidth = innerWidth <= 700 ? 36 : innerWidth >= 1650 ? 62 : innerWidth <= 900 ? 46 : 54;
      const clearance = Math.hypot(cardWidth, cardWidth * 1.42) / 2 + 6;
      geometry.gate = { x: Math.max(...labels.map(rect => rect.right)) - bounds.x + clearance,
        y: Math.max(...labels.map(rect => rect.bottom)) - bounds.y + clearance };
      geometry.target.y = Math.max(geometry.target.y, geometry.gate.y + 6);
    }
    return geometry;
  }
  function deal(index, count, { still = false, hesitate = false } = {}) {
    if (destroyed || indices.length < 2) return;
    const { origin, target, scale, gate } = geometry(index);
    if (hands.has(index)) removeHand(hands.get(index), still);
    const hand = document.createElement('div');
    hand.className = 'play-hand'; hand.dataset.from = String(index); hand.dataset.hand = String(++handNumber);
    hand.dataset.userId = seats.find(seat => Number(seat.dataset.seat) === index).dataset.userId;
    layer.append(hand); hands.set(index, hand); lastSeat = index;
    const duration = random(460, 680), anticipation = hesitate ? random(320, 650) : 0, baseAngle = random(-11, 10);
    if (!still) animate(stage.querySelector(`[data-seat="${index}"] .avatar-frame img`), [
      { transform: 'translate(0,0) rotate(0)' },
      { transform: `translate(${index === 1 ? -2 : 1}px,1px) rotate(${index % 2 ? -3 : 3}deg)`, offset: .26 },
      { transform: 'translate(0,0) rotate(0)' },
    ], { duration: 460, delay: anticipation, easing: 'ease-out' });
    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'play-card'; card.innerHTML = cardMarkup(); hand.append(card);
      const end = { x: target.x + (i - (count - 1) / 2) * 21 * scale, y: target.y + random(-3, 3) * scale };
      const angle = baseAngle + (i - (count - 1) / 2) * 8;
      const finalTransform = transform(end.x, end.y, angle);
      card.style.transform = finalTransform;
      const settled = () => card.classList.add('is-settled');
      if (still) { settled(); continue; }
      const dx = end.x - origin.x, dy = end.y - origin.y;
      const frames = [
        { transform: transform(origin.x, origin.y, angle - 14, .72), opacity: 0, offset: 0 },
        { transform: transform(gate?.x ?? origin.x + dx * .15, origin.y + dy * .15, angle - 8), opacity: 1, offset: .20 },
        ...(gate ? [{ transform: transform(gate.x, gate.y, angle - 3), opacity: 1, offset: .52 }] : []),
        { transform: transform(end.x + dx * .035, end.y + dy * .035, angle + 2), opacity: 1, offset: .82 },
        { transform: finalTransform, opacity: 1, offset: 1 },
      ];
      animate(card, frames, { duration, delay: anticipation + i * 65, easing: 'cubic-bezier(.18,.66,.3,1)' }, settled);
    }
  }
  function phrase() {
    const cast = shuffle(indices);
    if (cast[0] === lastSeat) [cast[0], cast[1]] = [cast[1], cast[0]];
    const [a, b] = cast, c = cast[2] ?? a;
    const motif = pick(['exchange', 'think', 'rush', 'echo'].filter(value => value !== lastPhrase));
    lastPhrase = motif;
    const beat = (seat, count, delay, hesitate = false) => ({ seat, count, delay, hesitate });
    const gap = () => random(1100, 2400);
    if (motif === 'think') return [beat(a, pick([1, 2]), gap()), beat(b, 1, random(2800, 4300), true), beat(c, pick([2, 3]), gap())];
    if (motif === 'rush') return [beat(a, 2, gap()), beat(b, 1, random(650, 850)), beat(c, 3, random(700, 1050)), beat(b, 1, gap())];
    if (motif === 'echo') return [beat(a, 1, gap()), beat(b, 2, gap()), beat(a, pick([1, 3]), random(900, 1400), true)];
    return [beat(a, pick([1, 2, 3]), gap()), beat(b, pick([1, 2]), gap()), beat(c, pick([1, 3]), gap())];
  }
  function scheduleNext(initial = false) {
    if (destroyed || reduced || indices.length < 2) return;
    const newPhrase = queue.length === 0;
    if (newPhrase) queue = phrase();
    const beat = queue.shift();
    later(() => {
      const seat = beat.seat === lastSeat ? pick(indices.filter(value => value !== lastSeat)) : beat.seat;
      deal(seat, beat.count, { hesitate: beat.hesitate }); scheduleNext();
    }, initial ? 1250 : newPhrase ? random(2200, 4400) : beat.delay);
  }
  function seed() {
    if (indices.length < 2) return;
    for (const index of indices.slice(0, 2)) deal(index, index % 2 ? 1 : 2, { still: true });
  }
  function sync() {
    if (destroyed) return;
    if (media.matches !== reduced) {
      reduced = media.matches; clearJobs(); clearVisuals(); queue = []; seed();
      if (!reduced) scheduleNext(true);
    }
    const enabled = !paused && !reduced && !document.hidden && onScreen;
    if (enabled === running) return;
    running = enabled;
    if (running) {
      for (const job of jobs) arm(job);
      for (const animation of animations) animation.play();
    } else {
      for (const job of jobs) {
        clearTimeout(job.id); job.remaining = Math.max(0, job.remaining - (performance.now() - job.started));
      }
      for (const animation of animations) animation.pause();
    }
  }
  function resized() {
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { resizeFrame = null; clearVisuals(); seed(); });
  }
  const intersection = new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; sync(); });
  intersection.observe(stage);
  const resize = new ResizeObserver(resized);
  resize.observe(stage);
  // Width can cross a card-size breakpoint without changing the stage's size.
  window.addEventListener('resize', resized, { passive: true });
  document.addEventListener('visibilitychange', sync); media.addEventListener('change', sync);
  seed(); scheduleNext(true); sync();
  return {
    once() {
      if (destroyed || paused || indices.length < 2 || performance.now() - lastManual < 650) return;
      lastManual = performance.now();
      deal(pick(indices.filter(value => value !== lastSeat)), pick([1, 2, 3]), { still: !running });
    },
    setPaused(value) { paused = value; sync(); },
    destroy() {
      destroyed = true; clearJobs(); clearVisuals();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      intersection.disconnect(); resize.disconnect();
      window.removeEventListener('resize', resized);
      document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', sync);
    },
  };
}
