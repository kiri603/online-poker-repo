// Mock API/socket traffic so selecting cards never affects a real game.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const output = fileURLToPath(new URL('../../temp-screenshots/card-selection/', import.meta.url));
await mkdir(output, { recursive: true });
const me = 'card-selection-test';
const cards = [['♠', '3'], ['♥', '7'], ['♣', '6'], ['♦', '4'], ['♥', '10']].map(([suit, rank], index) => ({ suit, rank, weight: index + 1 }));

try {
  for (const theme of ['original', 'pop']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(theme => localStorage.setItem('poker:ui-theme', theme), theme);
    const errors = [];
    let socket, onSubmission;
    const send = data => socket.send(JSON.stringify(data));
    const state = (phase = '', pending = me) => ({
      event: 'SYNC_STATE', phase: 'PLAYING', isStarted: true, currentTurn: me,
      currentTurnStartTime: Date.now(), aoeStartTime: Date.now(), serverTime: Date.now(),
      ownerId: me, currentAoeType: phase, pendingAoePlayers: phase ? [pending] : [],
      players: [me, 'opponent'].map(userId => ({ userId, status: 'PLAYING', cardCount: cards.length, skill: 'GUANXING' })),
      spectators: [], settings: { enableSkills: true, enableScrollCards: true, wgfdCards: cards.slice(0, 2) },
      tableCards: [cards[0]], lastPlayPlayer: 'opponent',
    });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.route('**/at.alicdn.com/**', route => route.fulfill({ body: '' }));
    await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const data = path === '/api/auth/me' ? { id: me, username: me, guest: true, level: 1 }
        : path === '/api/rooms' ? [] : path === '/api/rooms/check' ? { exists: true, isPrivate: false } : {};
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await context.routeWebSocket('**', ws => {
      socket = ws;
      ws.onMessage(raw => {
        const message = JSON.parse(raw);
        onSubmission?.(message);
        if (message.type === 'JOIN_ROOM') { send(state()); send({ event: 'SYNC_HAND', cards }); }
        if (message.type === 'PING') send({ event: 'PONG', serverTime: Date.now() });
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'warning' && message.text().includes('[Vue warn]')) errors.push(message.text()); });
    try {
      await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:5173/');
      await page.locator('.lobby-shell').waitFor();
      const acknowledge = page.getByRole('button', { name: '我知道了', exact: true });
      if (await acknowledge.isVisible()) await acknowledge.click();
      const roomInput = theme === 'pop' ? page.getByRole('textbox', { name: '房间号', exact: true }) : page.getByPlaceholder('请输入 4~6 位房间号');
      await roomInput.fill('1234');
      await page.getByRole('button', { name: theme === 'pop' ? '加入输入的房间' : '加入 / 创建房间', exact: true }).click();
      await page.locator('.gb-hand > .card').first().waitFor();
      assert.equal(await page.locator('.gb-pop').count(), theme === 'pop' ? 1 : 0);

      for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 740], [844, 390]]) {
        await page.setViewportSize({ width, height });
        for (const phase of ['WGFD', 'GUANXING']) {
          send(state(phase));
          if (phase === 'GUANXING') send({ event: 'GUANXING_SHOW', cards });
          const overlay = page.locator('.skill-action-overlay');
          await overlay.locator(phase === 'WGFD' ? '.wgfd-content' : '.guanxing-content').waitFor();
          await page.screenshot({ path: `${output}/${theme}-${phase}-${width}x${height}.png`, animations: 'disabled' });
          const filters = await overlay.evaluate(el => ({ backdrop: getComputedStyle(el).backdropFilter, webkit: getComputedStyle(el).webkitBackdropFilter }));
          assert.equal(filters.backdrop, 'none', `${theme} ${phase} must keep hand cards sharp at ${width}x${height}`);
          assert.ok(!filters.webkit || filters.webkit === 'none', 'WebKit backdrop must also stay sharp');
          assert.equal(await page.locator('.gb-hand > .card').count(), cards.length);
          const pool = overlay.locator('.mini-card');
          await pool.nth(0).click();
          if (phase === 'GUANXING') await pool.nth(1).click();
          const confirm = overlay.locator('.wgfd-confirm-btn');
          assert.ok(await confirm.isEnabled());
          const type = phase === 'WGFD' ? 'WGFD_SELECT' : 'GUANXING_SELECT';
          const submission = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Missing ${type} message`)), 8000);
            onSubmission = message => {
              if (message.type !== type) return;
              clearTimeout(timer);
              onSubmission = null;
              resolve(message.data);
            };
          });
          await confirm.click();
          assert.deepEqual(await submission, phase === 'WGFD' ? cards[0] : cards.slice(0, 2));
          send(state());
          await overlay.waitFor({ state: 'hidden' });
        }
      }
      send(state('WGFD', 'opponent'));
      await page.locator('.wgfd-content').waitFor();
      assert.equal(await page.locator('.skill-action-overlay').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
      assert.equal(await page.locator('.wgfd-confirm-btn').count(), 0, 'Waiting players cannot confirm another player’s selection');
      assert.deepEqual(errors, []);
      console.log(`PASS: ${theme} harvest/stargazing keep hands sharp; selection payloads and waiting state work across desktop, tablet and phone orientations`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${theme}-failure.png` });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
