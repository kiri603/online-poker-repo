import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless:true, ...(process.env.LAYOUT_BROWSER_PATH ? { executablePath:process.env.LAYOUT_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport:{width:1440,height:900},reducedMotion:'reduce' });
await context.addInitScript(() => localStorage.setItem('poker:ui-theme','pop'));
const output = fileURLToPath(new URL('../../temp-screenshots/waiting-room-live/',import.meta.url));
await mkdir(output,{recursive:true});
const user = { id:1,username:'garden-owner',nickname:'桃桃不淘',guest:false,level:1,tabToken:'garden-isolated-test' };
const peers = [
  {userId:user.username,nickname:user.nickname,avatar:'/images/avatars/cat-tuxedo.png',isReady:true},
  {userId:'general',nickname:'关二爷',avatar:'/images/avatars/general.png',isReady:true},
  {userId:'dog',nickname:'阿柴',avatar:'/images/avatars/dog-shiba.png',isReady:false},
];
const snapshot = {event:'SYNC_STATE',phase:'WAITING',isStarted:false,ownerId:user.username,players:peers,spectators:['viewer'],settings:{enableWildcard:false,enableScrollCards:true,enableSkills:true},tableCards:[],currentAoeType:null};
const commands=[],errors=[];
let socket;
let holdJoin = false, onRecoveryJoin;
await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await context.route('**/at.alicdn.com/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data={};
  if(path==='/api/auth/me')data=user;
  if(path==='/api/rooms')data=[{roomId:'0618',playerCount:peers.length,capacity:4,status:'WAITING',enableSkills:true}];
  if(path==='/api/rooms/check')data={exists:true,isPrivate:false};
  if(path==='/api/social/overview')data={avatar:peers[0].avatar,friends:[{userId:'friend',nickname:'小桃不桃',online:true}],pendingFriendRequests:[],pendingInvites:[]};
  if(path==='/api/social/profile')data={userId:user.username,loginName:user.username,nickname:user.nickname,avatar:peers[0].avatar,records:[]};
  if(path==='/api/avatars')data=[];
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
const sync=()=>socket.send(JSON.stringify(snapshot));
await context.routeWebSocket('**',ws=>{
  socket=ws;
  ws.onMessage(raw=>{
    const message=JSON.parse(raw);commands.push(message);
    if(message.type==='JOIN_ROOM'){if(holdJoin)onRecoveryJoin?.();else sync();}
    if(message.type==='PING')ws.send(JSON.stringify({event:'PONG'}));
    if(message.type==='UPDATE_SETTINGS'){snapshot.settings={...message.data};sync();}
    if(message.type==='READY'){peers[0].isReady=!peers[0].isReady;sync();}
    if(message.type==='SEND_CHAT')ws.send(JSON.stringify({event:'CHAT_RECEIVED',userId:user.username,text:message.data,sentAt:Date.now()}));
    if(message.type==='ADD_SCRIPT_AI'){peers.push({userId:'bot-1',nickname:'摸鱼军师',isBot:true,isReady:true});sync();}
    if(message.type==='KICK_PLAYER'){snapshot.players=snapshot.players.filter(p=>p.userId!==message.data);sync();}
  });
});
const page=await context.newPage();page.setDefaultTimeout(10000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='warning')errors.push(m.text());});
page.on('dialog',d=>d.accept());
const root=page.locator('.garden-room');
const settle=async()=>{await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});};
async function capture(name){await settle();await page.screenshot({path:`${output}/${name}.png`,fullPage:true});}
const tableState = () => root.locator('.table-play').evaluate(el=>({
  html:el.innerHTML,
  sequence:Math.max(0,...[...el.querySelectorAll('.play-hand')].map(hand=>Number(hand.dataset.hand))),
  animations:el.getAnimations({subtree:true}).map(animation=>({state:animation.playState,time:animation.currentTime})),
}));
async function assertFrozen(label){
  await page.waitForTimeout(60);
  const before=await tableState();await page.waitForTimeout(300);const after=await tableState();
  assert.equal(after.html,before.html,`${label}: dealing stops`);
  assert.deepEqual(after.animations,before.animations,`${label}: in-flight cards remain frozen`);
  assert.ok(after.animations.every(animation=>animation.state==='paused'),`${label}: no running animation`);
}
async function changeTheme(theme){await page.getByRole('button',{name:'设置',exact:true}).click();const nav=page.getByRole('navigation',{name:'设置分区'});if(await nav.isVisible())await nav.getByRole('button',{name:'主题',exact:true}).click();await page.getByRole('radio',{name:new RegExp(theme)}).check();await page.getByRole('button',{name:'使用此主题',exact:true}).click();await settle();}
try {
  await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:5173/');
  await page.locator('.pop-lobby').waitFor();
  for(const text of ['我知道了','暂时跳过']){const button=page.getByRole('button',{name:text,exact:true});if(await button.isVisible())await button.click();}
  await page.getByRole('button',{name:'加入房间 0618',exact:true}).click();await root.waitFor();await settle();
  assert.equal(await root.locator('.seat').count(),4);
  assert.equal(await root.locator('.primary-action').isDisabled(),true);
  assert.equal(await root.locator('.brand').innerText(),'');
  assert.equal(await root.getByText('好友房',{exact:true}).count(),0);
  assert.equal(await root.getByRole('img',{name:'等待开局',exact:true}).count(),0,'The selected push-card study replaces the waiting title');
  assert.equal(await root.locator('.table-play .play-card').count(),3,'Reduced motion retains the approved static table composition');
  assert.equal(await root.locator('.table-play').evaluate(el=>el.getAnimations({subtree:true}).length),0,'Reduced motion never starts decorative dealing');
  assert.equal(await root.locator('.table-assembly .table-layer').count(),2,'The approved print study keeps both offset ink layers');
  assert.equal(await root.locator('.mascot, img[src*="xiaotao"]').count(),0,'The waiting room no longer includes the mascot');
  assert.equal(await root.locator('.preview-bar, .variant-tabs, #ready-demo').count(),0,'Design-lab controls stay out of the live room');
  const appearance=await root.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,display:getComputedStyle(el).display,contentWidth:el.querySelector('.garden-content').getBoundingClientRect().width}));
  assert.equal(appearance.background,'rgb(242, 238, 223)');assert.equal(appearance.color,'rgb(37, 38, 34)');assert.equal(appearance.display,'block');assert.equal(appearance.contentWidth,1440);
  await capture('garden-desktop');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(60);
  const baseline=await tableState(),commandCount=commands.filter(command=>command.type!=='PING').length;
  await page.waitForFunction(previous=>Math.max(...[...document.querySelectorAll('.garden-room .play-hand')].map(hand=>Number(hand.dataset.hand)))>previous,baseline.sequence);
  assert.equal(commands.filter(command=>command.type!=='PING').length,commandCount,'Ambient dealing never sends gameplay commands');
  assert.equal(await root.locator('.play-hand[data-from="3"]').count(),0,'An empty seat never deals');
  await root.locator('.table-play-trigger').click();await page.waitForTimeout(140);await capture('garden-push-midframe');
  await root.getByRole('button',{name:'房间设置',exact:true}).click();await assertFrozen('Room settings');await page.keyboard.press('Escape');
  await root.getByRole('button',{name:'设置',exact:true}).click();await assertFrozen('Global settings');await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  holdJoin=true;const recoveryJoin=new Promise(resolve=>{onRecoveryJoin=resolve;});socket.close();
  await page.locator('.connection-recovery').waitFor();await assertFrozen('Reconnecting');
  await Promise.race([recoveryJoin,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Recovery did not rejoin')),3000))]);
  holdJoin=false;sync();await page.locator('.connection-recovery').waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(60);
  assert.equal((await tableState()).animations.length,0,'Changing reduced motion cancels an active deal');
  await assertFrozen('Reduced motion');
  await root.locator('.self-avatar').click();await page.getByRole('dialog',{name:'战绩',exact:true}).waitFor();await page.getByRole('button',{name:'关闭个人中心',exact:true}).click();
  await root.getByRole('button',{name:'房间设置',exact:true}).click();
  await root.getByRole('checkbox',{name:'锦囊牌',exact:true}).uncheck();
  assert.equal(commands.at(-1).type,'UPDATE_SETTINGS');assert.equal(commands.at(-1).data.enableScrollCards,false);
  await page.keyboard.press('Escape');await root.locator('.seat.empty').click();
  const invite=root.getByRole('dialog',{name:'邀请好友',exact:true});await invite.waitFor();
  assert.equal(await invite.getByRole('button',{name:'添加AI',exact:true}).count(),1);
  await capture('garden-invite');await page.keyboard.press('Escape');
  await root.getByRole('button',{name:'聊天室',exact:true}).click();
  await root.getByRole('textbox',{name:'消息',exact:true}).fill('<b>准备了</b>');
  await root.getByRole('button',{name:'发送',exact:true}).click();
  await root.locator('[data-bubble-user="garden-owner"]').waitFor();
  assert.equal(commands.at(-1).type,'SEND_CHAT');
  assert.equal(await root.locator('[data-bubble-user="garden-owner"] span').innerText(),'<b>准备了</b>');
  assert.equal(await root.locator('[data-bubble-user="garden-owner"] b').count(),0);
  assert.equal(await root.locator('[data-bubble-user="garden-owner"] path').count(),1);
  socket.send(JSON.stringify({event:'CHAT_RECEIVED',userId:'dog',text:'稍等',sentAt:Date.now()}));
  await root.locator('[data-bubble-user="dog"]').waitFor();await capture('garden-chat');
  for(const [width,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,900],[844,390]]){
    await page.setViewportSize({width,height});await root.evaluate(el=>{el.scrollTop=0;});await settle();await capture(`garden-${width}x${height}`);
    const seats=await root.evaluate(el=>{
      const stage=el.querySelector('.stage'),bounds=stage.getBoundingClientRect();
      return [...stage.querySelectorAll('.seat')].map(seat=>{
        const rect=seat.getBoundingClientRect();
        return {x:rect.x-bounds.x+rect.width/2,y:rect.y-bounds.y+rect.height/2,width:rect.width,height:rect.height};
      });
    });
    assert.equal(seats.length,4);
    assert.ok(seats.every(seat=>seat.width>=44 && seat.height>=44),`Seat controls remain usable at ${width}`);
    assert.ok(Math.abs(seats[0].x-seats[2].x)<=1 && seats[1].x<seats[0].x && seats[3].x>seats[0].x,`Seats remain arranged around the table at ${width}`);
    assert.ok([seats[1],seats[3]].every(seat=>seat.y>seats[0].y && seat.y<seats[2].y),`Side seats remain between the north and self seats at ${width}: ${JSON.stringify(seats)}`);
    const geometry=await root.evaluate(el=>({overflow:el.scrollWidth-el.clientWidth,seats:el.querySelectorAll('.seat').length,blocked:[...el.querySelectorAll('.seat')].filter(s=>s.getBoundingClientRect().bottom>el.querySelector('.room-footer').getBoundingClientRect().top).length}));
    assert.equal(geometry.overflow,0,`No horizontal overflow ${width}`);assert.equal(geometry.blocked,0,`Seats above actions ${width}`);
    await root.getByRole('button',{name:'房间设置',exact:true}).click();
    const dialog=root.getByRole('dialog',{name:'房间设置',exact:true});
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width+1 && bounds.y+bounds.height<=height+1);
    await page.keyboard.press('Escape');
    const primary=root.locator('.primary-action');await primary.scrollIntoViewIfNeeded();
    assert.equal(await primary.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true,`Reachable primary action ${width}`);
  }
  await page.setViewportSize({width:1440,height:900});
  peers[2].isReady=true;sync();await page.waitForFunction(()=>!document.querySelector('.garden-room .primary-action').disabled);
  await root.getByRole('button',{name:'开始游戏',exact:true}).click();assert.equal(commands.at(-1).type,'START_GAME');
  await root.getByRole('button',{name:'添加AI',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.garden-room .occupied').length===4);assert.equal(await root.locator('.ai-add').isDisabled(),true);
  snapshot.ownerId='general';peers[0].isReady=false;sync();await root.getByRole('button',{name:'我准备好了',exact:true}).waitFor();
  await root.getByRole('button',{name:'我准备好了',exact:true}).click();assert.equal(commands.at(-1).type,'READY');
  await root.getByRole('button',{name:'房间设置',exact:true}).click();assert.equal(await root.getByRole('checkbox',{name:'锦囊牌',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');
  snapshot.players=peers.filter(p=>p.userId!==user.username);snapshot.spectators=[user.username,'viewer'];sync();
  await root.getByRole('button',{name:'旁观中',exact:true}).waitFor();assert.equal(await root.locator('.primary-action').isDisabled(),true);await capture('garden-spectator');
  snapshot.ownerId=user.username;snapshot.players=peers;snapshot.spectators=['viewer'];sync();
  snapshot.players=[peers[0]];sync();await page.waitForFunction(()=>document.querySelectorAll('.garden-room .occupied').length===1);
  assert.equal(await root.locator('.play-card').count(),0,'A single player does not simulate opponents');
  snapshot.players=peers;sync();await page.waitForFunction(()=>document.querySelectorAll('.garden-room .occupied').length===4);
  assert.equal(await root.locator('.play-hand').evaluateAll(hands=>hands.every(hand=>hand.dataset.userId===document.querySelector(`.garden-room [data-seat="${hand.dataset.from}"]`).dataset.userId)),true,'Hands follow current seat identities');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await root.locator('.table-play').evaluate(el=>{window.departedGardenLayer=el;});
  await changeTheme('原版');await page.locator('.wh-main').waitFor();assert.equal(await root.count(),0);
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(()=>window.departedGardenLayer.childElementCount),0,'Theme changes cancel pending deals and remove old cards');
  await changeTheme('简约波普');await root.waitFor();assert.equal(await root.locator('.seat').count(),4);
  await page.waitForTimeout(180);await capture('garden-mid-animation');
  await page.setViewportSize({width:390,height:844});await root.locator('.chat-open').scrollIntoViewIfNeeded();await root.locator('.chat-open').click();
  await root.getByRole('textbox',{name:'消息',exact:true}).fill('准备了');await root.getByRole('button',{name:'发送',exact:true}).click();await page.waitForTimeout(750);
  assert.equal(await root.locator('[data-bubble-user="garden-owner"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,'Sending from the scrolled mobile footer reveals the speaking avatar');
  await capture('garden-mobile-speech');
  await page.setViewportSize({width:1440,height:900});
  await root.getByRole('button',{name:'离开房间',exact:true}).click();await root.getByRole('button',{name:'离开',exact:true}).click();await page.locator('.pop-lobby').waitFor();
  await root.waitFor({state:'detached'});assert.equal(commands.findLast(m=>m.type!=='PING').type,'LEAVE_ROOM');
  assert.deepEqual(errors,[]);
  console.log('PASS: integrated garden waiting room, push-card animation, pause/recovery/cleanup, WebSocket commands, chat, role permissions and responsive layouts');
} catch(error) {await capture('failure');console.error('Runtime:',errors);throw error;}
finally{await browser.close();}
