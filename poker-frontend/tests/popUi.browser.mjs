// Isolated UI regression. Authentication and room data never reach a real server.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const output = fileURLToPath(new URL('../../temp-screenshots/pop-ui/', import.meta.url));
await mkdir(output, { recursive: true });
const user = { id: 'pop-ui-test', username: 'pop-ui-test', guest: true, level: 1, tabToken: 'isolated-ui-test' };
const captcha = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="90" height="40"%3E%3Ctext x="8" y="28" font-size="22" fill="%23a53542"%3E8K3N%3C/text%3E%3C/svg%3E';
const requests = [], errors = [];
let authenticated = false, rejectAuth = true;
let roomSocket;
function roomSnapshot(started = false) {
  return { event: 'SYNC_STATE', phase: started ? 'PLAYING' : 'WAITING', isStarted: started,
    ownerId: user.username, currentTurn: user.username, currentTurnStartTime: Date.now(), serverTime: Date.now(),
    players: [user.username, 'opponent-one', 'opponent-two'].map(userId => ({ userId, status: started ? 'PLAYING' : 'WAITING', isReady: true, cardCount: 8 })),
    spectators: [], settings: {}, tableCards: [], currentAoeType: '' };
}
let rooms = [
  { roomId: '1234', playerCount: 2, capacity: 4, status: 'WAITING', enableSkills: true },
  { roomId: '5678', playerCount: 3, maxPlayers: 3, status: 'PLAYING' },
  { roomId: '9012', playerCount: 0, capacity: 4, status: 'WAITING' },
];
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  requests.push({ path, body: route.request().postDataJSON() });
  let status = 200, data = {};
  if (path === '/api/auth/me') { status = authenticated ? 200 : 401; data = user; }
  if (path === '/api/auth/captcha') data = { imageBase64: captcha };
  if (path === '/api/auth/login' || path === '/api/auth/register') {
    status = rejectAuth ? 400 : 200;
    data = rejectAuth ? { message: '验证码错误，请重试' } : user;
    if (!rejectAuth) authenticated = true;
  }
  if (path === '/api/auth/guest') { authenticated = true; data = user; }
  if (path === '/api/auth/logout') authenticated = false;
  if (path === '/api/rooms') data = rooms;
  if (path === '/api/rooms/check') data = { exists: true, isPrivate: false };
  if (path === '/api/social/profile') data = { userId: user.username, loginName: user.username, level: 1, records: [] };
  if (path === '/api/avatars') data = [];
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
});
await context.routeWebSocket('**', socket => {
  roomSocket = socket;
  socket.onMessage(raw => {
    const message = JSON.parse(raw);
    if (message.type === 'JOIN_ROOM') socket.send(JSON.stringify(roomSnapshot()));
    if (message.type === 'PING') socket.send(JSON.stringify({ event: 'PONG', serverTime: Date.now() }));
  });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning') errors.push(message.text()); });
const url = process.env.LAYOUT_URL || 'http://127.0.0.1:5173/';
async function settle() {
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await page.waitForFunction(() => !document.querySelector('.pop-room-leave-active,.app-page-leave-active,.auth-form-leave-active,.pop-entry-leave-active,.account-section-leave-active,.pop-info-section-leave-active,.pop-info-leave-active'));
}
async function capture(name) { await settle(); await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }); }
async function changeTheme(name) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const sections = page.getByRole('navigation', { name: '设置分区' });
  if (await sections.isVisible()) await sections.getByRole('button', { name: '主题', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(name) }).check();
  await page.getByRole('button', { name: '使用此主题', exact: true }).click();
  await page.waitForFunction(theme => document.documentElement.dataset.uiTheme === theme, name === '简约波普' ? 'pop' : 'original');
  await settle();
}
async function visibleControl(locator) {
  await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { inside: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      hit: element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
      point: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.outerHTML.substring(0, 250) };
  });
  assert.ok(result.inside && result.hit, `Control is reachable at ${JSON.stringify(page.viewportSize())}: ${JSON.stringify(result)}`);
}
async function openInline() {
  await page.getByRole('button', { name: /账号登录/ }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('autocomplete') === 'username');
  assert.equal(await page.locator('.auth-modal-overlay').count(), 0);
  assert.equal(await page.getByRole('region', { name: '账号登录', exact: true }).count(), 1);
}
try {
  await page.goto(url);
  await page.getByRole('button', { name: /快速开始/ }).waitFor();
  await changeTheme('简约波普');
  await page.locator('.artwork-ready').waitFor();
  await capture('home-desktop');
  const portrait = await page.locator('.pop-silhouette').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, rightEdge = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++;
    for (let y = 0; y < canvas.height; y++) if (pixels[(y * canvas.width + canvas.width - 1) * 4 + 3] > 128) rightEdge++;
    return { width: canvas.width, height: canvas.height, transparent, rightEdge };
  });
  assert.ok(portrait.transparent > portrait.width * portrait.height * .1, 'Portrait has a real transparent background');
  console.log('portrait:', portrait);
  await openInline();
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill('test-player');
  await page.getByRole('textbox', { name: '验证码', exact: true }).fill('8K3N');
  await page.locator('input[autocomplete=current-password]').fill('Password123');
  await page.getByRole('button', { name: '显示密码' }).click();
  assert.equal(await page.getByRole('textbox', { name: '密码', exact: true }).getAttribute('type'), 'text');
  await page.getByRole('button', { name: '隐藏密码' }).click();
  await page.getByRole('group', { name: '登录或注册' }).getByRole('button', { name: '注册', exact: true }).click();
  assert.equal(await page.locator('.auth-tabs').getAttribute('data-mode'), 'register');
  assert.equal(await page.locator('input[autocomplete=new-password]').inputValue(), 'Password123');
  await page.getByRole('textbox', { name: '验证码', exact: true }).press('Enter');
  await page.getByRole('alert').filter({ hasText: '验证码错误' }).waitFor();
  assert.deepEqual(requests.find(request => request.path === '/api/auth/register').body, { username: 'test-player', password: 'Password123', captchaCode: '8K3N' });
  await capture('register-desktop');
  await page.getByRole('group', { name: '登录或注册' }).getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.classList.contains('pop-account-button'));
  for (const [width, height] of [[320, 640], [390, 844], [768, 800], [1024, 768], [1440, 900], [667, 375], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await capture(`home-${width}x${height}`);
    const silhouette = await page.locator('.pop-silhouette').boundingBox();
    assert.ok(silhouette.x >= 0 && silhouette.x + silhouette.width <= width, 'Portrait hair stays inside the horizontal viewport');
    await visibleControl(page.getByRole('button', { name: '开始游戏', exact: true }));
    await openInline();
    for (const locator of [page.getByRole('button', { name: '返回首页', exact: true }), page.getByRole('textbox', { name: '用户名', exact: true }), page.locator('.modal-submit')]) await visibleControl(locator);
    await capture(`form-${width}x${height}`);
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await settle();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInline();
  await changeTheme('原版');
  await page.getByRole('dialog', { name: '账号登录', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭登录', exact: true }).click();
  await settle();
  await page.getByRole('button', { name: /账号登录/ }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('autocomplete') === 'username');
  await page.getByRole('button', { name: '关闭登录', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '点此注册');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '关闭登录');
  await page.keyboard.press('Escape');
  await changeTheme('简约波普');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.locator('.pop-lobby').waitFor();
  const invitation = page.getByRole('button', { name: '我知道了', exact: true });
  if (await invitation.isVisible()) await invitation.click();
  await settle();
  assert.equal(await page.locator('.pop-room-row').count(), 3);
  const row = page.locator('.pop-room-row').filter({ hasText: '1234' });
  assert.equal(await row.locator('.pop-seats svg').count(), 4);
  assert.equal(await row.locator('.pop-seats .occupied').count(), 2);
  assert.equal(await page.getByRole('img', { name: '已入座 3 人，共 3 个座位' }).count(), 1);
  await page.getByRole('button', { name: '经典', exact: true }).click();
  await settle(); assert.equal(await page.locator('.pop-room-row').count(), 2);
  await page.getByRole('button', { name: '武将 / 锦囊', exact: true }).click();
  await settle(); assert.equal(await page.locator('.pop-room-row').count(), 1);
  rooms = rooms.map(room => room.roomId === '1234' ? { ...room, playerCount: 3 } : room);
  await page.getByRole('button', { name: /刷新/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.pop-seats .occupied').length === 3);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  for (const [width, height] of [[1440, 900], [320, 640], [768, 800], [844, 390]]) {
    await page.setViewportSize({ width, height }); await capture(`lobby-${width}x${height}`);
    await visibleControl(page.getByRole('button', { name: '加入房间 1234', exact: true }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /游戏规则 ↗/ }).click();
  await page.getByRole('heading', { name: '核心规则玩法' }).waitFor();
  await page.getByRole('tab', { name: '更新公告', exact: true }).click();
  await page.getByRole('heading', { name: '最新更新内容' }).waitFor();
  await page.getByRole('button', { name: '我知道了', exact: true }).click();
  await settle();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openInline();
  assert.equal(await page.locator('.auth-tabs').evaluate(element => getComputedStyle(element, '::after').transitionDuration), '0s');
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await changeTheme('原版'); await changeTheme('简约波普');
  assert.equal(await page.locator('.pop-character-layer').evaluate(element => getComputedStyle(element).transform), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  user.guest = false; authenticated = true;
  await page.reload(); await page.locator('.pop-lobby').waitFor();
  const announcement = page.getByRole('button', { name: '我知道了', exact: true });
  if (await announcement.isVisible()) await announcement.click();
  await settle();
  await page.getByRole('button', { name: '个人中心：pop-ui-test', exact: true }).click();
  await page.getByRole('dialog', { name: '战绩', exact: true }).waitFor();
  await page.getByRole('navigation', { name: '个人中心分区' }).getByRole('button', { name: '账号', exact: true }).click();
  await page.getByText('网页登录名', { exact: true }).waitFor();
  await page.getByRole('navigation', { name: '个人中心分区' }).getByRole('button', { name: '战绩', exact: true }).click();
  await page.getByRole('heading', { name: '最近对局', exact: true }).waitFor();
  await page.getByRole('navigation', { name: '个人中心分区' }).getByRole('button', { name: '好友', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索账号 ID', exact: true }).waitFor();
  await capture('account-friends-desktop');
  await page.getByRole('button', { name: '关闭个人中心', exact: true }).click();
  await page.getByRole('button', { name: '加入房间 1234', exact: true }).click();
  await page.locator('.garden-room').waitFor(); await settle();
  assert.equal(await page.locator('.pop-lobby').count(), 0);
  roomSocket.send(JSON.stringify(roomSnapshot(true)));
  roomSocket.send(JSON.stringify({ event: 'SYNC_HAND', cards: [{ suit: '♠', rank: '3', weight: 1 }] }));
  await page.locator('.game-board').waitFor(); await settle();
  assert.equal(await page.locator('.garden-room').count(), 0);
  assert.equal(await page.locator('.game-board').evaluate(element => element.inert), false);
  assert.deepEqual(errors, [], 'No runtime errors or Vue warnings');
  console.log('PASS: authentication, themes, suits, reduced motion, responsive layouts and account/room/game transitions');
} catch (error) {
  console.error('UI diagnostics:', errors, await page.evaluate(() => ({ theme: document.documentElement.dataset.uiTheme, settings: document.querySelector('.game-settings-dialog')?.open })));
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally { await browser.close(); }
