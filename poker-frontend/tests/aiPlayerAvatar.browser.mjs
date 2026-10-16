// Uses the local frontend and backend to verify avatars from real room snapshots.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const baseUrl = process.env.LAYOUT_URL || 'http://127.0.0.1:5173/';
const output = fileURLToPath(new URL('../../temp-screenshots/ai-avatars/', import.meta.url));
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile(new URL('../public/images/avatars/catalog.json', import.meta.url), 'utf8'));
const avatarUrls = new Set(catalog.avatars.map(avatar => avatar.url));

try {
  for (const theme of ['original', 'pop']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(theme => localStorage.setItem('poker:ui-theme', theme), theme);
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.route('**/at.alicdn.com/**', route => route.fulfill({ body: '' }));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'warning' && message.text().includes('[Vue warn]')) errors.push(message.text());
    });
    let latestState;
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(payload.toString());
      if (message.event === 'SYNC_STATE') latestState = message;
    }));
    async function dismissNotices() {
      for (const name of ['我知道了', '暂时跳过']) {
        const button = page.getByRole('button', { name, exact: true });
        if (await button.isVisible()) await button.click();
      }
    }
    const roomId = String(100000 + Math.floor(Math.random() * 900000));
    async function enterRoom() {
      await page.locator('.lobby-shell').waitFor();
      await dismissNotices();
      await page.locator(theme === 'pop' ? '.pop-room-entry input' : '.room-entry-input').fill(roomId);
      await page.getByRole('button', { name: theme === 'pop' ? '加入输入的房间' : '加入 / 创建房间', exact: true }).click();
      await page.getByRole('button', { name: '确认创建', exact: true }).click();
      await page.locator(theme === 'pop' ? '.garden-room' : '.wh-shell').waitFor();
    }
    await page.goto(baseUrl);
    await page.locator(theme === 'pop' ? '.pop-start-button' : '.auth-cta-row .cta-primary').click();
    await enterRoom();
    const addAi = page.getByRole('button', { name: theme === 'pop' ? '添加AI' : '添加脚本AI', exact: true });
    for (let index = 1; index <= 3; index++) {
      await addAi.click();
      await page.waitForFunction(count => document.querySelectorAll('[alt*="AI玩家"]').length === count, index);
    }
    const bots = latestState.players.filter(player => player.isBot);
    assert.equal(bots.length, 3);
    for (const bot of bots) assert.ok(avatarUrls.has(bot.avatar), 'AI avatars must come from the shared catalog');
    const avatars = new Map(bots.map(bot => [bot.userId, bot.avatar]));
    async function verifyAvatars(stage) {
      const root = page.locator(stage === 'waiting' ? (theme === 'pop' ? '.garden-room' : '.wh-shell') : '.game-board');
      for (const bot of bots) {
        const image = root.getByAltText(new RegExp(`^${bot.nickname || bot.userId}\\s*的头像$`));
        await image.waitFor();
        assert.equal(await image.getAttribute('src'), avatars.get(bot.userId), `${stage}: avatar must match the server`);
        await image.evaluate(image => image.decode());
        assert.ok(await image.evaluate(image => image.complete && image.naturalWidth > 0 && image.getBoundingClientRect().width > 0), `${stage}: avatar must load and render`);
      }
    }
    for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await verifyAvatars('waiting');
      await page.screenshot({ path: `${output}/${theme}-waiting-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: /开始(游戏|对局)/ }).click();
    await page.locator('.game-board').waitFor();
    await page.locator(theme === 'pop' ? '.garden-room' : '.wh-shell').waitFor({ state: 'hidden' });
    await page.locator('.shuffle-overlay').waitFor({ state: 'hidden' });
    for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await verifyAvatars('playing');
      await page.screenshot({ path: `${output}/${theme}-playing-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, [], 'Avatar rendering must not cause runtime errors or Vue warnings');
    console.log(`PASS: ${theme} AI avatars match real server snapshots in waiting and playing on desktop, mobile and landscape`);
    await context.close();
  }
} finally {
  await browser.close();
}
