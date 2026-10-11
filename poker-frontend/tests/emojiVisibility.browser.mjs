// Run against a dev server; mock API/socket traffic so no real room is affected.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const browserName = process.env.LAYOUT_BROWSER || 'chromium';
const engine = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')[browserName];
const browser = await engine.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
const output = `../temp-screenshots/emoji-visibility/${browserName}`;
await mkdir(output, { recursive: true });
const sender = 'emoji-sender';
const peers = ['Opponent-one', 'Opponent-two', 'Opponent-three'];
const cards = Array.from({ length: 16 }, (_, i) => ({ suit: i < 13 ? '♠' : '♥', rank: ['3','4','5','6','7','8','9','10','J','Q','K','A','2'][i % 13], weight: i % 13 + 1 }));
const messages = [];
const errors = [];
let socket;
const send = value => socket.send(JSON.stringify(value));
const emoji = (userId, filename) => send({ event: 'EMOJI_RECEIVED', userId, emoji: filename });
function state(overrides = {}) {
  return { event: 'SYNC_STATE', phase: 'PLAYING', isStarted: true, currentTurn: sender, currentTurnStartTime: Date.now(), serverTime: Date.now(),
    currentAoeType: '', ownerId: sender, players: [sender, ...peers].map(userId => ({ userId, status: 'PLAYING', isReady: true, cardCount: 16 })),
    spectators: [], settings: { enableSkills: false }, tableCards: cards.slice(0, 2), lastPlayPlayer: peers[0], ...overrides };
}
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  const data = path === '/api/auth/me' ? { id: sender, username: sender, guest: true, level: 1, avatarId: 'xiaotao' }
    : path === '/api/rooms' ? [] : path === '/api/rooms/check' ? { exists: true, isPrivate: false } : {};
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
await context.routeWebSocket('**', ws => {
  socket = ws;
  ws.onMessage(raw => {
    const message = JSON.parse(raw);
    messages.push(message);
    if (message.type === 'JOIN_ROOM') { send(state()); send({ event: 'SYNC_HAND', cards }); }
    else if (message.type === 'SEND_EMOJI') emoji(sender, message.data);
    else if (message.type === 'PING') send({ event: 'PONG', serverTime: Date.now() });
  });
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', error => errors.push(error.message));

// isVisible() alone misses a fully clipped image. Compare with every scroll clip.
async function assertUnclipped(selector, settleAnimation = true) {
  const image = page.locator(selector).first();
  await image.waitFor();
  await page.waitForFunction(selector => {
    const image = document.querySelector(selector);
    return image?.complete && image.naturalWidth > 0;
  }, selector);
  if (settleAnimation) await page.waitForTimeout(350); // Allow the existing bubble pop animation to finish.
  const geometry = await image.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const ancestors = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (style.overflowX !== 'visible') { clip.left = Math.max(clip.left, bounds.left + parent.clientLeft); clip.right = Math.min(clip.right, bounds.left + parent.clientLeft + parent.clientWidth); }
      if (style.overflowY !== 'visible') { clip.top = Math.max(clip.top, bounds.top + parent.clientTop); clip.bottom = Math.min(clip.bottom, bounds.top + parent.clientTop + parent.clientHeight); }
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') ancestors.push(parent.className);
    }
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, clip, ancestors };
  });
  assert.ok(geometry.left >= geometry.clip.left - 1 && geometry.top >= geometry.clip.top - 1 && geometry.right <= geometry.clip.right + 1 && geometry.bottom <= geometry.clip.bottom + 1,
    `${selector} clipped at ${JSON.stringify(page.viewportSize())}: ${JSON.stringify(geometry)}`);
}

try {
  console.log(`Browser: ${browserName} ${browser.version()}`);
  await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  await page.locator('.lobby-shell').waitFor();
  const acknowledge = page.getByRole('button', { name: '我知道了', exact: true });
  if (await acknowledge.isVisible()) await acknowledge.click();
  await page.getByPlaceholder('请输入 4~6 位房间号').fill('1234');
  await page.getByRole('button', { name: '加入 / 创建房间', exact: true }).click();
  await page.locator('.gb-hand > .card').first().waitFor();
  await page.getByRole('button', { name: '打开表情面板', exact: true }).click();
  await page.locator('.emoji-item').first().click();
  await assertUnclipped('.emoji-bubble.me img');
  const sent = messages.filter(message => message.type === 'SEND_EMOJI');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data, '01_xiao.png');
  assert.equal(await page.locator('.emoji-panel').isVisible(), false);
  await page.locator('.emoji-bubble.me').waitFor({ state: 'detached', timeout: 4000 });

  // The center is intentionally covered by the next card in the overlapping fan.
  await page.locator('.gb-hand > .card').first().click({ position: { x: 5, y: 5 } });
  const gameplayMessages = () => messages.filter(message => ['JOIN_ROOM', 'PLAY_CARDS', 'PASS'].includes(message.type)).length;
  const before = gameplayMessages();
  for (const [width, height] of [[320,480],[375,667],[667,375],[393,852],[852,393],[440,956],[956,440],[568,240],[844,280],[1366,768],[1440,900]]) {
    // Each scenario gets a fresh server turn deadline, avoiding normal 20s auto-play.
    send(state());
    await page.setViewportSize({ width, height });
    emoji(sender, '01_xiao.png');
    for (const peer of peers) emoji(peer, '02_kaixin.png');
    await assertUnclipped('.emoji-bubble.me img');
    for (const peer of peers) await assertUnclipped(`[data-seat-user="${peer}"] .emoji-bubble img`, false);
    assert.equal(await page.locator('.gb-hand > .card.selected').count(), 1, 'Rotation must preserve selected cards');
    assert.equal(await page.locator('.emoji-bubble.me').evaluate(element => getComputedStyle(element).pointerEvents), 'none', 'Own bubble must not intercept game controls');
    await page.screenshot({ path: `${output}/playing-${width}x${height}.png`, animations: 'disabled' });
    console.log(`PASS playing ${width}x${height}: sender and three peers visible`);
  }
  assert.equal(gameplayMessages(), before, 'Resize/display must not send extra gameplay messages');

  await page.setViewportSize({ width: 375, height: 667 });
  send(state({ players: state().players.map(player => ({ ...player, status: player.userId === sender ? 'LOST' : 'PLAYING' })) }));
  await page.locator('.gb-observing').waitFor();
  emoji(sender, '01_xiao.png');
  await assertUnclipped('.emoji-bubble.me img');
  send(state({ players: state().players.filter(player => player.userId !== sender), spectators: [sender] }));
  emoji(sender, '02_kaixin.png');
  await assertUnclipped('.emoji-bubble.me img');
  await page.screenshot({ path: `${output}/observing-375x667.png`, animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('PASS sender echo, 3s expiry, selected cards, elimination and spectator display; no runtime errors');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, animations: 'disabled' });
  throw error;
} finally {
  await browser.close();
}
