// Exercise the real advanced lesson through the WGFD pick and opponent turns.
// APIs and WebSockets are isolated so no real room is joined during layout checks.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { ADVANCED_TUTORIAL_STEPS } from '../src/tutorial/advancedTutorialScript.js';

const require = createRequire(import.meta.url);
const browserName = process.env.LAYOUT_BROWSER || 'chromium';
const engine = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')[browserName];
const browser = await engine.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 915, height: 414 }, hasTouch: true });
const output = `../temp-screenshots/tutorial-pool-fix/${browserName}`;
await mkdir(output, { recursive: true });
const errors = [], messages = [], results = [];
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(
  new URL(route.request().url()).pathname === '/api/auth/me'
    ? { id: 'tutorial-layout', username: 'tutorial-layout', guest: true, level: 1, avatarId: 'xiaotao' } : []) }));
await context.routeWebSocket('**', ws => ws.onMessage(raw => messages.push(JSON.parse(raw))));
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', error => errors.push(error.message));
await page.emulateMedia({ reducedMotion: 'reduce' });
const viewports = [[915,414],[320,480],[360,640],[390,660],[430,740],[375,667],[393,852],[440,956],
  [568,240],[667,280],[667,375],[768,390],[844,280],[852,393],[956,440],
  [479,640],[480,640],[767,390],[1023,768],[1024,768],[1366,768],[1440,900],
  [480,320],[640,360],[660,390],[740,430],[915,399],[915,400],[915,401],[915,540],[915,541]];
