// Real application views and socket actions; network fixtures never contact a game server.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath: process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion:'reduce' });
await context.addInitScript(() => localStorage.setItem('poker:ui-theme', 'pop'));
const output = fileURLToPath(new URL('../../temp-screenshots/battle-integration/', import.meta.url));
await mkdir(output, { recursive: true });
const me = 'pop-battle-test';
const hand = [['♠','3'],['♥','7'],['♣','6'],['♦','4'],['♥','10'],['♣','10'],['♠','9'],['♦','9'],['♠','K'],['♦','Q'],['♣','J'],['♥','A'],['♠','2'],['SCROLL','WGFD']].map(([suit,rank],index)=>({suit,rank,weight:index+1}));
let socket;
const messages = [], errors = [];
function snapshot(overrides = {}) {
  return { event:'SYNC_STATE',phase:'PLAYING',isStarted:true,currentTurn:me,currentTurnStartTime:Date.now(),serverTime:Date.now(),
    ownerId:me,players:[me,'一壶春','阿布','青山'].map((userId,index)=>({userId,nickname:userId===me?'你':userId,avatar:`/images/avatars/${['cat-tuxedo.png','cat-tuxedo.png','dog-shiba.png','general.png'][index]}`,status:'PLAYING',cardCount:index?10-index:14,skill:['ZHIHENG','GUANXING','TIEQI','GUIXIN'][index]})),
    spectators:[],settings:{enableSkills:true,enableScrollCards:true},tableCards:[{suit:'♣',rank:'9',weight:7},{suit:'♥',rank:'9',weight:7}],lastPlayPlayer:'阿布',currentAoeType:'',...overrides };
}
const send = data => socket.send(JSON.stringify(data));
await context.route('https://fonts.googleapis.com/**', route=>route.fulfill({contentType:'text/css',body:''}));
await context.route('**/at.alicdn.com/**', route=>route.fulfill({body:''}));
await context.route('**/api/**', route=>{
  const path = new URL(route.request().url()).pathname;
  const data = path==='/api/auth/me'?{id:me,username:me,guest:true,level:1,tabToken:'isolated-pop-board'}:path==='/api/rooms'?[{roomId:'1234',playerCount:3,status:'WAITING'}]:path==='/api/rooms/check'?{exists:true,isPrivate:false}:{};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
await context.routeWebSocket('**', ws=>{
  socket=ws;ws.onMessage(raw=>{const message=JSON.parse(raw);messages.push(message);
    if(message.type==='JOIN_ROOM'){send(snapshot());send({event:'SYNC_HAND',cards:hand});}
    if(message.type==='PING')send({event:'PONG',serverTime:Date.now()});
    if(message.type==='SEND_EMOJI')send({event:'EMOJI_RECEIVED',userId:me,emoji:message.data});
  });
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', error=>errors.push(error.message));
page.on('console', message=>{if(message.type()==='warning' && message.text().includes('[Vue warn]'))errors.push(message.text());});
async function settle(){await page.waitForTimeout(480);}
async function reset(overrides={}){send(snapshot(overrides));send({event:'SYNC_HAND',cards:hand});await settle();}
async function withSkill(skill,extra={}){await reset({players:snapshot().players.map(player=>player.userId===me?{...player,skill,...extra}:player)});}
async function reachable(locator){assert.ok(await locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`Unreachable: ${await locator.textContent()}`);}
async function actionTextVisible(locator) {
  const clippedBy = await locator.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const clipped = [];
    if (text.width <= 0 || text.height <= 0 || text.left < 0 || text.top < 0 || text.right > innerWidth || text.bottom > innerHeight) clipped.push('viewport');
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if ((/(auto|scroll|hidden|clip)/.test(style.overflowX) && (text.left < box.left - 1 || text.right > box.right + 1)) ||
          (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (text.top < box.top - 1 || text.bottom > box.bottom + 1))) clipped.push(parent.className);
    }
    return clipped;
  });
  assert.deepEqual(clippedBy, [], `Action text must be fully visible: ${await locator.textContent()}`);
}
try {
  await page.goto(process.env.LAYOUT_URL||'http://127.0.0.1:5173/');
  await page.locator('.pop-room-entry').waitFor();await settle();
  const acknowledge = page.getByRole('button',{name:'我知道了',exact:true});
  for(let index=0;index<2;index++){if(await acknowledge.isVisible())await acknowledge.click();await page.waitForTimeout(200);}
  await page.getByRole('textbox',{name:'房间号',exact:true}).fill('1234');
  await page.getByRole('button',{name:'加入输入的房间',exact:true}).click();
  await page.locator('.gb-hand > .card').first().waitFor();await settle();
  assert.equal(await page.locator('.gb-pop').count(),1,'Pop theme mounts the approved battle layout');
  assert.equal(await page.locator('.game-table > .header').count(),0,'Room information is not duplicated');
  assert.equal(await page.locator('.pop-battle-table').count(),1);
  assert.equal(await page.locator('.gb-pop .card-backs,.gb-pop .deck').count(),0);
  assert.equal(await page.locator('.gb-pop').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 241, 215)');
  for (const [width, height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,740],[844,390],[320,480],[667,280]]) {
    await page.setViewportSize({width,height});await settle();
    for (const userId of [me,'一壶春','阿布','青山']) send({event:'PLAYER_PASSED',userId});
    const selfText = page.locator('.my-float-text.pass:not(.float-text-leave-active)');
    await selfText.waitFor();await settle();
    await page.screenshot({path:`${output}/pass-${width}x${height}.png`});
    for (const text of await page.locator('.floating-action-text.pass:not(.float-text-leave-active)').all()) await actionTextVisible(text);
    assert.ok(await selfText.evaluate(el => {
      const text = el.getBoundingClientRect();
      return [...document.querySelectorAll('.gb-action-region button,.gb-hand>.card')].every(target => {
        const box = target.getBoundingClientRect();
        return text.right <= box.left || text.left >= box.right || text.bottom <= box.top || text.top >= box.bottom;
      });
    }), 'My pass text stays clear of action buttons and hand cards');
  }
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,740],[844,390],[320,480],[667,280]]){
    await page.setViewportSize({width,height});await settle();
    for(const selector of ['.gb-pop [data-tutorial-target="play"]','.gb-pop [data-tutorial-target="replace"]','.pop-emoji-open','.pop-board-header .exit-btn','.pop-board-header .game-settings-button'])await reachable(page.locator(selector));
    assert.equal(await page.locator('.gb-pop').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    await page.screenshot({path:`${output}/board-${width}x${height}.png`});
  }
  for(const [width,height] of [[390,844],[844,390]]){
    await page.setViewportSize({width,height});send({event:'SYNC_HAND',cards:[...hand,...hand.slice(0,10)]});await settle();await reachable(page.locator('[data-tutorial-target="play"]'));await page.locator('.gb-hand>.card').last().focus();await page.keyboard.press('Home');await page.keyboard.press('End');await page.screenshot({path:`${output}/many-cards-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:900});await reset();
  await page.locator('[data-tutorial-target="replace"]').click();
  assert.equal(messages.filter(m=>m.type==='REPLACE_CARD').length,0,'Skill arming never sends an empty action');
  await page.getByRole('button',{name:'选择 黑桃3',exact:true}).click();
  await page.locator('[data-tutorial-target="replace"]').click();
  assert.deepEqual(messages.find(m=>m.type==='REPLACE_CARD').data,{suit:'♠',rank:'3',weight:1});
  await reset();
  await page.getByRole('button',{name:'选择 红桃10',exact:true}).click();
  await page.getByRole('button',{name:'选择 梅花10',exact:true}).click();
  await page.locator('[data-tutorial-target="play"]').click();
  assert.equal(messages.filter(m=>m.type==='PLAY_CARD').at(-1).data.length,2);
  await page.getByRole('button',{name:'选择 梅花10',exact:true}).focus();await page.keyboard.press('Control+Enter');
  assert.equal(messages.filter(m=>m.type==='PLAY_CARD').at(-1).data.length,2,'Keyboard submission keeps the selected pair intact');
  await page.locator('.pop-emoji-open').click();
  assert.equal(await page.locator('.pop-emoji-dialog [data-emoji]').count(),29);
  await page.locator('.pop-emoji-dialog [data-emoji]').first().click();
  await page.locator('.pop-emoji-dialog').waitFor({state:'hidden'});
  assert.ok(messages.some(m=>m.type==='SEND_EMOJI'));
  await page.locator('.pop-self-reaction').waitFor();
  assert.ok(await page.locator('.pop-self-reaction').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.gb-action-region').getBoundingClientRect().top),'Reaction stays above cards and actions');
  for(const skill of ['LUANJIAN','KUROU']){
    await withSkill(skill);await page.locator('[data-tutorial-target="replace"]').click();
    await page.getByRole('button',{name:'选择 黑桃3',exact:true}).click();await page.getByRole('button',{name:'选择 梅花6',exact:true}).click();await page.locator('[data-tutorial-target="replace"]').click();
    const data=messages.filter(m=>m.type==='USE_SKILL').at(-1).data;
    assert.equal(data.skill,skill);assert.equal(data.cards.length,2);assert.equal('selected' in data.cards[0],false);
  }
  await withSkill('GUSHOU');await page.locator('[data-tutorial-target="replace"]').click();assert.ok(messages.some(m=>m.type==='USE_GUSHOU'));
  await withSkill('GUIXIN');await page.locator('[data-tutorial-target="replace"]').click();assert.equal(messages.filter(m=>m.type==='USE_SKILL').at(-1).data.skill,'GUIXIN');
  await withSkill('GUIXIN',{guixinDisabled:true});assert.ok(await page.locator('[data-tutorial-target="replace"]').isDisabled());
  await withSkill('GUANXING');await page.locator('[data-tutorial-target="pass"]').click();assert.equal(messages.at(-1).type,'PASS');
  await withSkill('TIEQI');assert.equal(await page.locator('[data-tutorial-target="replace"]').count(),0);assert.match(await page.locator('.pop-passive-skill').textContent(),/铁骑/);
  await reset({settings:{enableSkills:true,jdsr_target:me,jdsr_initiator:'阿布'}});assert.ok(await page.locator('[data-tutorial-target="replace"]').isDisabled());assert.ok(await page.locator('.jdsr-floating-notification').isVisible());
  await reset();
  await reset({currentTurn:'青山'});await page.locator('.pop-emoji-open').click();await page.keyboard.press('Escape');
  await reset({currentAoeType:'WJQF',pendingAoePlayers:[me],aoeInitiator:'青山'});
  await page.getByRole('button',{name:'选择 黑桃3',exact:true}).click();
  await page.locator('[data-tutorial-target="discardAoe"]').click();
  assert.equal(messages.filter(m=>m.type==='RESPOND_AOE').at(-1).data.suit,'♠');
  for(const phase of ['GUSHOU_DISCARD','KUROU_AWAKEN_DISCARD','GUIXIN_DECISION','GUANXING','WGFD']){
    await reset({currentAoeType:phase,pendingAoePlayers:[me],settings:{enableSkills:true,wgfdCards:hand.slice(0,4),guixin_pending_passer:'阿布'}});
    assert.ok(await page.locator('.gb-pop').isVisible());await page.screenshot({path:`${output}/phase-${phase}.png`});
  }
  await page.locator('.wgfd-card-row [role="button"]').first().click();await page.locator('.wgfd-confirm-btn').click();assert.equal(messages.filter(m=>m.type==='WGFD_SELECT').at(-1).data.suit,'♠');
  await reset({currentAoeType:'GUANXING',pendingAoePlayers:[me]});send({event:'GUANXING_SHOW',cards:hand.slice(0,5)});await settle();
  await page.locator('.guanxing-content [role="button"]').nth(0).click();await page.locator('.guanxing-content [role="button"]').nth(1).click();await page.locator('.guanxing-content .wgfd-confirm-btn').click();assert.equal(messages.filter(m=>m.type==='GUANXING_SELECT').at(-1).data.length,2);
  await reset({currentAoeType:'GUSHOU_DISCARD',pendingAoePlayers:[me]});await page.getByRole('button',{name:'选择 黑桃3',exact:true}).click();await page.getByRole('button',{name:'选择 红桃7',exact:true}).click();await page.getByRole('button',{name:'确认弃牌',exact:true}).click();assert.equal(messages.filter(m=>m.type==='GUSHOU_DISCARD').at(-1).data.length,2);
  await reset({currentAoeType:'KUROU_AWAKEN_DISCARD',pendingAoePlayers:[me]});await page.getByRole('button',{name:'跳过',exact:true}).click();assert.equal(messages.filter(m=>m.type==='KUROU_AWAKEN_DISCARD').at(-1).data,null);
  await reset({currentAoeType:'GUIXIN_DECISION',pendingAoePlayers:[me]});await page.getByRole('button',{name:'发动归心',exact:true}).click();assert.equal(messages.filter(m=>m.type==='GUIXIN_DECISION').at(-1).data.accept,true);
  await reset({phase:'SKILL_SELECTION',settings:{enableSkills:true,skillsSelected:{}}});await page.locator('.skill-overlay').waitFor();await page.screenshot({path:`${output}/skill-selection.png`});await page.locator('.skill-card.zhiheng-card').press('Enter');assert.equal(messages.filter(m=>m.type==='SELECT_SKILL').at(-1).data,'ZHIHENG');
  await reset({spectators:[me],players:snapshot().players.filter(p=>p.userId!==me)});assert.ok(await page.locator('.gb-hand').isHidden());await reachable(page.locator('.pop-emoji-open'));
  await reset({currentAoeType:'WGFD',pendingAoePlayers:['阿布'],settings:{enableSkills:true,wgfdCards:hand.slice(0,4)}});await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.skill-action-overlay')),'Waiting harvest keeps keyboard focus in its modal');
  for(const [width,height] of [[390,844],[844,390]]){
    await page.setViewportSize({width,height});
    for(const phase of ['WJQF','GUSHOU_DISCARD','KUROU_AWAKEN_DISCARD','GUIXIN_DECISION']){
      await reset({currentAoeType:phase,pendingAoePlayers:[me]});
      if(phase==='WJQF'){
        await page.locator('.pop-emoji-open').click();await page.locator('.pop-emoji-dialog [data-emoji]').first().click();await page.locator('.pop-self-reaction').waitFor();
        assert.ok(await page.locator('.pop-self-reaction').evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('.phase-notice').getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;}),'Emoji never covers response instructions');
      }
      for(const button of await page.locator('.aoe-action-bar button').all())await reachable(button);
      await page.screenshot({path:`${output}/phase-${phase}-${width}.png`});
    }
    await reset({currentAoeType:'GUANXING',pendingAoePlayers:[me]});send({event:'GUANXING_SHOW',cards:hand.slice(0,5)});await settle();
    await page.locator('.guanxing-content [role="button"]').nth(0).click();await page.locator('.guanxing-content [role="button"]').nth(1).click();await reachable(page.locator('.guanxing-content .wgfd-confirm-btn'));await page.locator('.guanxing-content .wgfd-confirm-btn').click();
    await reset({currentAoeType:'WGFD',pendingAoePlayers:[me],settings:{enableSkills:true,wgfdCards:hand.slice(0,4)}});await page.locator('.wgfd-content [role="button"]').first().click();await reachable(page.locator('.wgfd-content .wgfd-confirm-btn'));
    await reset();await page.locator('.pop-emoji-open').click();await page.locator('.pop-emoji-dialog [data-emoji]').last().click();
    await page.locator('.pop-board-header .exit-btn').click();await page.locator('.gb-exit-dialog').waitFor();await reachable(page.getByRole('button',{name:'留在房间',exact:true}));await page.screenshot({path:`${output}/exit-${width}.png`});await page.getByRole('button',{name:'留在房间',exact:true}).click();
  }
  await reset();
  for(const winner of [me,'阿布']){send({event:'GAME_OVER',winner,winningCards:hand.slice(4,6)});await settle();for(const [width,height] of [[1440,900],[390,844],[844,390]]){await page.setViewportSize({width,height});await settle();await page.screenshot({path:`${output}/result-${winner===me?'win':'lose'}-${width}.png`});await reachable(page.locator('.gb-result-footer button'));}}
  send({event:'GAME_STARTED'});await reset();await page.waitForTimeout(1300);await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('radio',{name:/原版/}).check();await page.getByRole('button',{name:'使用此主题',exact:true}).click();await settle();assert.equal(await page.locator('.gb-pop').count(),0);assert.equal(await page.locator('.game-table > .header').count(),1);await page.screenshot({path:`${output}/original-theme.png`});
  assert.deepEqual(errors,[]);
  console.log('PASS: pop battle layout, responsive actions, live socket payloads, emoji, response phases and results');
} catch(error){await page.screenshot({path:`${output}/failure.png`});console.error('Runtime errors:',errors);throw error;}
finally{await browser.close();}
