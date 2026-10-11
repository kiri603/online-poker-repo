// Run against the local dev server. API and sockets are isolated from real games.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium, firefox, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const engine = { chromium, firefox, webkit }[process.env.LAYOUT_BROWSER || 'chromium'];
const browser = await engine.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 660 }, hasTouch: true });
const errors = [];
const messages = [];
let socket;
let guest = true;
let started = true;
let authenticated = true;
const cards = Array.from({ length: 16 }, (_, i) => ({ suit: i < 13 ? '♠' : '♥', rank: ['3','4','5','6','7','8','9','10','J','Q','K','A','2'][i % 13], weight: i % 13 + 1 }));
// Layout tests also exercise system font fallback without waiting for third-party CDNs.
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
function state(overrides = {}) {
  const now = Date.now();
  return { event: 'SYNC_STATE', phase: 'PLAYING', isStarted: started, currentTurn: 'layout-preview', currentTurnStartTime: now, serverTime: now,
    currentAoeType: '', ownerId: 'layout-preview', players: ['layout-preview','Opponent-one','Opponent-two','Opponent-three'].map((userId, i) => ({ userId, status: 'PLAYING', isReady: true, cardCount: 14, skill: i ? 'GUANXING' : 'KUROU' })),
    spectators: [], settings: { enableSkills: true }, tableCards: cards.slice(0, 5), lastPlayPlayer: 'Opponent-one', ...overrides };
}
const send = value => socket.send(JSON.stringify(value));
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const data = path === '/api/auth/me' ? { id: 'layout-preview', username: 'layout-preview', guest, level: 1, avatarId: 'xiaotao' }
    : path === '/api/rooms' ? [1234, 2345, 3456].map(roomId => ({ roomId: String(roomId), playerCount: 2, status: 'WAITING' })) : path === '/api/rooms/check' ? { exists: true, isPrivate: false } : {};
  await route.fulfill({ status: path === '/api/auth/me' && !authenticated ? 401 : 200, contentType: 'application/json', body: JSON.stringify(data) });
});
await context.routeWebSocket('**', ws => {
  socket = ws;
  ws.onMessage(raw => {
    const message = JSON.parse(raw);
    messages.push(message);
    if (message.type === 'JOIN_ROOM') { send(state()); send({ event: 'SYNC_HAND', cards: cards.slice(0, 14) }); }
    else if (message.type === 'RETURN_TO_ROOM') { send({ event: 'ROOM_RESET' }); send(state({ isStarted: false, phase: 'WAITING', players: state().players.map(player => ({ ...player, status: 'WAITING' })) })); }
    else if (message.type === 'PING') send({ event: 'PONG', serverTime: Date.now() });
  });
});
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });
const browserName = process.env.LAYOUT_BROWSER || 'chromium';
const outputDirectory = `../temp-screenshots/mobile-acceptance/${browserName}`;
await mkdir(outputDirectory, { recursive: true });
const viewports = [[320,480],[360,640],[390,660],[430,740],[568,240],[667,280],[768,390],[844,280],[479,640],[480,640],[767,390],[1023,768],[1024,768],[1366,768],[1440,900],[393,852],[852,393],[956,440],[667,375],[375,667],[440,956],[480,320],[640,360],[660,390],[740,430]];
const demonstrationSizes = new Set(['320x480','480x320','375x667','667x375','393x852','852x393','440x956','956x440','1366x768','1440x900']);
const results = [];
let failure = null;
page.setDefaultTimeout(8000);
console.log(`Browser: ${process.env.LAYOUT_BROWSER || 'chromium'} ${browser.version()}`);
page.on('pageerror', error => errors.push(error.message));
const url = process.env.LAYOUT_URL || 'http://127.0.0.1:5173/';
async function settle() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function lobby() {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.lobby-shell').waitFor();
  const acknowledge = page.getByRole('button', { name: '我知道了', exact: true });
  if (await acknowledge.isVisible()) await acknowledge.click();
}
async function join() {
  await lobby();
  await page.getByPlaceholder('请输入 4~6 位房间号').fill('1234');
  await page.getByRole('button', { name: '加入 / 创建房间', exact: true }).click();
  if (started) {
    await page.locator('.gb-hand > .card').first().waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.gb-action-bar')).display === 'flex');
  } else await page.locator('.wh-shell').waitFor();
  await settle();
}
async function geometry() {
  return page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const board = document.querySelector('.gb-shell');
    const hand = document.querySelector('.gb-hand');
    const arena = document.querySelector('.gb-arena');
    return { board: rect(board), hand: rect(hand), arena: rect(arena), arenaScroll: arena.scrollHeight - arena.clientHeight,
      action: rect(document.querySelector('.gb-action-bar, .gb-spectator-hint')),
      exit: board.querySelector('.exit-btn') ? rect(board.querySelector('.exit-btn')) : null,
      remaining: rect(board.querySelector('.gb-count-chip')),
      remainingFont: parseFloat(getComputedStyle(board.querySelector('.gb-count-chip .num')).fontSize),
      cards: [...hand.querySelectorAll(':scope > .card')].map(rect),
      buttons: [...board.querySelectorAll('.gb-action-bar button, .gb-tools button, .exit-btn')].map(rect),
      viewport: { width: innerWidth, height: innerHeight } };
  });
}
async function inViewport(selector) {
  const rect = await page.locator(selector).first().boundingBox();
  assert.ok(rect, selector);
  const { width, height } = page.viewportSize();
  contains({ x: 0, y: 0, right: width, bottom: height }, { ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height }, selector);
}
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded(); await settle();
  assert.ok(await locator.evaluate(element => {
    const r = element.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1) return false;
    return [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 5, r.y + r.height / 2], [r.right - 5, r.y + r.height / 2], [r.x + r.width / 2, r.y + 5], [r.x + r.width / 2, r.bottom - 5]].every(([x,y]) => element.contains(document.elementFromPoint(x,y)));
  }), `unreachable control: ${await locator.textContent()}`);
}
async function recordView(name, selector) {
  const { width, height } = page.viewportSize();
  await inViewport(selector);
  const capture = demonstrationSizes.has(`${width}x${height}`) || (name.startsWith('game-') && ['568x240', '844x280'].includes(`${width}x${height}`));
  const screenshot = capture ? `${name}-${width}x${height}.png` : null;
  if (screenshot) await page.screenshot({ path: `${outputDirectory}/${screenshot}`, animations: 'disabled' });
  results.push({ page: name, width, height, status: 'passed', screenshot });
}
function contains(outer, inner, label) {
  assert.ok(inner.x >= outer.x - 1 && inner.right <= outer.right + 1 && inner.y >= outer.y - 1 && inner.bottom <= outer.bottom + 1, `${label}: ${JSON.stringify({ outer, inner })}`);
}
async function checkLobbyLayout() {
  const { width, height } = page.viewportSize();
  const measurements = await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
    return { main: rect('.lobby-main'), menu: rect('.lobby-side-buttons'), hint: rect('.room-entry-hint'),
      panels: ['.lobby-stage', '.room-entry-card', '.room-list-card'].map(rect) };
  });
  for (const panel of measurements.panels) assert.ok(panel.x >= -1 && panel.right <= width + 1, 'lobby panel exceeds horizontal viewport');
  if (width <= 768 && width <= height) assert.ok(measurements.menu.bottom <= measurements.main.y + 1, 'portrait menu overlaps room content');
  const { menu, hint } = measurements;
  assert.ok(menu.right <= hint.x || hint.right <= menu.x || menu.bottom <= hint.y || hint.bottom <= menu.y, 'menu covers room instructions');
}
async function checkAuthLayout() {
  const { width, height } = page.viewportSize();
  const row = await page.locator('.auth-cta-row').boundingBox();
  assert.ok(row.y >= height * .68 && row.y + row.height >= height - 40, 'auth actions cover central artwork instead of docking at bottom');
  for (const button of await page.locator('.auth-cta-row button').all()) await reachable(button);
  if (width > height) assert.ok(await page.locator('.auth-shell').evaluate(el => {
    const s = getComputedStyle(el, '::before');
    return s.backgroundImage.includes('auth-bg.png') && s.backgroundSize === 'contain';
  }), 'landscape login artwork is cropped');
}
async function checkSkillLayout() {
  await inViewport('.skill-title'); await inViewport('.skill-timer-wrapper');
  for (const card of await page.locator('.skill-card').all()) {
    await reachable(card);
    assert.ok(await card.evaluate(el => {
      const r = el.getBoundingClientRect(), h = el.querySelector('h3').getBoundingClientRect(), p = el.querySelector('p').getBoundingClientRect();
      return r.height <= h.height + p.height + 64 && parseFloat(getComputedStyle(el.querySelector('p')).fontSize) >= 12;
    }), 'skill card stretches into empty space or text is too small');
  }
  await page.locator('.skills-container').evaluate(el => { el.scrollTop = 0; }); await settle();
}
async function checkWinningCards() {
  for (const card of await page.locator('.winning-display .card').all()) {
    await card.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await settle();
    const clipped = await card.evaluate(el => {
      const r = el.getBoundingClientRect();
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), c = p.getBoundingClientRect();
        if (/(auto|hidden|scroll|clip)/.test(s.overflowX) && (r.left < c.left - 1 || r.right > c.right + 1)) return { parent: p.className, axis: 'x', card: r.toJSON(), container: c.toJSON() };
        if (/(auto|hidden|scroll|clip)/.test(s.overflowY) && (r.top < c.top - 1 || r.bottom > c.bottom + 1)) return { parent: p.className, axis: 'y', card: r.toJSON(), container: c.toJSON() };
      }
      return null;
    });
    assert.equal(clipped, null, `winning card cropped: ${JSON.stringify(clipped)}`);
    assert.ok(await card.evaluate(el => {
      const r = el.getBoundingClientRect(), m = document.querySelector('.gb-result-mascot-img').getBoundingClientRect();
      return r.right <= m.left || m.right <= r.left || r.bottom <= m.top || m.bottom <= r.top;
    }), 'settlement mascot covers winning card');
  }
  await page.locator('.winning-display').evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0; });
  await page.locator('.gb-gameover-wrap .modal-content').evaluate(el => { el.scrollTop = 0; }); await settle();
  await inViewport('.gb-gameover-wrap h2'); await reachable(page.locator('.return-room-btn'));
  if (await page.locator('.winning-display .card').count() <= 8) {
    assert.ok(await page.locator('.winning-display .card').evaluateAll(cards => cards.every(el => {
      const r = el.getBoundingClientRect(), p = el.closest('.winning-display').getBoundingClientRect();
      return r.top >= p.top - 1 && r.bottom <= p.bottom + 1;
    })), 'initial settlement view crops one of eight winning cards');
  }
}
try {
  await lobby();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await checkLobbyLayout();
    if (width > height && height <= 540) { await inViewport('.room-entry-card'); await inViewport('.room-list-card'); }
    if (width > height && height >= 375 && height <= 540) {
      assert.ok(await page.locator('.lobby-shell').evaluate(el => getComputedStyle(el, '::before').backgroundImage.includes('lobby-bg.png')), 'landscape uses portrait artwork');
      for (const selector of ['.room-entry-hint', '.room-entry-action', '.room-list-title', '.side-btn']) {
        assert.ok(await page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 14), `${selector} landscape text too small`);
      }
      const entry = await page.locator('.room-entry-card').boundingBox();
      assert.ok(entry.height <= height * .65, 'landscape entry panel has excessive empty space');
    }
    await reachable(page.locator('.room-entry-action'));
    await reachable(page.locator('.room-list-refresh'));
    for (const button of await page.locator('.room-card-join, .side-btn').all()) await reachable(button);
    await page.locator('.lobby-main').evaluate(el => { el.scrollTop = 0; });
    await page.locator('.room-list').evaluate(el => { el.scrollTop = 0; });
    await recordView('lobby', '.lobby-shell');
  }
  await join();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const count of [1,8,14,16]) {
      send({ event: 'SYNC_HAND', cards: cards.slice(0, count) });
      await page.waitForFunction(n => document.querySelectorAll('.gb-hand > .card').length === n, count);
      await settle();
      const g = await geometry();
      contains({ x: 0, y: 0, right: width, bottom: height }, g.board, 'board');
      assert.ok(g.arena.bottom <= g.action.y + 1, 'arena/action overlap');
      assert.ok(g.action.bottom <= g.hand.y + 1, 'action/hand overlap');
      assert.ok(g.exit.x <= g.board.x + 12 && g.exit.y <= g.board.y + 12, 'exit must stay in the top left');
      assert.ok(g.exit.bottom < g.action.y, 'exit is too close to play actions');
      assert.ok(g.remaining.x >= g.action.right - 1, 'remaining count must be to the right of play actions');
      assert.ok(g.remaining.y < g.action.bottom && g.remaining.bottom > g.action.y, 'remaining count must align with play actions');
      contains(g.board, g.remaining, 'remaining count');
      assert.ok(g.remainingFont >= 20, 'remaining count number is too small');
      assert.equal(await page.locator('.gb-count-chip .num').textContent(), String(count));
      assert.ok(await page.locator('.gb-count-chip').evaluate(el => {
        const children = [...el.children].map(child => child.getBoundingClientRect());
        return el.children.length === 4 && children.every((rect, i) => !i || rect.top >= children[i - 1].bottom - 1);
      }), 'remaining count must read vertically');
      assert.ok(await page.evaluate(() => {
        const button = document.querySelector('.exit-btn');
        const r = button.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button;
      }), 'exit is blocked at its actual hit location');
      for (const card of g.cards) contains(g.hand, card, `${width}x${height}, ${count} cards`);
      for (const button of g.buttons) { contains(g.board, button, `button ${width}x${height}, ${count} cards; action=${JSON.stringify(g.action)}, hand=${JSON.stringify(g.hand)}`); assert.ok(button.height >= 36, 'touch target under 36px'); }
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('.gb-hand > .card')].every(card => {
        const r = card.getBoundingClientRect();
        return document.elementFromPoint(r.x + 4, r.y + 20)?.closest('.card') === card;
      })), 'card strip blocked at actual hit location');
    }
    await recordView('game-playing', '.gb-shell');
    console.log(`PASS ${width}x${height}: 1/8/14/16 cards`);
  }
  await page.setViewportSize({ width: 390, height: 660 });
  send(state());
  send({ event: 'SYNC_HAND', cards: cards.slice(0, 14) });
  await page.waitForFunction(() => document.querySelectorAll('.gb-hand > .card').length === 14);
  await settle();
  const g = await geometry();
  await page.mouse.click(g.cards[0].x + 5, g.cards[0].y + 20);
  assert.equal(await page.locator('.gb-hand > .selected').count(), 1);
  const before = messages.filter(m => m.type !== 'PING').length;
  await page.setViewportSize({ width: 844, height: 280 }); await settle();
  await page.setViewportSize({ width: 320, height: 480 }); await settle();
  assert.equal(await page.locator('.gb-hand > .selected').count(), 1, 'resize cleared selection');
  assert.equal(messages.filter(m => m.type !== 'PING').length, before, 'resize sent game message');
  await page.getByRole('button', { name: '退出房间', exact: true }).click();
  await page.locator('.gb-exit-dialog[open]').waitFor();
  await page.getByRole('button', { name: '留在房间', exact: true }).click();
  assert.equal(await page.locator('.gb-hand > .selected').count(), 1);
  await mkdir('../temp-screenshots', { recursive: true });
  await page.screenshot({ path: '../temp-screenshots/mobile-layout-320.png' });
  await page.setViewportSize({ width: 844, height: 280 }); await settle();
  await page.screenshot({ path: '../temp-screenshots/mobile-layout-844.png' });
  await page.setViewportSize({ width: 1366, height: 768 }); await settle();
  await page.screenshot({ path: '../temp-screenshots/board-controls-1366.png' });
  await page.setViewportSize({ width: 844, height: 280 }); await settle();
  send(state({ tableCards: [] }));
  send({ event: 'SYNC_HAND', cards: cards.slice(0,8) }); await settle();
  const playable = (await geometry()).cards[0];
  await page.mouse.click(playable.x + 4, playable.y + 20);
  await page.getByRole('button', { name: '出牌', exact: true }).click();
  assert.ok(messages.some(message => message.type === 'PLAY_CARD'), 'normal play did not reach socket');

  // Four-sided safe area and a visual viewport smaller than the layout viewport.
  await page.setViewportSize({ width: 390, height: 660 });
  await page.evaluate(() => {
    for (const [edge, value] of Object.entries({ top: 24, right: 12, bottom: 20, left: 12 })) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`);
  }); await settle();
  let safe = await geometry();
  assert.equal(safe.board.x, 12); assert.equal(safe.board.right, 378); assert.equal(safe.board.bottom, 640);
  await page.getByRole('button', { name: '退出房间', exact: true }).click();
  await inViewport('.gb-exit-dialog[open]');
  await page.getByRole('button', { name: '留在房间', exact: true }).click();
  await page.evaluate(() => {
    window.__nativeViewport = window.visualViewport;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { width: 390, height: 420, offsetTop: 32, offsetLeft: 0, scale: 1 } });
    window.dispatchEvent(new Event('resize'));
  }); await settle();
  assert.equal((await geometry()).board.bottom, 432);
  await page.getByRole('button', { name: '退出房间', exact: true }).click();
  const exit = await page.locator('.gb-exit-dialog[open]').boundingBox();
  assert.ok(exit.y >= 56 && exit.y + exit.height <= 432, 'exit dialog outside visual safe area');
  await page.getByRole('button', { name: '留在房间', exact: true }).click();
  await page.evaluate(() => { window.visualViewport.scale = 2; window.visualViewport.height = 210; window.dispatchEvent(new Event('resize')); }); await settle();
  assert.equal((await geometry()).board.bottom, 432, 'pinch zoom changed layout');
  await page.evaluate(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__nativeViewport });
    for (const edge of ['top','right','bottom','left']) document.documentElement.style.removeProperty(`--safe-${edge}`);
    window.dispatchEvent(new Event('pageshow'));
  }); await settle();
  console.log('PASS normal play, safe area, keyboard rectangle, pinch zoom and restore');

  // Existing skill and scroll events exercise overlays without changing protocols.
  for (const [width, height] of [[320,480],[375,667],[393,852],[440,956],[568,240],[667,375],[852,393],[956,440],[844,280],[1366,768],[1440,900]]) {
    await page.setViewportSize({ width, height });
    for (const count of [1,2,8,14,16]) {
      send(state({ players: state().players.map(player => ({ ...player, cardCount: count })) })); await settle();
      await page.waitForFunction(n => document.querySelector('.card-backs').children.length === n, count); await settle();
      assert.ok(await page.locator('.card-backs').evaluateAll(strips => strips.every(strip => {
        const box = strip.getBoundingClientRect();
        const backs = [...strip.children].map(card => card.getBoundingClientRect());
        return backs.every((r, i) => r.left >= box.left - 1 && r.right <= box.right + 1 && (!i || r.left >= backs[i - 1].left + .5));
      })), 'opponent card backs are cropped or indistinguishable');
    }
    for (const count of [1,8,14,16]) {
      send(state({ tableCards: cards.slice(0, count) })); await settle();
      await page.locator('.played-cards .card').last().scrollIntoViewIfNeeded();
      await inViewport('.played-cards .card:last-child');
    }
    send(state({ phase: 'SKILL_SELECTION' }));
    await page.locator('.skill-overlay').waitFor(); await settle();
    await inViewport('.skill-title');
    const skills = page.locator('.skill-card');
    for (let i = 0; i < await skills.count(); i++) {
      await skills.nth(i).scrollIntoViewIfNeeded();
      assert.ok(await skills.nth(i).isVisible());
    }
    await checkSkillLayout();
    await recordView('game-skill-selection', '.skill-overlay');
    send(state({ currentAoeType: 'WGFD', pendingAoePlayers: ['layout-preview'], aoeInitiator: 'layout-preview', aoeStartTime: Date.now(), settings: { enableSkills: true, wgfdCards: cards.slice(0,4) } }));
    await page.locator('.wgfd-content').waitFor(); await settle();
    await page.locator('.wgfd-confirm-btn').scrollIntoViewIfNeeded(); await inViewport('.wgfd-confirm-btn');
    await recordView('game-wugufengdeng', '.wgfd-content');
    send(state({ currentAoeType: 'GUANXING', pendingAoePlayers: ['layout-preview'], aoeInitiator: 'layout-preview', aoeStartTime: Date.now() }));
    send({ event: 'GUANXING_SHOW', cards: cards.slice(0,5) });
    await page.locator('.guanxing-content').waitFor(); await settle();
    await page.locator('.guanxing-content .wgfd-confirm-btn').scrollIntoViewIfNeeded(); await inViewport('.guanxing-content .wgfd-confirm-btn');
    await recordView('game-guanxing', '.guanxing-content');
    for (const currentAoeType of ['WJQF', 'NMRQ']) {
      send(state({ currentAoeType, pendingAoePlayers: ['layout-preview'], aoeInitiator: 'Opponent-one', aoeStartTime: Date.now() }));
      await page.locator('.skill-action-overlay').waitFor({ state: 'hidden' });
      await page.locator(`.gb-phase-cards img[src$="${currentAoeType}.png"]`).waitFor(); await settle();
      await inViewport('.gb-action-bar');
      const card = await page.locator('.gb-phase-cards .card').boundingBox();
      contains((await geometry()).arena, { ...card, right: card.x + card.width, bottom: card.y + card.height }, `${currentAoeType} full card`);
      if (width > height && height >= 375) {
        assert.ok(card.height >= 80, `${currentAoeType} landscape card too small: ${card.height}`);
        const arena = (await geometry()).arena;
        for (const seat of await page.locator('.gb-seat').all()) {
          const r = await seat.boundingBox(); contains(arena, { ...r, right: r.x + r.width, bottom: r.y + r.height }, 'complete opponent seat');
        }
        assert.equal(await page.locator('.gb-arena').evaluate(el => el.scrollTop), 0, 'scroll response hides the top seats');
      }
      await recordView(`game-${currentAoeType.toLowerCase()}`, '.gb-shell');
    }
    send({ event: 'SYNC_HAND', cards: [] });
    for (const eliminated of [false, true]) {
      const snapshot = state({ currentAoeType: 'WJQF', pendingAoePlayers: ['Opponent-two'], aoeInitiator: 'Opponent-one', aoeStartTime: Date.now(), spectators: eliminated ? [] : ['layout-preview'] });
      if (eliminated) snapshot.players[0].status = 'LOST';
      send(snapshot); await page.locator('.gb-spectator-hint').waitFor(); await settle();
      await inViewport('.gb-spectator-hint');
      const hint = await page.locator('.gb-spectator-hint').boundingBox();
      const region = await page.locator('.gb-action-region').boundingBox();
      assert.ok(Math.abs(hint.x + hint.width / 2 - region.x - region.width / 2) <= 1, 'spectator hint is not centered');
      assert.equal(await page.locator('.gb-hand').isVisible(), false, 'spectator reserves an empty hand area');
      const card = await page.locator('.gb-phase-cards .card').boundingBox();
      contains((await geometry()).arena, { ...card, right: card.x + card.width, bottom: card.y + card.height }, 'spectator full scroll card');
      await recordView(eliminated ? 'game-eliminated' : 'game-spectator', '.gb-shell');
    }
    send(state());
    send({ event: 'SYNC_HAND', cards: cards.slice(0, 8) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const won of [true, false]) {
      send({ event: 'GAME_OVER', winner: won ? 'layout-preview' : 'Opponent-one', winningCards: won ? cards.slice(0,8) : [] });
      await page.locator('.gb-gameover-wrap').waitFor();
      await page.locator('.gb-result-mascot-img').evaluate(img => img.decode());
      await page.locator('.gb-result-footer').scrollIntoViewIfNeeded(); await settle();
      if (won) {
        for (const count of [1, 8, 14, 16]) {
          send({ event: 'GAME_OVER', winner: 'layout-preview', winningCards: cards.slice(0, count) }); await settle();
          await checkWinningCards();
        }
        send({ event: 'GAME_OVER', winner: 'layout-preview', winningCards: cards.slice(0, 8) }); await settle();
      }
      await inViewport('.return-room-btn'); await inViewport('.gb-result-mascot-img');
      assert.ok(await page.locator('.gb-result-mascot-img').evaluate(img => {
        const r = img.getBoundingClientRect();
        for (let p = img.parentElement; p; p = p.parentElement) {
          const style = getComputedStyle(p);
          const clip = p.getBoundingClientRect();
          if (/(auto|hidden|scroll|clip)/.test(style.overflowY) && (r.top < clip.top - 1 || r.bottom > clip.bottom + 1)) return false;
          if (/(auto|hidden|scroll|clip)/.test(style.overflowX) && (r.left < clip.left - 1 || r.right > clip.right + 1)) return false;
        }
        return true;
      }), 'settlement mascot is clipped by a parent');
      const mascot = await page.locator('.gb-result-mascot-img').boundingBox();
      const button = await page.locator('.return-room-btn').boundingBox();
      const panel = await page.locator('.gb-gameover-wrap .modal-content').boundingBox();
      assert.ok(Math.abs(button.x + button.width / 2 - panel.x - panel.width / 2) <= 1, 'settlement return button is not centered');
      assert.ok(mascot.x + mascot.width > panel.x + panel.width && mascot.y + mascot.height > panel.y + panel.height, 'settlement mascot must hang on the lower right frame');
      assert.ok(mascot.width >= 100, 'settlement mascot too small');
      assert.ok(mascot.x >= button.x + button.width || mascot.y >= button.y + button.height, 'settlement mascot overlaps the return button');
      await recordView(won ? 'game-win' : 'game-lose', '.gb-gameover-wrap');
      if (!won && width === 568) await page.screenshot({ path: '../temp-screenshots/settlement-layout-568.png' });
      await page.getByRole('button', { name: '返回房间准备', exact: true }).click();
      await page.locator('.wh-shell').waitFor();
      send(state()); send({ event: 'SYNC_HAND', cards: cards.slice(0, 8) });
      await page.locator('.gb-hand > .card').first().waitFor();
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  console.log('PASS skill selection, scroll responses, spectator and settlement');

  await lobby();
  for (const kind of ['basic', 'advanced']) {
    await page.getByRole('button', { name: '新手教学', exact: true }).click();
    await page.getByRole('button', { name: kind === 'basic' ? /基础教程/ : /锦囊牌进阶教程/ }).click();
    await page.locator('.tutorial-view').waitFor();
    const voice = page.getByRole('button', { name: '关闭小桃语音', exact: true });
    if (await voice.isVisible()) await voice.click();
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height }); await settle();
      await inViewport('.guide-window');
      await inViewport('.guide-primary'); await inViewport('.guide-secondary');
      const tutorial = await geometry();
      for (const card of tutorial.cards) contains(tutorial.hand, card, 'tutorial hand');
      assert.ok(await page.locator('.guide-body').evaluate(el => el.clientHeight >= 20), 'guide text has no readable space');
      await recordView(`tutorial-${kind}`, '.tutorial-view');
      if (kind === 'basic' && width === 568) await page.screenshot({ path: '../temp-screenshots/tutorial-layout-568.png' });
    }
    for (let n = 0; n < 10 && await page.locator('.tutorial-view').getAttribute('data-phase') === 'dialogue'; n++) await page.locator('.guide-primary').click();
    assert.equal(await page.locator('.tutorial-view').getAttribute('data-phase'), 'operation');
    await page.locator('.tutorial-spotlight.is-operation > rect').first().waitFor();
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height }); await settle();
      await inViewport('.tutorial-task');
      // Check the rendered highlight against the card actually hit at its centre.
      // This also waits for the spotlight's resize measurement to catch up.
      await page.waitForFunction(() => {
        const host = document.querySelector('.tutorial-view').getBoundingClientRect();
        return [...document.querySelectorAll('.tutorial-spotlight.is-operation > rect')].every(el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.card[data-tutorial-highlight="true"]');
          return hit && r.left >= host.left - 1 && r.right <= host.right + 1 && r.top >= host.top - 1 && r.bottom <= host.bottom + 1;
        });
      });
      await reachable(page.locator('.tutorial-top-actions').getByRole('button', { name: '退出教学', exact: true }));
      await recordView('tutorial-' + kind + '-operation', '.tutorial-view');
    }
    await page.locator('.tutorial-top-actions').getByRole('button', { name: '退出教学', exact: true }).click();
    await page.getByRole('button', { name: '返回大厅', exact: true }).click();
    await page.locator('.lobby-shell').waitFor();
  }
  console.log('PASS basic/advanced tutorial dialogue, operation and exit');

  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByRole('button', { name: '游戏规则', exact: true }).click();
  await inViewport('.info-panel');
  await page.getByRole('button', { name: '查看详情 »', exact: true }).click();
  await page.locator('.rules-shell').waitFor();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await reachable(page.locator('.rules-back-main'));
    await reachable(page.locator('.rules-back-btn'));
    await page.locator('.rules-main').evaluate(el => { el.scrollTop = 0; });
    await recordView('rules', '.rules-shell');
  }
  await page.locator('.rules-back-btn').click();
  started = false; await join();
  await page.locator('.wh-shell').waitFor();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await inViewport('.wh-shell');
    if (width <= height && height >= 640) {
      for (const selector of ['.wh-seat-name', '.wh-btn', '.wh-subtitle']) {
        assert.ok(await page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 14), `${selector} portrait text too small`);
      }
    }
    const mascot = await page.locator('.wh-mascot-img').boundingBox();
    const main = await page.locator('.wh-main').boundingBox();
    if (width <= height && width <= 768) {
      const seats = await page.locator('.wh-seats').boundingBox();
      assert.ok(mascot.width >= width * .42, 'portrait mascot upper body too small');
      assert.ok(mascot.y + mascot.height * .4 <= seats.y + 1, 'portrait player panel covers mascot upper body');
      assert.ok(main.width >= width * .9, 'portrait player area wastes horizontal space');
      if (height >= 640) assert.ok(seats.height <= 430, 'portrait player panel has excessive empty space');
    } else {
      assert.ok(mascot.x + mascot.width <= main.x + 1, 'waiting room mascot overlaps player content');
      await inViewport('.wh-mascot-img');
    }
    if (height >= 375 && width > height) { await inViewport('.wh-seats'); await inViewport('.wh-seat-grid'); await inViewport('.wh-actions'); }
    for (const button of await page.locator('.wh-btn, .wh-seat-action, .wh-settings-btn').all()) await reachable(button);
    await page.locator('.wh-seats').evaluate(el => { el.scrollTop = 0; });
    await recordView('waiting', '.wh-shell');
    if (width === 956) await page.screenshot({ path: '../temp-screenshots/waiting-layout-956.png' });
  }
  console.log('PASS rules and waiting room local scrolling');

  guest = false; await lobby();
  const invite = page.locator('.tutorial-invitation .guide-secondary');
  if (await invite.isVisible()) await invite.click();
  await join();
  send(state({ players: state().players.slice(0,1) }));
  await page.waitForFunction(() => document.querySelectorAll('.wh-seat--empty').length === 3);
  assert.equal(await page.locator('.wh-topbar .wh-pill').count(), 1, 'waiting room repeats the account ID');
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    // Empty seats can be taller than the local scroll area. Their + entry must
    // remain fully visible and clickable after scrolling, like the other buttons.
    for (const button of await page.locator('.wh-btn, .wh-settings-btn, .wh-friend-drawer-toggle, .account-trigger, .wh-seat--empty .wh-seat-plus-wrap').all()) await reachable(button);
    if (width <= height && width <= 768 && height >= 640) assert.ok(await page.locator('.wh-seat--empty .wh-seat-empty-text').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 14), 'empty seat invitation text too small');
    await page.locator('.wh-seats').evaluate(el => { el.scrollTop = 0; });
    await recordView('waiting-empty', '.wh-shell');
  }
  await page.locator('.wh-seat--empty .wh-seat-plus-wrap').first().click();
  await page.locator('.wh-modal').waitFor();
  await page.locator('.wh-modal').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await reachable(page.locator('.wh-modal-close'));
    await reachable(page.locator('.wh-roomno-copy'));
    await reachable(page.locator('.wh-modal-ai-btn'));
    await page.locator('.wh-modal-body').evaluate(el => { el.scrollTop = 0; });
    await recordView('waiting-invite', '.wh-modal');
  }
  await page.locator('.wh-modal-close').click();
  await page.locator('.wh-settings-btn').click();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await reachable(page.locator('.wh-settings-btn'));
    for (const toggle of await page.locator('.wh-settings-panel .wh-switch').all()) await reachable(toggle);
    await page.locator('.wh-settings-panel').evaluate(el => { el.scrollTop = 0; });
    await recordView('waiting-settings', '.wh-settings-panel');
  }
  await page.locator('.wh-settings-btn').click();
  await page.locator('.wh-friend-drawer-toggle').click();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await reachable(page.locator('.wh-friend-drawer-toggle'));
    await reachable(page.locator('.wh-friend-drawer-close'));
    await recordView('waiting-friends', '.wh-friend-drawer');
  }
  await page.locator('.wh-friend-drawer-close').click();
  console.log('PASS empty seats, room invitations, settings and friend drawer');
  await lobby();
  await page.locator('.account-trigger').click();
  await page.locator('.hub-panel').waitFor();
  await page.locator('.hub-panel').evaluate(async panel => { await Promise.all(panel.getAnimations().map(animation => animation.finished)); });
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await inViewport('.hub-panel'); await inViewport('.hub-close');
    const panel = await page.locator('.hub-panel').boundingBox();
    assert.ok(panel.y >= height * .06 && panel.y + panel.height <= height * .94, 'profile panel needs breathing room above and below');
    assert.ok((await page.locator('.hub-body').boundingBox()).height >= Math.min(64, height * .2), 'profile header consumes the whole viewport');
    await page.locator('.hub-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await inViewport('.hub-close');
    await page.locator('.hub-body').evaluate(el => { el.scrollTop = 0; });
    await recordView('profile-account', '.hub-panel');
  }
  for (const [tab, name] of [['战绩','profile-stats'],['好友','profile-friends']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height }); await settle();
      await reachable(page.locator('.hub-close'));
      for (const button of await page.locator('.hub-tabs button').all()) await reachable(button);
      await recordView(name, '.hub-panel');
    }
  }
  await page.locator('.hub-close').click();
  console.log('PASS account profile and reachable close after scrolling');

  authenticated = false;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.auth-shell').waitFor();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await settle();
    await inViewport('.auth-cta-row');
    await checkAuthLayout();
    await recordView('auth', '.auth-shell');
  }
  await page.setViewportSize({ width: 390, height: 660 });
  await page.getByRole('button', { name: /账号登录/ }).click();
  await page.locator('.auth-modal').waitFor();
  for (const [tab, name] of [['登录','auth-login'],['注册','auth-register']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height }); await settle();
      await reachable(page.locator('.modal-submit'));
      await reachable(page.locator('.modal-close'));
      await recordView(name, '.auth-modal');
    }
  }
  await page.setViewportSize({ width: 390, height: 320 }); await settle();
  await inViewport('.auth-modal');
  await page.getByPlaceholder('用户名（4-20位）').fill('layout-test');
  assert.equal(await page.getByPlaceholder('用户名（4-20位）').evaluate(el => getComputedStyle(el).fontSize), '16px');
  await page.locator('.modal-submit').scrollIntoViewIfNeeded(); await inViewport('.modal-submit');
  await page.getByRole('button', { name: '关闭登录', exact: true }).click();
  console.log('PASS auth keyboard-height scrolling and reachable close');
  assert.deepEqual(errors, [], 'browser errors');
  console.log('PASS selection, resize without game messages, exit cancel; no page errors');
} catch (error) {
  failure = String(error) + ' at ' + page.viewportSize().width + 'x' + page.viewportSize().height;
  try {
  console.log(await page.evaluate(() => [...document.querySelectorAll('.gb-arena, .gb-arena-heading, .gb-table, .gb-table-frame, .gb-table-felt, .gb-phase-display, .phase-notice, .gb-phase-cards, .gb-phase-cards .card')].map(el => {
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    return { class: el.className, y: r.y, height: r.height, scroll: el.scrollHeight, flex: style.flex, padding: style.padding, gap: style.gap, margin: style.margin, maxHeight: style.maxHeight };
  })));
  await mkdir('../temp-screenshots', { recursive: true });
  await page.screenshot({ path: `../temp-screenshots/mobile-layout-${process.env.LAYOUT_BROWSER || 'chromium'}-failure.png` });
  } catch (diagnosticError) {
    console.error('Failure diagnostics unavailable:', String(diagnosticError));
  }
  throw error;
} finally {
  await writeFile(`${outputDirectory}/results.json`, JSON.stringify({ browser: browserName, version: browser.version(), date: new Date().toISOString(), status: failure ? 'failed' : 'passed', failure, results }, null, 2));
  await browser.close();
}
