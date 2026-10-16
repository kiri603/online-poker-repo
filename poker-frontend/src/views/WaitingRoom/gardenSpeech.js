// The approved speech balloon uses one closed outline, including its pointer.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function speechOutline(width, height, side, tail) {
  const cx = width / 2, cy = height / 2, rx = cx - .75, ry = cy - .75;
  let angle, tip;
  if (side === 'right' || side === 'left') {
    const offset = Math.asin(clamp((tail - cy) / ry, -.85, .85));
    angle = side === 'right' ? Math.PI - offset : offset;
    tip = [side === 'right' ? -9 : width + 9, tail];
  } else {
    const offset = Math.acos(clamp((tail - cx) / rx, -.85, .85));
    angle = side === 'above' ? offset : -offset;
    tip = [tail, side === 'above' ? height + 9 : -9];
  }
  const opening = Math.min(.42, 7 / Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle)));
  const point = t => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  const pair = point => point.map(value => value.toFixed(2)).join(' ');
  return `M ${pair(point(angle + opening))} A ${rx} ${ry} 0 1 1 ${pair(point(angle - opening))} L ${pair(tip)} Z`;
}

export function positionSpeech(root, bubble, userId) {
  const seat = [...root.querySelectorAll('.seat[data-user-id]')].find(node => node.dataset.userId === userId);
  const account = root.querySelector('.self-avatar');
  const anchor = seat?.querySelector('.avatar-frame') || (account?.dataset.userId === userId ? account : null);
  if (!anchor || !bubble) return null;
  const avatar = anchor.getBoundingClientRect(), bounds = root.getBoundingClientRect();
  const contentTop = bounds.top - root.scrollTop;
  const style = getComputedStyle(bubble), width = parseFloat(style.width), height = parseFloat(style.height);
  if (!width || !height) return null;
  const cx = avatar.left + avatar.width / 2, cy = avatar.top + avatar.height / 2, gap = 12;
  const candidates = {
    right: { x: avatar.right + gap, y: cy - height / 2 },
    above: { x: cx - width / 2, y: avatar.top - height - gap },
    left: { x: avatar.left - width - gap, y: cy - height / 2 },
    below: { x: cx - width / 2, y: avatar.bottom + gap },
  };
  const areas = [...root.querySelectorAll('.avatar-frame,.self-avatar,.seat-role,.ready-mark,.ink-title,.mode-summary,.room-settings-action,.room-code')].map(node => node.getBoundingClientRect());
  for (const name of root.querySelectorAll('.seat-name')) {
    const range = document.createRange(); range.selectNodeContents(name); areas.push(range.getBoundingClientRect());
  }
  const art = root.querySelector('.mascot img')?.getBoundingClientRect();
  if (art) areas.push({ left: art.left + art.width * .15, right: art.left + art.width * .62, top: art.top, bottom: art.top + art.height * .31 });
  const preferred = root.clientWidth <= 700 ? ['above','right','left','below'] : ['right','above','left','below'];
  const options = preferred.map(side => ({ side, ...candidates[side] }));
  for (const side of ['right','left']) for (const offset of [-avatar.height / 2, avatar.height / 2]) options.push({ side, x: candidates[side].x, y: candidates[side].y + offset });
  const placements = options.map((original, rank) => {
    const x = clamp(original.x, bounds.left + 10, bounds.right - width - 10);
    const y = clamp(original.y, contentTop + 10, contentTop + root.scrollHeight - height - 10);
    const overlap = areas.reduce((total, area) => total + Math.max(0, Math.min(x + width, area.right) - Math.max(x, area.left)) * Math.max(0, Math.min(y + height, area.bottom) - Math.max(y, area.top)), 0);
    return { side: original.side, x, y, score: overlap * 10 + Math.abs(x-original.x) + Math.abs(y-original.y) + rank };
  });
  const best = placements.sort((a,b) => a.score-b.score)[0];
  const vertical = ['left','right'].includes(best.side);
  const tail = clamp(vertical ? cy-best.y : cx-best.x, 16, (vertical ? height : width)-18);
  return {
    width, height, path: speechOutline(width,height,best.side,tail),
    style: { left: `${best.x-bounds.left+root.scrollLeft}px`, top: `${best.y-bounds.top+root.scrollTop}px`, transformOrigin: vertical ? `${best.side==='right'?'left':'right'} ${tail}px` : `${tail}px ${best.side==='above'?'bottom':'top'}` },
  };
}