const captures = new Set(['915x414','320x480','375x667','393x852','440x956','568x240','852x393','956x440','1440x900']);
const tutorial = page.locator('.tutorial-view');
const target = id => page.locator(`[data-tutorial-target="${id}"]`);
async function settle() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function operation() {
  for (let clicks = 0; await tutorial.getAttribute('data-phase') === 'dialogue'; clicks++) {
    assert.ok(clicks < 12, 'lesson dialogue failed to advance');
    await page.locator('.guide-primary').click();
  }
  assert.equal(await tutorial.getAttribute('data-phase'), 'operation');
}
async function executeStep(index) {
  await operation();
  const step = ADVANCED_TUTORIAL_STEPS[index];
  for (const id of step.cards) {
    const card = target(`${step.focus === 'pool' ? 'wgfd-card' : 'card'}:${id}`);
    // The hand deliberately overlaps; click the exposed left strip of each card.
    const bounds = await card.boundingBox();
    await card.click(step.focus === 'pool' ? {} : { position: { x: 4, y: bounds.height / 2 } });
  }
  await target(step.action).click();
  await page.waitForFunction(expected => {
    const el = document.querySelector('.tutorial-view');
    return el.dataset.phase === 'complete' || (Number(el.dataset.step) === expected && el.dataset.phase === 'dialogue');
  }, index + 2, { timeout: 20000 });
}
function contains(outer, inner, label) {
  assert.ok(inner.x >= outer.x - 1 && inner.right <= outer.right + 1 && inner.y >= outer.y - 1 && inner.bottom <= outer.bottom + 1,
    `${label}: ${JSON.stringify({ outer, inner })}`);
}
async function checkLayout(stage) {
  const phase = stage === 'dialogue' ? 'dialogue' : 'operation';
  if (stage === 'operation') await page.waitForFunction(() => {
    const highlights = [...document.querySelectorAll('.tutorial-spotlight.is-operation > rect')];
    return highlights.length > 0 && highlights.every(el => {
      const r = el.getBoundingClientRect();
      const card = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.card');
      return card?.dataset.tutorialTarget === 'wgfd-card:♣10';
    });
  });
  const geometry = await page.evaluate(phase => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
    const elements = selector => [...document.querySelectorAll(selector)].filter(el => el.getBoundingClientRect().width > 0).map(el => ({ ...rect(el),
      hit: el.contains(document.elementFromPoint((el.getBoundingClientRect().left + el.getBoundingClientRect().right) / 2,
        (el.getBoundingClientRect().top + el.getBoundingClientRect().bottom) / 2)) }));
    const task = document.querySelector('.tutorial-task');
    return { viewport: { x: 0, y: 0, right: innerWidth, bottom: innerHeight },
      board: rect(document.querySelector('.gb-tutorial')), task: task && rect(task),
      overlay: rect(document.querySelector('.skill-action-overlay')), modal: rect(document.querySelector('.wgfd-content')),
      cards: elements('.wgfd-card-row > .card'), controls: elements('.wgfd-confirm-btn'),
      guide: phase === 'dialogue' ? elements('.guide-primary, .guide-secondary') : [],
      step: document.querySelector('.tutorial-view').dataset.step,
      selected: document.querySelector('.wgfd-card-row > .card[aria-pressed="true"]')?.dataset.tutorialTarget };
  }, phase);
  contains(geometry.viewport, geometry.board, 'board');
  contains(geometry.board, geometry.overlay, 'pool overlay');
  contains(geometry.overlay, geometry.modal, 'pool modal');
  if (geometry.task) {
    contains(geometry.viewport, geometry.task, 'task panel');
    assert.ok(geometry.task.right <= geometry.board.x + 1 || geometry.task.bottom <= geometry.board.y + 1, 'task panel overlaps game board');
  }
  for (const card of geometry.cards) {
    contains(geometry.modal, card, 'pool card');
    if (phase === 'operation') assert.ok(card.hit, 'pool card cannot be hit at rendered position');
  }
  for (const control of [...geometry.controls, ...geometry.guide]) {
    contains(geometry.viewport, control, 'tutorial control');
    assert.ok(control.hit, 'tutorial control is covered or clipped');
  }
  assert.equal(geometry.step, '6', 'resize advanced or reset the lesson');
  if (phase === 'operation') assert.equal(geometry.selected, stage === 'selected' ? 'wgfd-card:♣10' : undefined, 'resize changed pool selection');
  return geometry;
}
let failure;
try {
  console.log(`Browser: ${browserName} ${browser.version()}`);
  await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.locator('.lobby-shell').waitFor();
  const acknowledge = page.getByRole('button', { name: '我知道了', exact: true });
  if (await acknowledge.isVisible()) await acknowledge.click();
  await page.getByRole('button', { name: '新手教学', exact: true }).click();
  await page.getByRole('button', { name: /锦囊牌进阶教程/ }).click();
  await tutorial.waitFor();
  await page.getByRole('button', { name: '关闭小桃语音', exact: true }).click();
  for (let index = 0; index < 5; index++) await executeStep(index);
  for (const phase of ['dialogue', 'operation', 'selected']) {
    if (phase === 'operation') await operation();
    if (phase === 'selected') await target('wgfd-card:♣10').click();
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height }); await settle();
      const geometry = await checkLayout(phase);
      if (captures.has(`${width}x${height}`)) await page.screenshot({ path: `${output}/${phase}-${width}x${height}.png`, animations: 'disabled' });
      results.push({ phase, width, height, geometry });
    }
  }
  await page.setViewportSize({ width: 915, height: 414 }); await settle();
  await target('confirmWgfd').click();
  await page.waitForFunction(() => document.querySelector('.tutorial-view').dataset.phase === 'demo');
  const task = await page.locator('.tutorial-task').boundingBox(), board = await page.locator('.gb-tutorial').boundingBox();
  assert.ok(task.x + task.width <= board.x + 1, 'opponent demo task overlaps board');
  await page.waitForFunction(() => document.querySelector('.tutorial-view').dataset.step === '7', null, { timeout: 20000 });
  assert.ok(await target('card:♣10').count(), 'picked card was not added to hand');
  for (let index = 6; index < ADVANCED_TUTORIAL_STEPS.length; index++) await executeStep(index);
  assert.equal(await tutorial.getAttribute('data-phase'), 'complete');
  assert.deepEqual(errors, [], 'browser runtime errors');
  assert.deepEqual(messages.filter(message => ['JOIN_ROOM', 'PLAY_CARD', 'PASS'].includes(message.type)), [], 'tutorial sent live game actions');
  console.log(`PASS ${results.length} WGFD layout cases, selection across rotation, opponent picks and advanced lesson completion`);
} catch (error) {
  failure = error;
  await page.screenshot({ path: `${output}/failure.png`, animations: 'disabled' });
  await writeFile(`${output}/failure-geometry.json`, JSON.stringify(await page.evaluate(() =>
    ['.tutorial-view', '.tutorial-task', '.gb-tutorial', '.skill-action-overlay', '.wgfd-content', '.wgfd-card-row', '.wgfd-confirm-btn'].map(selector => {
      const el = document.querySelector(selector);
      if (!el) return { selector };
      const css = getComputedStyle(el);
      return { selector, rect: el.getBoundingClientRect().toJSON(), position: css.position, inset: css.inset,
        width: css.width, height: css.height, padding: css.padding, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    })), null, 2));
  console.error(error.stack);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ browser: browserName, version: browser.version(), results, errors, failure: failure?.message }, null, 2));
  await browser.close();
}
if (failure) process.exitCode = 1;
