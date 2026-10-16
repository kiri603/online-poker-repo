import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// All API calls use fixtures in an isolated browser context.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const output = fileURLToPath(new URL('../../temp-screenshots/settings-adaptation/', import.meta.url));
await mkdir(output, { recursive: true });
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', route => route.fulfill({ status: new URL(route.request().url()).pathname === '/api/auth/me' ? 401 : 200, contentType: 'application/json', body: '{}' }));
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning') errors.push(message.text()); });
const dialog = page.getByRole('dialog', { name: '设置', exact: true });
async function settle() {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}
async function section(name) {
  const navigation = page.getByRole('navigation', { name: '设置分区' });
  if (await navigation.isVisible()) await navigation.getByRole('button', { name, exact: true }).click();
  await settle();
}
async function open() {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await dialog.waitFor(); await settle();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '关闭设置');
}
async function reachable(locator) {
  const result = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      hit: element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
  });
  assert.deepEqual(result, { inside: true, hit: true }, `Visible control at ${JSON.stringify(page.viewportSize())}`);
}
async function shot(name) { await settle(); await page.screenshot({ path: `${output}/${name}.png` }); }
try {
  await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /快速开始/ }).waitFor();
  await open();
  assert.equal(await dialog.getAttribute('data-ui-theme'), 'original', 'Settings follows the active theme');
  const originalColors = await dialog.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
  await shot('original-desktop');
  await page.getByRole('slider', { name: '音乐', exact: true }).press('End');
  assert.equal(await page.getByRole('slider', { name: '音乐', exact: true }).getAttribute('aria-valuetext'), '100%');
  await page.getByRole('radio', { name: /简约波普/ }).check();
  assert.equal(await dialog.getAttribute('data-ui-theme'), 'original', 'Previewing a theme does not change the active panel');
  await page.getByRole('button', { name: '使用此主题', exact: true }).click();
  await page.locator('.auth-shell-pop').waitFor();
  await settle(); await open();
  assert.equal(await dialog.getAttribute('data-ui-theme'), 'pop');
  const popColors = await dialog.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
  assert.notDeepEqual(popColors, originalColors);
  await shot('pop-desktop');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '设置');
  for (const [width, height] of [[319, 587], [320, 640], [390, 844], [768, 800], [1024, 768], [667, 375], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await open();
    await reachable(page.getByRole('button', { name: '关闭设置', exact: true }));
    await reachable(dialog.locator('.settings-footer .apply-button'));
    await section('声音');
    const slider = page.getByRole('slider', { name: '音乐', exact: true });
    await slider.scrollIntoViewIfNeeded(); await reachable(slider);
    assert.equal(await slider.getAttribute('aria-valuetext'), '100%');
    await shot(`audio-${width}x${height}`);
    await section('主题');
    await reachable(page.getByRole('radio', { name: /简约波普/ }));
    await reachable(dialog.locator('.settings-footer .apply-button'));
    await shot(`theme-${width}x${height}`);
    if (width <= 760) assert.equal(await page.getByRole('slider', { name: '音乐', exact: true }).isVisible(), false, 'The compact panel shows one section at a time');
    await page.getByRole('button', { name: '放大主题预览', exact: true }).click();
    await page.getByRole('dialog', { name: /简约波普 · 登录封面/ }).waitFor();
    await reachable(page.getByRole('button', { name: '关闭预览', exact: true }));
    await page.getByRole('button', { name: '关闭预览', exact: true }).click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  }
  await page.setViewportSize({ width: 319, height: 587 }); await open(); await section('主题');
  await page.getByRole('radio', { name: /原版/ }).check();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.locator('.auth-shell-pop').count(), 1, 'Cancel keeps the active theme');
  await page.reload(); await page.locator('.auth-shell-pop').waitFor();
  await open(); assert.equal(await page.getByRole('slider', { name: '音乐', exact: true }).getAttribute('aria-valuetext'), '100%');
  await page.getByRole('button', { name: '静音', exact: true }).click();
  await page.getByRole('button', { name: '试听音乐', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '请先恢复声音' }).waitFor();
  await page.getByRole('button', { name: '恢复声音', exact: true }).click();
  await page.getByRole('button', { name: '关闭设置', exact: true }).press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(); await section('主题');
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.getByRole('radio', { name: /原版/ }).check();
  await page.getByRole('button', { name: '使用此主题', exact: true }).click();
  await page.getByRole('button', { name: /快速开始/ }).waitFor();
  await open(); await shot('original-mobile');
  assert.equal(await dialog.getAttribute('data-ui-theme'), 'original');
  assert.deepEqual(errors, []);
  console.log('PASS: themed settings, compact sections, reachable footer, volume persistence, preview, cancellation, focus and reduced motion');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error('Runtime errors:', errors);
  throw error;
} finally { await browser.close(); }
