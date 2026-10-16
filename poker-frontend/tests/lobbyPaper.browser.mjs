// Real Vue page; stub only the HTTP/WebSocket boundaries to avoid touching live rooms.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const output = fileURLToPath(new URL('../../temp-screenshots/lobby-paper/', import.meta.url));
await mkdir(output, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await context.addInitScript(() => localStorage.setItem('poker:ui-theme', 'pop'));
const user = { id: 'paper-test', username: 'paper-test', nickname: '小桃', guest: true, tabToken: 'paper-test-token' };
let rooms = [
  { roomId: '1024', playerCount: 2, capacity: 4, status: 'WAITING' },
  { roomId: '2086', playerCount: 3, capacity: 4, status: 'WAITING', enableSkills: true, enableScrollCards: true },
  { roomId: '3609', playerCount: 3, maxPlayers: 3, status: 'PLAYING' },
  { roomId: '4072', playerCount: 1, playerLimit: 4, status: 'WAITING', settings: { enableSkills: true } },
];
const joins = [], checks = [], errors = [];
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', route => {
  const url = new URL(route.request().url());
  let data = {};
  if (url.pathname === '/api/auth/me') data = user;
  if (url.pathname === '/api/rooms') data = rooms;
  if (url.pathname === '/api/rooms/check') {
    const id = url.searchParams.get('roomId');
    checks.push(id);
    data = { exists: rooms.some(room => room.roomId === id) || id === '101', isPrivate: false };
  }
  if (url.pathname === '/api/avatars') data = [];
  if (url.pathname === '/api/social/profile') data = { userId: user.username, loginName: user.username, level: 1, records: [] };
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
await context.routeWebSocket('**', socket => socket.onMessage(raw => {
  const message = JSON.parse(raw);
  if (message.type === 'JOIN_ROOM') {
    joins.push(message);
    socket.send(JSON.stringify({ event: 'SYNC_STATE', phase: 'WAITING', isStarted: false,
      ownerId: user.username, players: [{ userId: user.username, status: 'WAITING', isReady: false, cardCount: 0 }],
      spectators: [], settings: message.data.settings || {}, tableCards: [], currentAoeType: '' }));
  }
  if (message.type === 'PING') socket.send(JSON.stringify({ event: 'PONG', serverTime: Date.now() }));
}));
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning') errors.push(message.text()); });
const url = process.env.LAYOUT_URL || 'http://127.0.0.1:5173/';
async function settle() {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await page.waitForFunction(() => !document.querySelector('.pop-room-leave-active,.pop-info-leave-active,.pop-info-section-leave-active'));
}
async function lobby() {
  await page.goto(url);
  await page.locator('.pop-lobby').waitFor();
  const announcement = page.getByRole('button', { name: '我知道了', exact: true });
  if (await announcement.isVisible()) await announcement.click();
  await settle();
}
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  assert.ok(await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1 && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), `Unreachable control at ${JSON.stringify(page.viewportSize())}`);
}
try {
  await lobby();
  assert.equal(await page.locator('.paper-stage').count(), 1, 'Approved paper layout is mounted in the real lobby');
  assert.equal(await page.locator('.paper-card-stack .playing-card').count(), 3);
  assert.equal(await page.locator('.pop-lobby .game-brand,.pop-lobby .brand-mark,.pop-lobby h1 img').count(), 0);
  assert.equal(await page.locator('.pop-room-row').count(), 4);
  const first = page.locator('.pop-room-row').filter({ hasText: '1024' });
  assert.equal(await first.locator('.pop-seats svg').count(), 4);
  assert.equal(await first.locator('.pop-seats .occupied').count(), 2);
  assert.equal(await page.getByRole('img', { name: '已入座 3 人，共 3 个座位' }).count(), 1);
  await page.getByRole('button', { name: '经典', exact: true }).click();
  await settle();
  assert.equal(await page.locator('.pop-room-row').count(), 2);
  await page.getByRole('button', { name: '武将 / 锦囊', exact: true }).click();
  await settle();
  assert.equal(await page.locator('.pop-room-row').count(), 2);
  rooms = rooms.map(room => room.roomId === '2086' ? { ...room, playerCount: 4 } : room);
  await page.getByRole('button', { name: /刷新/ }).click();
  await page.getByRole('img', { name: '已入座 4 人，共 4 个座位' }).waitFor();
  await page.getByRole('button', { name: '全部', exact: true }).click();

  for (const [width, height] of [[1440, 960], [1024, 768], [768, 1024], [375, 812], [320, 640], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await settle();
    assert.ok(await page.locator('.lobby-shell').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `No horizontal overflow at ${width}`);
    for (const control of [page.locator('.paper-entry-dock .create-button'), page.locator('.pop-room-entry input'), page.getByRole('button', { name: '加入房间 1024', exact: true }), page.getByRole('button', { name: '设置', exact: true })]) await reachable(control);
    await page.locator('.lobby-shell').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `${output}/lobby-${width}x${height}.png`, fullPage: true });
    await page.locator('.paper-entry-dock .create-button').click();
    await page.locator('.create-overlay').waitFor();
    const suggestedRoom = await page.locator('.create-roomno-input').inputValue();
    assert.match(suggestedRoom, /^\d{4,6}$/);
    assert.ok(!rooms.some(room => room.roomId === suggestedRoom));
    await reachable(page.locator('.create-overlay .info-primary'));
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await settle();
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: /游戏规则/ }).click();
  await page.getByRole('heading', { name: '核心规则玩法' }).waitFor();
  await page.getByRole('tab', { name: '更新公告', exact: true }).click();
  await page.getByRole('heading', { name: '最新更新内容' }).waitFor();
  await page.getByRole('button', { name: '我知道了', exact: true }).click();
  await settle();
  await page.getByRole('button', { name: '新手教学', exact: true }).click();
  await page.locator('.tutorial-selector').waitFor();
  await page.getByRole('button', { name: '关闭教程选择' }).click();

  // Canceling private creation must not leak its privacy flag into a public join.
  await page.locator('.paper-entry-dock .create-button').click();
  await page.locator('.create-overlay .setting-item').filter({ hasText: '私密房间' }).locator('.switch').click();
  await page.keyboard.press('Escape');
  await settle();
  assert.equal(await page.locator('.paper-entry-dock .create-button').evaluate(element => element === document.activeElement), true, 'Creation returns keyboard focus to its opener');
  await page.getByRole('button', { name: '加入房间 1024', exact: true }).click();
  await page.locator('.garden-room').waitFor();
  assert.equal(joins.at(-1).data.isPrivate, false);
  await lobby();

  await page.locator('.paper-entry-dock .create-button').click();
  await page.locator('.create-roomno-input').fill('9876');
  for (const name of ['武将技能', '锦囊牌', '私密房间']) {
    const setting = page.locator('.create-overlay .setting-item').filter({ hasText: name });
    await setting.locator('.switch').click();
    assert.equal(await setting.locator('input').isChecked(), true);
  }
  await page.locator('.create-password-input').fill('1234');
  await page.locator('.create-overlay .info-primary').click();
  await page.locator('.garden-room').waitFor();
  assert.equal(joins.at(-1).roomId, '9876');
  assert.equal(joins.at(-1).data.isCreating, true);
  assert.equal(joins.at(-1).data.isPrivate, true);
  assert.equal(joins.at(-1).data.password, '1234');
  assert.equal(joins.at(-1).data.settings.enableSkills, true);
  assert.equal(joins.at(-1).data.settings.enableScrollCards, true);

  await lobby();
  await page.getByRole('button', { name: '加入房间 3609', exact: true }).click();
  await page.locator('.garden-room').waitFor();
  assert.equal(joins.at(-1).roomId, '3609', 'Playing rooms retain the existing join/spectate path');
  assert.equal(joins.at(-1).data.isCreating, false);
  await lobby();
  await page.locator('.pop-room-entry input').fill('101');
  await page.locator('.pop-room-entry input').press('Enter');
  await page.locator('.garden-room').waitFor();
  assert.equal(joins.at(-1).roomId, '101', 'Existing short room IDs remain joinable');

  rooms = [];
  await lobby();
  await page.getByText('暂无公开房间', { exact: true }).waitFor();
  await page.getByRole('button', { name: '创建房间', exact: true }).last().click();
  assert.match(await page.locator('.create-roomno-input').inputValue(), /^\d{4,6}$/);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.paper-card-stack').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.deepEqual(errors, []);
  assert.ok(checks.includes('3609') && checks.includes('101'));
  console.log('PASS: paper lobby, real room bindings, suit capacities, filters/refresh, private creation, join/spectate, legacy room IDs, responsive controls and reduced motion');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error('Runtime errors:', errors);
  throw error;
} finally { await browser.close(); }
