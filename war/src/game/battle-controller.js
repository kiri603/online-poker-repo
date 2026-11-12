import { BattleSimulation } from './simulation.js';
import { createBattleRenderer } from './battle-renderer.js';
import { createBattleHUD } from './battle-hud.js';
import { UNIT_ORDER, UNIT_TYPES } from './units.js';
import { inMap, terrainAt, heightAt } from './terrain.js';
import { battleAudio } from './battle-audio.js';

export function createBattleController(world, onExit) {
  const canvas = world.renderer.domElement;
  const art = createBattleRenderer(world.renderer, world.scene.environment);
  const state = { sim: new BattleSimulation(), selection: new Set(), placementKind: null, batch: 5, formation: 'grid', angle: 0, tool: 'select', selectedPlan: null, speed: 1, drag: null, hoverUnit: null };
  let active = false, pointer = null, hoverPoint = null, hoverSince = 0, hud, accumulator = 0, observedPhase = 'preparation';
  const keys = new Set(), frameTimes = [];
  const ids = () => [...state.selection];
  const blocked = () => !!document.querySelector('dialog[open]');
  const planMembers = plan => plan.unitIds.filter(id => state.sim.getUnit(id)?.hp > 0 && state.sim.getUnit(id).order.planId === plan.id);
  async function perform(operation) {
    const sim = state.sim;
    try {
      const result = await operation(sim);
      if (sim !== state.sim || !active) return null;
      if (result && typeof result === 'object' && !result.ok) { hud.notify(result.reason || '指令未执行'); return null; }
      return result;
    } catch { hud.notify('指令未执行，请检查连接'); return null; }
  }
  function changeSimulation(sim) {
    if (state.sim !== sim) state.sim.close?.();
    state.sim = sim; state.selection.clear(); state.selectedPlan = null; state.placementKind = null; state.tool = 'select'; state.speed = 1; state.drag = null;
    accumulator = 0; observedPhase = sim.phase; keys.clear(); art.preview(null); art.draft([]); art.resetEffects(); art.setSide(sim.side || 'west'); art.resetCamera(); hud.resetFeedback(); hud.hideTooltip();
  }

  function select(next, append = false) {
    state.selection = new Set(append ? [...state.selection, ...next] : next);
    const plans = new Set(ids().map(id => state.sim.getUnit(id)?.order.planId).filter(Boolean));
    if (plans.size === 1) state.selectedPlan = [...plans][0];
  }
  function setTool(tool) {
    if (!['preparation', 'battle'].includes(state.sim.phase)) return;
    if (tool === 'frontline' && !state.selection.size) return hud.notify('先框选要编入战线的部队');
    if (tool === 'offensive' && !state.sim.plans.some(p => planMembers(p).length)) return hud.notify('先画一条战线，再规划推进方向');
    state.tool = tool; state.placementKind = null; state.drag = null; art.draft([]); refreshPreview(); hud.hideTooltip();
    if (tool === 'frontline') hud.notify('按住左键画战线，选中部队将自动展开');
    if (tool === 'offensive') hud.notify('从战线向目标拖出箭头，再执行计划');
  }
  function chooseKind(kind) {
    if (state.sim.phase !== 'preparation') return;
    state.placementKind = state.placementKind === kind ? null : kind; state.tool = 'select'; state.drag = null;
    art.draft([]); refreshPreview();
  }
  function refreshPreview() {
    const kind = state.placementKind, center = pointer ? art.groundAt(pointer.x, pointer.y) : null;
    const valid = kind && center && state.sim.canDeploy(kind, center, state.batch, state.formation, state.angle).ok;
    art.preview(kind, center, state.batch, state.formation, state.angle, valid);
  }
  function reset() {
    if (state.sim.network) { onExit(); return; }
    changeSimulation(new BattleSimulation()); hud.render(0, true);
  }
  async function start() {
    const result = await perform(sim => sim.start());
    if (!result) { if (result !== null) hud.notify('先在准备区放置至少一名士兵'); return; }
    state.placementKind = null; state.tool = 'select'; state.drag = null; art.preview(null); art.draft([]); hud.hideTooltip();
    if (state.sim.network) hud.notify(state.sim.ready ? '已准备，等待对手' : '已取消准备');
    else hud.notify('战斗开始。默认待命，可右键调动或切换自动战斗');
    hud.render(0, true);
  }
  async function execute() {
    if (state.sim.phase !== 'battle') return hud.notify('开战后即可执行推进计划');
    if (state.sim.plans.some(p => p.executing)) { const result = await perform(sim => { if (sim.network) return sim.pausePlans(); sim.pausePlans(); return true; }); if (result) hud.notify('停止推进，计划内的部队就地驻守'); }
    else if (await perform(sim => sim.executePlans())) hud.notify('开始推进，部队会沿途接敌');
    else hud.notify('先为战线画一支推进箭头');
  }
  const actions = {
    chooseKind, refreshPreview,
    'battle-home': () => { active = false; state.sim.setPaused(true); keys.clear(); onExit(); },
    'battle-restart': reset, 'result-retry': reset,
    'result-home': () => { active = false; onExit(); },
    'battle-camera': () => art.resetCamera(),
    'tool-select': () => setTool('select'), 'tool-frontline': () => setTool('frontline'), 'tool-offensive': () => setTool('offensive'),
    'execute-plan': execute, 'start-battle': start,
    'quick-deploy': async () => { if (!await perform(sim => sim.quickDeploy())) return; state.placementKind = null; state.selectedPlan = null; select([]); refreshPreview(); hud.notify('已部署推荐军队，默认待命'); },
    'undo-deploy': async () => { await perform(sim => sim.undo()); select(ids().filter(id => state.sim.getUnit(id))); refreshPreview(); },
    'battle-remove': async () => { if (await perform(sim => sim.remove(ids()))) hud.notify('已移除选中部队，费用已返还'); select([]); refreshPreview(); },
    'battle-auto': async () => { if (await perform(sim => sim.setMode(ids(), 'auto'))) hud.notify('自动战斗：追击全队视野内敌军'); },
    'battle-hold': async () => { if (await perform(sim => sim.setMode(ids(), 'hold'))) hud.notify('待命：原地攻击射程内敌军'); },
    'pause-battle': () => { if (!state.sim.network) state.sim.setPaused(!state.sim.paused); },
    'battle-speed': () => { if (!state.sim.network) state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1; },
    'battle-surrender': () => onExit()
  };
  hud = createBattleHUD(state, art, actions);

  async function command(x, y) {
    if (state.placementKind || state.tool !== 'select') { setTool('select'); hud.notify('已切回选择'); return; }
    if (!state.selection.size) return hud.notify('先点击或框选己方部队');
    const enemy = art.pickUnit(x, y, state.sim, 'enemy');
    if (enemy && state.sim.phase === 'battle') {
      if (await perform(sim => sim.issueAttack(ids(), enemy.id))) { art.mark(enemy, true); hud.notify(`集中攻击${UNIT_TYPES[enemy.kind].name}，待命部队不会追击`, 1.8); } return;
    }
    const ground = art.groundAt(x, y); if (!ground) return;
    art.mark(ground);
    if (await perform(sim => sim.issueMove(ids(), ground, state.formation))) { battleAudio.play({ kind: 'move' }); if (state.sim.phase === 'preparation') hud.notify('已重新布阵', 1.3); }
    else if (state.sim.phase === 'preparation') hud.notify('准备阶段只能在己方准备区调整阵型，且不能重叠');
    refreshPreview();
  }
  function nearestPlan(p) {
    let best = null, distance = Infinity;
    for (const plan of state.sim.plans) {
      if (!planMembers(plan).length) continue;
      // Measure the polyline itself, so drawing an arrow starts from any part of a front.
      for (let i = 1; i < plan.line.length; i++) {
        const a = plan.line[i - 1], b = plan.line[i], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
        if (d < distance) { distance = d; best = plan; }
      }
    }
    return distance < 5 ? best : state.sim.plans.find(p => p.id === state.selectedPlan && planMembers(p).length) || null;
  }
  canvas.addEventListener('contextmenu', event => { if (active) event.preventDefault(); });
  canvas.addEventListener('pointerdown', event => {
    if (!active || blocked()) return;
    hud.hideTooltip();
    if (event.button === 2) { event.preventDefault(); command(event.clientX, event.clientY); return; }
    if (![0, 1].includes(event.button)) return;
    const x = event.clientX, y = event.clientY;
    if (event.button === 1) { event.preventDefault(); state.drag = { type: 'orbit', x, y, cx: x, cy: y }; }
    else if (state.tool === 'frontline') {
      const p = art.groundAt(x, y); if (!p || !inMap(p.x, p.z)) return;
      state.drag = { type: 'frontline', points: [p], x, y, cx: x, cy: y };
    } else if (state.tool === 'offensive') {
      const p = art.groundAt(x, y), plan = p && nearestPlan(p);
      if (!plan) return hud.notify('从已有战线附近开始拖动');
      state.selectedPlan = plan.id; state.drag = { type: 'offensive', planId: plan.id, point: p, x, y, cx: x, cy: y };
    } else state.drag = { type: 'select', x, y, cx: x, cy: y, moved: false, shift: event.shiftKey };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!active || blocked()) return;
    pointer = { x: event.clientX, y: event.clientY };
    const d = state.drag;
    if (d?.type === 'orbit') { art.orbit(pointer.x - d.cx, pointer.y - d.cy); d.cx = pointer.x; d.cy = pointer.y; refreshPreview(); return; }
    if (d) {
      d.cx = pointer.x; d.cy = pointer.y;
      if (d.type === 'select') { d.moved ||= Math.hypot(d.cx - d.x, d.cy - d.y) > 6; if (d.moved) art.preview(null); }
      else {
        const p = art.groundAt(pointer.x, pointer.y); if (!p || !inMap(p.x, p.z)) return;
        if (d.type === 'frontline') { const last = d.points.at(-1); if (Math.hypot(last.x - p.x, last.z - p.z) > .65) d.points.push(p); art.draft(d.points); }
        else { d.point = p; const plan = state.sim.plans.find(p => p.id === d.planId); art.draft([plan.center, p], true); }
      }
      hud.hideTooltip(); return;
    }
    refreshPreview();
    const unit = art.pickUnit(pointer.x, pointer.y, state.sim); state.hoverUnit = unit?.id ?? null;
    const p = art.groundAt(pointer.x, pointer.y);
    if (!hoverPoint || !p || Math.hypot((p?.x || 0) - hoverPoint.x, (p?.z || 0) - hoverPoint.z) > .3) { hoverSince = performance.now(); hoverPoint = p; hud.hideTooltip(); }
  });
  canvas.addEventListener('pointerup', async event => {
    if (!active || event.button !== 0 && event.button !== 1) return;
    const d = state.drag; state.drag = null; if (!d) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (d.type === 'select') {
      if (d.moved) {
        const next = state.sim.units.filter(unit => {
          if (unit.team !== 'ally' || unit.hp <= 0) return false;
          const p = art.project(unit.x, unit.z, heightAt(unit.x, unit.z) + .65);
          return p.visible && p.x >= Math.min(d.x, d.cx) && p.x <= Math.max(d.x, d.cx) && p.y >= Math.min(d.y, d.cy) && p.y <= Math.max(d.y, d.cy);
        }).map(u => u.id);
        select(next, d.shift); state.placementKind = null; refreshPreview();
      } else if (state.placementKind) {
        const p = art.groundAt(event.clientX, event.clientY);
        if (p) { const result = await perform(sim => sim.deploy(state.placementKind, p, state.batch, state.formation, state.angle)); if (result?.ok) { select(result.ids); art.mark(p); } refreshPreview(); }
      } else {
        const unit = art.pickUnit(event.clientX, event.clientY, state.sim, 'ally');
        if (d.shift && unit && state.selection.has(unit.id)) state.selection.delete(unit.id);
        else select(unit ? [unit.id] : [], d.shift);
        if (!unit) { const p = art.groundAt(event.clientX, event.clientY); if (p) { const plan = nearestPlan(p); if (plan && Math.hypot(p.x - plan.center.x, p.z - plan.center.z) < 7) { state.selectedPlan = plan.id; select(planMembers(plan)); } } }
      }
    } else if (d.type === 'frontline') {
      const end = art.groundAt(event.clientX, event.clientY);
      if (end && inMap(end.x, end.z) && Math.hypot(end.x - d.points.at(-1).x, end.z - d.points.at(-1).z) > .03) d.points.push(end);
      const result = await perform(sim => sim.assignFrontline(ids(), d.points));
      if (result?.ok) { state.selectedPlan = result.planId; hud.notify('战线已建立。按 G 画推进箭头'); setTool('select'); }
    } else if (d.type === 'offensive') {
      if (Math.hypot(d.cx - d.x, d.cy - d.y) < 8) hud.notify('按住左键，从战线拖向目的地');
      else if (await perform(sim => sim.setOffensiveTarget(d.planId, d.point))) { hud.notify(state.sim.phase === 'preparation' ? '推进方向已保存，开战后按 Enter 执行' : '方向已设定，按 Enter 执行'); setTool('select'); }
    }
    art.draft([]); hud.render(0, true);
  });
  canvas.addEventListener('pointercancel', () => { state.drag = null; art.draft([]); });
  canvas.addEventListener('pointerleave', () => { if (!state.drag) { pointer = null; state.hoverUnit = null; art.preview(null); hud.hideTooltip(); } });
  canvas.addEventListener('wheel', event => { if (!active || blocked()) return; event.preventDefault(); art.zoom(event.deltaY); refreshPreview(); hud.hideTooltip(); }, { passive: false });
  document.addEventListener('keydown', event => {
    if (!active || blocked() || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase(); if (!event.ctrlKey && !event.metaKey) keys.add(key);
    if ((event.ctrlKey || event.metaKey) && key === 'a') { event.preventDefault(); select(state.sim.units.filter(u => u.team === 'ally' && u.hp > 0).map(u => u.id)); state.placementKind = null; refreshPreview(); }
    else if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); actions['undo-deploy'](); }
    else if (key === 'escape') { event.preventDefault(); setTool('select'); select([]); }
    else if (key === 'f') { event.preventDefault(); setTool('frontline'); }
    else if (key === 'g') { event.preventDefault(); setTool('offensive'); }
    else if (key === 'v') setTool('select');
    else if (key === 'r' && state.placementKind) { state.angle += Math.PI / 4; refreshPreview(); }
    else if (key === 'h') art.resetCamera();
    else if (key === 'x') actions['battle-auto']();
    else if (key === 'c') actions['battle-hold']();
    else if (key === 'enter') { event.preventDefault(); if (state.sim.phase === 'preparation') start(); else execute(); }
    else if (key === ' ') { event.preventDefault(); actions['pause-battle'](); }
    else if (['delete', 'backspace'].includes(key)) { event.preventDefault(); actions['battle-remove'](); }
    else if (/^[1-6]$/.test(key)) chooseKind(UNIT_ORDER[Number(key) - 1]);
  });
  document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); if (active) state.sim.setPaused(true); state.drag = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) { keys.clear(); state.sim.setPaused(true); } });

  function update(dt) {
    if (!active) return;
    if (!blocked()) {
      const movement = art.inspect().distance * .37 * dt;
      art.pan((keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0), movement);
      art.rotate(((keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0)) * dt * 1.2);
    }
    if (state.sim.network) state.sim.updateNetwork();
    else if (state.sim.phase === 'battle' && !state.sim.paused) {
      accumulator = Math.min(accumulator + dt * state.speed, .3);
      while (accumulator >= 1 / 30) { state.sim.step(1 / 30); accumulator -= 1 / 30; }
    } else accumulator = 0;
    for (const id of state.selection) if (!state.sim.getUnit(id) || state.sim.getUnit(id).hp <= 0) state.selection.delete(id);
    const events = state.sim.drainEvents().filter(event => state.sim.isPointVisible(event) || event.targetTeam === 'ally' || event.kind === 'death' && event.team === 'ally');
    const camera = art.inspect();
    for (const event of events) battleAudio.play(event, camera);
    if (observedPhase !== state.sim.phase) {
      if (state.sim.phase === 'battle') battleAudio.play({ kind: 'start' });
      if (['victory', 'defeat'].includes(state.sim.phase)) battleAudio.play({ kind: state.sim.phase });
      observedPhase = state.sim.phase;
    }
    hud.feedback(events); art.update(state.sim, state.selection, state.selectedPlan, dt, events); hud.render(dt);
    if (hoverPoint && pointer && !state.drag && !state.placementKind && state.tool === 'select' && performance.now() - hoverSince > 600) {
      const unit = state.sim.getUnit(state.hoverUnit);
      if (unit?.hp > 0 && state.sim.isVisible(unit)) hud.tooltip(`${unit.team === 'ally' ? '己方' : '敌方'} · ${unit.name}\n生命 ${Math.ceil(unit.hp)} / ${unit.maxHp}${unit.shield > 0 ? `   护盾 ${Math.ceil(unit.shield)}` : ''}\n${unit.trait}`, pointer.x, pointer.y);
      else {
        const terrain = terrainAt(hoverPoint.x, hoverPoint.z);
        const notes = { river: '移动速度 43% · 建议绕行桥梁或浅滩', ford: '移动速度 72% · 较快涉水', forest: '移动速度 78% · 远程减伤 35% · 林外 5.5 范围才可发现', highland: '对低处伤害 +15% · 远程射程 +20% · 视野 +3.5', bridge: '正常移动 · 狭窄通道', mud: '移动速度 52% · 避免重装部队陷入泥地', road: '移动速度 115% · 适合快速转移', plain: '正常移动 · 高地与巨石遮挡视线' };
        hud.tooltip(`${terrain.name} · 海拔 ${terrain.height.toFixed(1)}\n${notes[terrain.kind]}`, pointer.x, pointer.y);
      }
    }
    frameTimes.push(dt * 1000); if (frameTimes.length > 180) frameTimes.shift();
  }
  return {
    update,
    enter(sim) { active = true; if (sim) changeSimulation(sim); else if (state.sim.network) changeSimulation(new BattleSimulation()); keys.clear(); art.resetCamera(); hud.render(0, true); },
    leave() { active = false; keys.clear(); state.sim.setPaused(true); state.sim.close?.(); art.preview(null); state.drag = null; hud.hideTooltip(); },
    setQuality: art.setQuality,
    setMotion: art.setMotion,
    inspect() { if (state.sim.network) return null; return { ...state.sim.snapshot(), selection: ids(), tool: state.tool, placementKind: state.placementKind, batch: state.batch, formation: state.formation, speed: state.speed, plans: state.sim.plans.map(p => ({ ...p, members: planMembers(p) })), units: state.sim.units.map(u => ({ id: u.id, kind: u.kind, team: u.team, x: u.x, z: u.z, hp: u.hp, shield: u.shield, mode: u.mode, visible: state.sim.isVisible(u), order: { ...u.order } })), render: art.inspect(), audio: battleAudio.inspect(), averageFrameMs: frameTimes.reduce((a, b) => a + b, 0) / (frameTimes.length || 1) }; },
    project: art.project,
    // Deterministic scene setup for scale verification; unavailable unless explicitly requested by a URL flag.
    prepareScaleCheck() {
      if (state.sim.network || !new URLSearchParams(location.search).has('qa')) return false;
      state.sim = new BattleSimulation({ budget: 99999, enemyRoster: false });
      for (const team of ['ally', 'enemy']) for (let i = 0; i < 100; i++) state.sim.addUnit(UNIT_ORDER[i % 6], team, { x: (team === 'ally' ? -27 : 14) + i % 10 * 1.15, z: -13 + Math.floor(i / 10) * 2.6 });
      state.selection.clear(); return true;
    }
  };
}
