import { UNIT_ORDER, UNIT_TYPES } from './units.js';
import { MAP, FORESTS, HILLS, DEPLOYMENT, BRIDGE, riverCenter, riverHalfWidth, heightAt, terrainAt } from './terrain.js';

const $ = id => document.getElementById(id);
const ORDER_NAMES = { idle: '无移动指令', move: '优先移动', attack: '集中攻击', frontline: '战线驻守', advance: '接敌推进' };
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function createBattleHUD(state, art, actions) {
  let noticeUntil = 0, refresh = 0, previousPhase = '', helpWasPaused = false;
  const overlay = $('battle-overlay'), ctx = overlay.getContext('2d');
  const minimap = $('minimap'), mapCtx = minimap.getContext('2d');
  const background = document.createElement('canvas'); background.width = minimap.width; background.height = minimap.height;
  const bg = background.getContext('2d'), mw = background.width, mh = background.height;
  const worldWidth = MAP.maxX - MAP.minX, worldHeight = MAP.maxZ - MAP.minZ, damageLabels = [];
  const fogCanvas = document.createElement('canvas'); fogCanvas.width = 64; fogCanvas.height = 42;
  const fogCtx = fogCanvas.getContext('2d'), fogImage = fogCtx.createImageData(64, 42);
  const mx = x => (x - MAP.minX) / (MAP.maxX - MAP.minX) * mw;
  const mz = z => (z - MAP.minZ) / (MAP.maxZ - MAP.minZ) * mh;
  bg.fillStyle = '#aebd9e'; bg.fillRect(0, 0, mw, mh);
  for (const hill of HILLS) {
    for (let ring = 5; ring >= 1; ring--) { bg.beginPath(); bg.ellipse(mx(hill.x), mz(hill.z), hill.rx * mw / worldWidth * ring / 5, hill.rz * mh / worldHeight * ring / 5, 0, 0, Math.PI * 2); bg.fillStyle = `rgba(231,222,173,${.09 + ring * .01})`; bg.fill(); }
  }
  for (const forest of FORESTS) { bg.beginPath(); bg.ellipse(mx(forest.x), mz(forest.z), forest.rx * mw / worldWidth, forest.rz * mh / worldHeight, 0, 0, Math.PI * 2); bg.fillStyle = '#799875'; bg.fill(); }
  for (let x = MAP.minX; x < MAP.maxX; x += .8) for (let z = MAP.minZ; z < MAP.maxZ; z += .8) {
    const terrain = terrainAt(x, z);
    if (!['mud', 'road'].includes(terrain.kind)) continue;
    bg.fillStyle = terrain.kind === 'mud' ? '#7d8260' : '#cfb88e'; bg.fillRect(mx(x), mz(z), .85 * mw / worldWidth, .85 * mh / worldHeight);
  }
  bg.beginPath();
  for (let z = MAP.minZ; z <= MAP.maxZ; z += .4) bg.lineTo(mx(riverCenter(z) - riverHalfWidth(z)), mz(z));
  for (let z = MAP.maxZ; z >= MAP.minZ; z -= .4) bg.lineTo(mx(riverCenter(z) + riverHalfWidth(z)), mz(z));
  bg.closePath(); bg.fillStyle = '#6d9a91'; bg.fill();
  bg.fillStyle = '#c7b286'; bg.fillRect(mx(BRIDGE.minX), mz(BRIDGE.minZ), (BRIDGE.maxX - BRIDGE.minX) / worldWidth * mw, (BRIDGE.maxZ - BRIDGE.minZ) / worldHeight * mh);
  bg.fillStyle = '#b8c2a1'; bg.fillRect(mx(-2), mz(-10), 5 / worldWidth * mw, 4 / worldHeight * mh);

  function bind(id, action) { $(id).addEventListener('click', action); }
  for (const [id, action] of Object.entries(actions)) if ($(id)) bind(id, action);
  const thumbnails = art.thumbnails();
  for (const [index, kind] of UNIT_ORDER.entries()) {
    const type = UNIT_TYPES[kind], button = document.createElement('button');
    button.className = 'troop-button'; button.dataset.kind = kind; button.dataset.key = index + 1; button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${type.name}，费用${type.cost}`);
    const img = document.createElement('img'); img.src = thumbnails[kind]; img.alt = '';
    const name = document.createElement('strong'), cost = document.createElement('small'); name.textContent = type.name; cost.textContent = type.cost;
    button.append(img, name, cost); button.addEventListener('click', () => actions.chooseKind(kind));
    button.addEventListener('pointerenter', () => {
      const r = button.getBoundingClientRect(); tooltip(`${type.name} · ${type.role}\n生命 ${type.hp}   攻击 ${type.attack}   护甲 ${type.armor}\n${type.trait}`, r.left, r.top - 110);
    }); button.addEventListener('pointerleave', hideTooltip); button.addEventListener('focus', () => {
      const r = button.getBoundingClientRect(); tooltip(`${type.name} · ${type.role}\n${type.trait}`, r.left, r.top - 76);
    }); button.addEventListener('blur', hideTooltip);
    $('troop-roster').append(button);
  }
  document.querySelectorAll('[data-count]').forEach(button => button.addEventListener('click', () => { state.batch = +button.dataset.count; actions.refreshPreview(); }));
  document.querySelectorAll('[data-formation]').forEach(button => button.addEventListener('click', () => { state.formation = button.dataset.formation; actions.refreshPreview(); }));
  minimap.addEventListener('pointerdown', event => {
    const r = minimap.getBoundingClientRect(); art.focus({ x: MAP.minX + (event.clientX - r.left) / r.width * worldWidth, z: MAP.minZ + (event.clientY - r.top) / r.height * worldHeight });
  });
  minimap.tabIndex = 0;
  minimap.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key]) return;
    event.preventDefault(); const [dx, dz] = directions[event.key], p = art.inspect().target;
    art.focus({ x: Math.max(MAP.minX + 2, Math.min(MAP.maxX - 2, p.x + dx * 6)), z: Math.max(MAP.minZ + 2, Math.min(MAP.maxZ - 2, p.z + dz * 6)) });
  });
  bind('battle-help', () => { helpWasPaused = state.sim.paused; state.sim.setPaused(true); $('battle-help-dialog').showModal(); });
  $('battle-help-dialog').addEventListener('close', () => { if (!helpWasPaused) state.sim.setPaused(false); });
  function notify(text, seconds = 2.8) { $('battle-notice').textContent = text; $('battle-notice').hidden = false; noticeUntil = performance.now() + seconds * 1000; }
  function tooltip(text, x, y) {
    const el = $('battle-hover'); el.textContent = text; el.hidden = false;
    el.style.left = `${Math.max(12, Math.min(innerWidth - 270, x + 14))}px`; el.style.top = `${Math.max(12, Math.min(innerHeight - 130, y + 12))}px`;
  }
  function hideTooltip() { $('battle-hover').hidden = true; }
  function renderMap(sim) {
    mapCtx.drawImage(background, 0, 0);
    const vision = art.visionMask();
    for (let i = 0; i < vision.data.length; i++) { fogImage.data[i * 4] = 22; fogImage.data[i * 4 + 1] = 34; fogImage.data[i * 4 + 2] = 28; fogImage.data[i * 4 + 3] = vision.data[i] ? 0 : 105; }
    fogCtx.putImageData(fogImage, 0, 0); mapCtx.drawImage(fogCanvas, 0, 0, mw, mh);
    if (sim.phase === 'preparation') { mapCtx.strokeStyle = '#326c54'; mapCtx.lineWidth = 1.7; mapCtx.strokeRect(mx(sim.side === 'east' ? -DEPLOYMENT.maxX : DEPLOYMENT.minX), mz(DEPLOYMENT.minZ), (DEPLOYMENT.maxX - DEPLOYMENT.minX) / worldWidth * mw, (DEPLOYMENT.maxZ - DEPLOYMENT.minZ) / worldHeight * mh); }
    for (const plan of sim.plans) {
      if (!plan.unitIds.some(id => sim.getUnit(id)?.hp > 0 && sim.getUnit(id).order.planId === plan.id)) continue;
      mapCtx.strokeStyle = '#e8f0b5'; mapCtx.lineWidth = 2; mapCtx.beginPath();
      plan.line.forEach((p, i) => i ? mapCtx.lineTo(mx(p.x), mz(p.z)) : mapCtx.moveTo(mx(p.x), mz(p.z))); mapCtx.stroke();
      if (plan.target) { mapCtx.beginPath(); mapCtx.moveTo(mx(plan.center.x), mz(plan.center.z)); mapCtx.lineTo(mx(plan.target.x), mz(plan.target.z)); mapCtx.stroke(); }
    }
    for (const unit of sim.units) if (unit.hp > 0 && sim.isVisible(unit)) {
      mapCtx.fillStyle = state.selection.has(unit.id) ? '#f5ffdf' : unit.team === 'ally' ? '#246b58' : '#9c3e2a';
      mapCtx.beginPath(); mapCtx.arc(mx(unit.x), mz(unit.z), state.selection.has(unit.id) ? 3.1 : 2.3, 0, Math.PI * 2); mapCtx.fill();
    }
    const camera = art.inspect(); mapCtx.strokeStyle = '#f4f6df'; mapCtx.lineWidth = 1; mapCtx.beginPath(); mapCtx.ellipse(mx(camera.target.x), mz(camera.target.z), camera.distance * .3 * mw / worldWidth, camera.distance * .2 * mh / worldHeight, 0, 0, Math.PI * 2); mapCtx.stroke();
  }
  function renderOverlay(sim) {
    const w = overlay.clientWidth, h = overlay.clientHeight, dpr = Math.min(devicePixelRatio, 1.5);
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) { overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (state.drag?.type === 'select' && state.drag.moved) {
      const d = state.drag; ctx.fillStyle = '#e9ffe522'; ctx.strokeStyle = '#eefbe6'; ctx.lineWidth = 1;
      ctx.fillRect(d.x, d.y, d.cx - d.x, d.cy - d.y); ctx.strokeRect(d.x + .5, d.y + .5, d.cx - d.x, d.cy - d.y);
    }
    for (const unit of sim.units) {
      if (unit.hp <= 0 || !sim.isVisible(unit) || !(state.selection.has(unit.id) || state.hoverUnit === unit.id || sim.time - unit.lastDamage < 2)) continue;
      const p = art.project(unit.x, unit.z, heightAt(unit.x, unit.z) + ({ mao: 1.25, jiahao: 1.85, mengqi: 1.9, kun: 1.7, nailong: 2.1, naiwa: 1.65 }[unit.kind]) + .24);
      if (!p.visible) continue;
      const bw = 25, x = p.x - bw / 2, y = p.y - 5;
      ctx.fillStyle = '#20382cbb'; ctx.fillRect(x - 1, y - 1, bw + 2, 5); ctx.fillStyle = unit.team === 'ally' ? '#9edb9f' : '#e4a27e'; ctx.fillRect(x, y, bw * unit.hp / unit.maxHp, 3);
      if (unit.maxShield) { ctx.fillStyle = '#9bd6dc'; ctx.fillRect(x, y - 3, bw * unit.shield / unit.maxShield, 1.5); }
      if (state.selection.has(unit.id) && unit.team === 'ally') { ctx.fillStyle = '#eaf6dc'; ctx.beginPath(); ctx.moveTo(p.x - 3, y - 7); ctx.lineTo(p.x + 3, y - 7); ctx.lineTo(p.x, y - 4); ctx.fill(); }
    }
    ctx.textAlign = 'center'; ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    for (const label of damageLabels) {
      if (!sim.isPointVisible(label)) continue;
      const p = art.project(label.x, label.z, heightAt(label.x, label.z) + 1.8 + label.age * 1.2);
      if (!p.visible) continue;
      ctx.globalAlpha = Math.max(0, 1 - label.age / .85);
      ctx.lineWidth = 3; ctx.strokeStyle = '#20352ad9'; ctx.strokeText(label.text, p.x, p.y);
      ctx.fillStyle = label.shield ? '#ade9ff' : '#ffe3a5'; ctx.fillText(label.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
  function render(dt, force = false) {
    for (let i = damageLabels.length - 1; i >= 0; i--) { damageLabels[i].age += dt; if (damageLabels[i].age > .85) damageLabels.splice(i, 1); }
    const sim = state.sim; renderOverlay(sim); refresh += dt;
    if (noticeUntil && performance.now() > noticeUntil) { $('battle-notice').hidden = true; noticeUntil = 0; }
    if (!force && refresh < .1) return; refresh = 0;
    const snap = sim.snapshot(), preparation = sim.phase === 'preparation';
    const locked = sim.network && (sim.ready && preparation || !sim.connected);
    $('battle').dataset.phase = sim.phase;
    $('battle').dataset.network = String(!!sim.network);
    $('battle-heading-label').textContent = sim.network ? '联网 PVP · 1v1' : '第一关';
    $('battle-title').textContent = sim.network ? sim.side === 'east' ? '东岸军团' : '西岸军团' : '河岸争夺';
    $('battle-room').hidden = !sim.network;
    if (sim.network) {
      $('room-code').textContent = sim.code;
      $('room-connection').textContent = !sim.connected ? sim.connectionMessage || '连接中断 · 自动重连中' : !sim.opponentPresent ? '等待对手加入' : !sim.opponentConnected ? `对手重连中 · ${sim.reconnectSeconds} 秒` : preparation ? `己方${sim.ready ? '已准备' : '布阵中'} · 对手${sim.opponentReady ? '已准备' : '布阵中'}` : '双方已连接';
    }
    $('ally-count').textContent = snap.allies; $('enemy-count').textContent = snap.visibleEnemies;
    $('vision-status').textContent = snap.visibleEnemies ? `发现敌军 ${snap.visibleEnemies} 名` : '敌军位置未知 · 向前侦察';
    $('battle-budget').textContent = sim.budget.toLocaleString('en-US'); $('battle-time').textContent = formatTime(sim.time);
    $('battle-phase').textContent = preparation ? '准备布阵' : sim.phase === 'battle' ? sim.paused ? '已暂停 · 仍可下令' : '交战中' : sim.phase === 'victory' ? '胜利' : '败北';
    $('preparation-dock').hidden = !preparation; $('combat-controls').hidden = preparation;
    $('battle-objective').hidden = !preparation;
    $('start-battle').disabled = !snap.allies || sim.network && !sim.connected; $('undo-deploy').disabled = !sim.history.length || locked;
    $('start-label').textContent = sim.network ? sim.ready ? '取消准备' : '准备' : '开战';
    $('battle-objective').textContent = sim.network ? `在${sim.side === 'east' ? '东' : '西'}岸准备区布阵，双方准备后开战` : '在西岸布阵，侦察并击败对岸守军';
    $('quick-deploy').disabled = locked;
    $('battle-restart').hidden = !!sim.network; $('battle-surrender').hidden = !sim.network;
    $('pause-battle').hidden = !!sim.network; $('battle-speed').hidden = !!sim.network;
    $('battle-speed').textContent = `${state.speed}×`; $('pause-battle').textContent = sim.paused ? '▷' : 'Ⅱ'; $('pause-battle').setAttribute('aria-label', sim.paused ? '继续战斗' : '暂停战斗');
    document.querySelectorAll('.troop-button').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.kind === state.placementKind)); button.disabled = locked; });
    document.querySelectorAll('[data-count]').forEach(button => button.setAttribute('aria-pressed', String(+button.dataset.count === state.batch)));
    document.querySelectorAll('[data-formation]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.formation === state.formation)));
    for (const tool of ['select', 'frontline', 'offensive']) $(`tool-${tool}`).setAttribute('aria-pressed', String(tool === state.tool));
    const selected = sim.units.filter(u => state.selection.has(u.id) && u.hp > 0);
    $('battle-selection').hidden = !selected.length || !['preparation', 'battle'].includes(sim.phase);
    $('selection-title').textContent = selected.length === 1 ? UNIT_TYPES[selected[0].kind].name : `已选 ${selected.length} 名`;
    const orders = new Set(selected.map(u => u.order.kind)); $('selection-order').textContent = orders.size === 1 ? ORDER_NAMES[[...orders][0]] : '多项指令';
    const modes = new Set(selected.map(u => u.mode)); $('selection-mode').textContent = modes.size > 1 ? '混合状态' : modes.has('auto') ? '自动战斗' : '待命';
    $('battle-hold').setAttribute('aria-pressed', String(modes.size === 1 && modes.has('hold')));
    $('battle-auto').setAttribute('aria-pressed', String(modes.size === 1 && modes.has('auto')));
    $('battle-hold').disabled = $('battle-auto').disabled = locked;
    $('battle-remove').hidden = !preparation; $('battle-remove').disabled = locked;
    $('tool-frontline').disabled = !selected.length || locked; $('tool-offensive').disabled = locked || !sim.plans.some(p => p.unitIds.some(id => sim.getUnit(id)?.order.planId === p.id));
    const executing = sim.plans.some(p => p.executing); $('execute-icon').textContent = executing ? 'Ⅱ' : '▷'; $('execute-label').textContent = executing ? '停止推进' : '执行计划';
    $('execute-plan').disabled = preparation || !sim.plans.some(p => p.target && p.unitIds.some(id => sim.getUnit(id)?.order.planId === p.id));
    $('battle-result').hidden = !['victory', 'defeat'].includes(sim.phase);
    $('result-retry').hidden = !!sim.network;
    $('result-eyebrow').textContent = sim.network ? `联网 PVP · 房间 ${sim.code}` : '第一关 · 河岸争夺';
    if (sim.phase !== previousPhase) {
      if (['victory', 'defeat'].includes(sim.phase)) {
        $('result-title').textContent = sim.phase === 'victory' ? '拿下了。' : '再来一局。';
        $('result-stats').textContent = `${formatTime(sim.time)} · 歼敌 ${snap.kills.ally} · 己方存活 ${snap.allies}${sim.network ? ` · ${sim.reason}` : ''}`;
        $(sim.network ? 'result-home' : 'result-retry').focus({ preventScroll: true }); hideTooltip();
      } previousPhase = sim.phase;
    }
    $('battle-controls-hint').textContent = state.tool === 'frontline' ? '左键拖出战线 · 右键取消' : state.tool === 'offensive' ? '从战线向目标拖动 · Enter 执行 · 右键取消' : state.placementKind ? '点击放置 · 拖动仍可框选 · R 旋转 · 右键退出' : '左键框选 · 右键指挥 · 中键环视 · 滚轮缩放';
    renderMap(sim);
  }
  return { render, notify, tooltip, hideTooltip,
    resetFeedback() { damageLabels.length = 0; previousPhase = ''; noticeUntil = 0; $('battle-notice').hidden = true; },
    feedback(events) {
      for (const event of events) if (event.kind === 'hit') {
        const shield = event.shieldDamage > 0;
        damageLabels.push({ ...event, age: 0, shield, text: `${shield ? '盾 ' : ''}−${Math.ceil(event.amount + event.shieldDamage)}` });
      }
      if (damageLabels.length > 48) damageLabels.splice(0, damageLabels.length - 48);
    }
  };
}
