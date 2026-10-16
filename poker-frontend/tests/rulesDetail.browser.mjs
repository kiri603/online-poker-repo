// Run against the local Vite server. Every API/WebSocket is isolated from the backend.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const output = fileURLToPath(new URL('../../temp-screenshots/rules-integration/', import.meta.url));
await mkdir(output, { recursive: true });
const user = { id: 'rules-ui-test', username: 'rules-ui-test', guest: true, level: 1, tabToken: 'isolated-rules-test' };
await context.addInitScript(() => localStorage.setItem('poker:ui-theme', 'pop'));
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(path === '/api/auth/me' ? user : path === '/api/rooms' || path === '/api/avatars' ? [] : {}) });
});
await context.routeWebSocket('**', socket => socket.close());
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning') errors.push(message.text()); });
const base = process.env.LAYOUT_URL || 'http://127.0.0.1:5173/';
const rules = page.getByRole('dialog', { name: '详细规则', exact: true });
const settle = () => page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
});
async function openRules() {
  const announcement = page.locator('.info-overlay').getByRole('button', { name: '我知道了', exact: true });
  if (await announcement.isVisible()) await announcement.click();
  await page.getByRole('button', { name: /游戏规则/ }).click();
  await page.getByRole('button', { name: /查看详情/ }).click();
}
async function chapter(name) {
  const button = rules.getByRole('button', { name, exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}
async function search(query, resultName) {
  await rules.getByRole('button', { name: '查找规则', exact: true }).click();
  const search = page.getByRole('dialog', { name: '查找规则', exact: true });
  await search.getByRole('searchbox', { name: '规则关键词' }).fill(query);
  if (resultName) await search.getByRole('button', { name: resultName, exact: true }).click();
  return search;
}
async function theme(name) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  const section = settings.getByRole('button', { name: '主题', exact: true });
  if (await section.isVisible()) await section.click();
  await settings.getByRole('radio', { name: new RegExp(name) }).check();
  await settings.getByRole('button', { name: '使用此主题', exact: true }).click();
  await settings.waitFor({ state: 'hidden' });
  await settle();
}
try {
  await page.goto(base);
  await page.locator('.pop-lobby').waitFor();
  await openRules();
  await rules.waitFor({ timeout: 2500 });
  assert.equal(await rules.locator('.press-toggle').count(), 5, 'Pop rules use the approved five chapter accordion');
  assert.equal(await rules.locator('img').count(), 0, 'Rules do not include Xiaotao artwork');
  assert.ok(!(await rules.innerText()).includes('三国斗地主'), 'Rules do not include the removed brand');
  assert.ok(!(await rules.innerText()).includes('技能例外'), 'Removed skill exception stays absent');
  assert.equal(await rules.locator('.key-rule p').first().evaluate(el => getComputedStyle(el).textAlign), 'left', 'Rule paragraphs preserve the approved left alignment');
  const measure = (root) => root.evaluate(el => {
    const heading = el.querySelector('.key-rule h3'), paragraph = el.querySelector('.key-rule p');
    const h = getComputedStyle(heading), p = getComputedStyle(paragraph);
    const r = el.querySelector('.press-chapter').getBoundingClientRect();
    return { headingSize: parseFloat(h.fontSize), headingWeight: Number(h.fontWeight), paragraphSize: parseFloat(p.fontSize), paragraphLineHeight: parseFloat(p.lineHeight), left: r.left, right: r.right, width: r.width };
  });
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await settle();
    const live = await measure(rules);
    assert.ok(live.headingSize > live.paragraphSize && live.headingWeight >= 600, 'Rule headings remain distinct from body text');
    assert.ok(live.paragraphSize >= 16 && live.paragraphLineHeight >= live.paragraphSize * 1.5, 'Rule paragraphs remain readable');
    assert.ok(live.left >= 0 && live.right <= width + 1 && live.width > 0, JSON.stringify({ width, live }));
    await rules.screenshot({ path: output + '/integrated-' + width + 'x' + height + '.png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await chapter('胜负与淘汰');
  assert.equal(await rules.getByRole('heading', { name: '手牌数超过 14 张，淘汰' }).count(), 1);
  assert.equal(await rules.locator('.reading-content .example').count(), 0, 'No victory example');
  await chapter('牌型与大小');
  await rules.getByRole('button', { name: '飞机带对', exact: true }).click();
  assert.equal(await rules.locator('.type-card-row .playing-card').count(), 10);
  await chapter('过牌与惩罚');
  await rules.locator('.example summary').click();
  await rules.getByRole('button', { name: '演示过牌', exact: true }).click();
  assert.equal(await rules.locator('.hand .playing-card').count(), 10);
  assert.equal(await rules.locator('.demo-count').innerText(), '10');
  await rules.getByRole('button', { name: '再演示', exact: true }).click();
  assert.equal(await rules.locator('.hand .playing-card').count(), 8);
  await search('铁骑', '武将 铁骑');
  assert.ok((await rules.locator('.entry-effect').innerText()).includes('立即回到你的回合'));
  await search('锁定', '过牌 空桌必须出牌');
  assert.ok(await rules.locator('.fine-print').evaluate(e => e.open), 'Search reveals the matched note');
  await search('飞机带对', '牌型 飞机带对');
  assert.equal(await rules.locator('.type-card-row .playing-card').count(), 10);
  const empty = await search('not-a-rule-xyz');
  assert.ok(await empty.getByText('没有找到相关规则。', { exact: true }).isVisible());
  await page.keyboard.press('Escape');
  await empty.waitFor({ state: 'hidden' });
  assert.ok(await rules.isVisible(), 'Escape only dismisses the search dialog');
  assert.ok(await rules.getByRole('button', { name: '查找规则', exact: true }).evaluate(e => document.activeElement === e));

  for (const [width, height] of [[1440, 900], [320, 640], [390, 844], [768, 800], [1024, 768], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const name of ['过牌与惩罚', '武将技能', '锦囊牌', '胜负与淘汰', '牌型与大小']) {
      await chapter(name);
      if (name === '武将技能') await rules.getByRole('button', { name: '归心', exact: true }).click();
      if (name === '锦囊牌') await rules.getByRole('button', { name: '借刀杀人', exact: true }).click();
      const overflow = await rules.evaluate(el => ({ width: el.scrollWidth, viewport: el.clientWidth }));
      assert.ok(overflow.width <= overflow.viewport + 1, JSON.stringify({ width, name, overflow }));
    }
    await chapter('过牌与惩罚');
    await rules.screenshot({ path: output + '/rules-' + width + 'x' + height + '.png' });
    await rules.getByRole('button', { name: '返回大厅', exact: true }).click();
    await rules.waitFor({ state: 'detached' });
    assert.ok(await page.getByRole('button', { name: /游戏规则/ }).evaluate(el => document.activeElement === el), 'Return restores focus to the rules entry');
    await openRules();
    await rules.waitFor();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await chapter('过牌与惩罚');
  await rules.locator('.example summary').click();
  await rules.getByRole('button', { name: '演示过牌', exact: true }).click();
  const midpoint = await rules.evaluate(el => {
    const animations = el.getAnimations({ subtree: true });
    animations.forEach(animation => { animation.pause(); animation.currentTime = Number(animation.effect.getTiming().duration) / 2; });
    const button = el.querySelector('.demo-action'), rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { animations: animations.length, reachable: hit === button || button.contains(hit), opacity: getComputedStyle(el.querySelector('.key-rule h3')).opacity };
  });
  assert.ok(midpoint.animations > 0 && midpoint.reachable && midpoint.opacity === '1', JSON.stringify(midpoint));
  await rules.screenshot({ path: output + '/animation-midpoint.png' });
  await rules.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
  await rules.getByRole('button', { name: '再演示', exact: true }).click();
  await rules.locator('.example summary').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chapter('过牌与惩罚');
  await rules.locator('.example summary').click();
  await rules.getByRole('button', { name: '演示过牌', exact: true }).click();
  assert.equal(await rules.evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  await page.keyboard.press('Escape');
  await rules.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await theme('原版');
  await openRules();
  await page.locator('.rules-shell').waitFor();
  assert.equal(await page.locator('.rules-pop-page').count(), 0, 'Original theme keeps its existing rules');
  await page.locator('.rules-back-btn').click();
  await theme('简约波普');
  await openRules();
  await rules.waitFor();
  assert.equal(await rules.locator('.press-toggle').count(), 5);
  assert.deepEqual(errors, []);
  console.log('RulesDetail: pop accordion, search, examples, focus, responsive layouts, reduced motion, return, original/pop theme switching passed.');
} catch (error) {
  console.error({ url: page.url(), errors, page: (await page.locator('body').innerText()).slice(0, 1600) });
  await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
