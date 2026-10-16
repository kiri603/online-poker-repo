// Keep authentication/social requests local to this isolated UI fixture.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1760, height: 1050 } });
const output = fileURLToPath(new URL('../../temp-screenshots/lobby-header/', import.meta.url));
await mkdir(output, { recursive: true });
await context.addInitScript(() => {
  localStorage.setItem('poker:ui-theme', 'pop');
  localStorage.setItem('poker:tutorial-invitation:v1:header-test', '1');
});
const user = { id: 'header-test', username: 'kiri', nickname: 'kiri', guest: false, tabToken: 'header-fixture' };
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
await context.route('**/at.alicdn.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await context.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  let data = {};
  if (path === '/api/auth/me') data = user;
  if (path === '/api/rooms' || path === '/api/avatars') data = [];
  if (path === '/api/social/overview') data = { avatar: '/images/emojis/01_xiao.png' };
  if (path === '/api/social/profile') data = { userId: user.username, nickname: user.nickname, level: 1, recentRecords: [] };
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Chromium may deny background music before a gesture; that is independent of layout.
page.on('console', message => { if (message.type() === 'warning' && message.text().startsWith('[Vue warn]')) errors.push(message.text()); });
const url = process.env.LAYOUT_URL || 'http://127.0.0.1:5173/';
async function settle() {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}
async function openLobby() {
  await page.goto(url);
  await page.locator('.pop-lobby').waitFor();
  const announcement = page.getByRole('button', { name: '我知道了', exact: true });
  if (await announcement.isVisible()) await announcement.click();
  await settle();
}
async function checkHeader() {
  const geometry = await page.evaluate(() => {
    const profile = document.querySelector('.player-trigger'), settings = document.querySelector('.pop-hall-settings');
    const a = profile.getBoundingClientRect(), b = settings.getBoundingClientRect();
    const hit = element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)); };
    return { overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
      sameHeader: profile.closest('.pop-lobby-header') === settings.closest('.pop-lobby-header'),
      aligned: Math.abs(a.top+a.height/2-b.top-b.height/2) <= 1,
      reachable: hit(profile) && hit(settings),
      profile: {x:a.x,y:a.y,width:a.width,height:a.height}, settings:{x:b.x,y:b.y,width:b.width,height:b.height} };
  });
  assert.equal(geometry.overlap, false, `Player/settings overlap at ${JSON.stringify(page.viewportSize())}: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.sameHeader, true, 'Both controls belong to the same layout row');
  assert.equal(geometry.aligned, true, 'Player and settings share a center line');
  assert.equal(geometry.reachable, true, 'Both controls accept pointer input');
}
try {
  for (const nickname of ['kiri', '很长的玩家昵称也不会挤占设置按钮']) {
    user.nickname = nickname;
    await openLobby();
    for (const [width,height] of [[1760,1050],[1600,900],[1920,1080],[2560,1440],[1440,960],[1024,768],[768,1024],[375,812],[320,640],[844,390]]) {
      await page.setViewportSize({width,height});
      await settle();
      await checkHeader();
      if (width === 1760 || width === 375) await page.screenshot({path:`${output}/${nickname==='kiri'?'short':'long'}-${width}.png`});
    }
  }
  await page.setViewportSize({width:1760,height:1050});
  await page.locator('.player-trigger').click();
  await page.getByRole('dialog',{name:'战绩',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭个人中心',exact:true}).click();
  await page.locator('.pop-hall-settings').click();
  await page.getByRole('dialog',{name:'设置',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await page.setViewportSize({width:375,height:812});
  await page.locator('.lobby-shell').evaluate(element=>{element.scrollTop=80;});
  const scrolling = await page.evaluate(()=>{
    const a=document.querySelector('.player-trigger').getBoundingClientRect(),b=document.querySelector('.pop-hall-settings').getBoundingClientRect();
    return Math.abs(a.y+a.height/2-b.y-b.height/2)<=1;
  });
  assert.equal(scrolling,true,'Header controls scroll together');
  user.guest=true;
  await openLobby();
  assert.equal(await page.locator('.player-trigger').count(),0,'Guests keep their existing exit control');
  await page.getByRole('button',{name:'退出',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: player/settings share a row; short/long names, 320–2560px, landscape, scrolling, both dialogs and guests');
} catch(error) {
  console.error('Header diagnostics:', errors, await page.locator('.pop-lobby-header').innerHTML());
  await page.screenshot({path:`${output}/failure.png`});
  throw error;
} finally {await browser.close();}
