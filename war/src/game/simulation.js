import { UNIT_TYPES } from './units.js';
import { MAP, terrainAt, heightAt, inMap, inDeployment, isWalkable, nearestWalkable, findPath, canTraverse, formationPoints } from './terrain.js';
import { canObserve } from './visibility.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function attackRange(attacker, target) {
  const high = heightAt(attacker.x, attacker.z) - heightAt(target.x, target.z) > .8;
  return attacker.range * (attacker.range > 3 && high ? 1.2 : 1);
}
export function damageFor(attacker, target) {
  if (attacker.attack <= 0) return 0;
  const high = heightAt(attacker.x, attacker.z) - heightAt(target.x, target.z) > .8;
  const cover = attacker.range > 3 ? terrainAt(target.x, target.z).cover : 1;
  return Math.max(2, (attacker.attack - (target.armor || 0)) * cover * (high ? 1.15 : 1));
}

export class BattleSimulation {
  constructor({ budget = 4200, enemyRoster = true, aiEnabled = enemyRoster } = {}) {
    this.initialBudget = budget; this.budgets = { ally: budget, enemy: budget }; this.phase = 'preparation'; this.winner = null;
    this.time = 0; this.paused = false; this.units = []; this.projectiles = []; this.events = [];
    this.nextId = 1; this.histories = { ally: [], enemy: [] }; this.kills = { ally: 0, enemy: 0 };
    this.plans = []; this.nextPlanId = 1;
    this.visibility = { ally: new Set(), enemy: new Set() }; this.nextVision = 0; this.visionDirty = true;
    this.aiEnabled = aiEnabled; this.nextAiCommand = 0;
    if (enemyRoster) this.populateEnemies();
  }

  get budget() { return this.budgets.ally; }
  get history() { return this.histories.ally; }

  addUnit(kind, team, position, overrides = {}) {
    if (!UNIT_TYPES[kind] || !['ally', 'enemy'].includes(team)) throw new TypeError('Invalid unit kind or team');
    if (this.units.filter(u => u.hp > 0).length >= 200 || this.units.filter(u => u.hp > 0 && u.team === team).length >= 100) return null;
    const stats = UNIT_TYPES[kind], p = nearestWalkable(position);
    if (!p) return null;
    const unit = {
      ...stats, ...overrides, id: this.nextId++, kind, team, x: p.x, z: p.z,
      maxHp: stats.hp, hp: overrides.hp ?? stats.hp, maxShield: stats.shield,
      shield: overrides.shield ?? stats.shield, mode: 'hold', order: { kind: 'idle' }, targetId: null,
      yaw: team === 'ally' ? Math.PI / 2 : -Math.PI / 2, path: [], pathTarget: null,
      nextPath: 0, nextAttack: 0, nextSupport: 0, slowUntil: 0, stunnedUntil: 0,
      buffUntil: 0, lastDamage: -100, lastAttack: -100, diedAt: null,
      spawnZ: p.z, progressAt: 0, progressX: p.x, progressZ: p.z
    };
    this.units.push(unit); this.visionDirty = true; return unit;
  }

  populateEnemies() {
    for (let i = 0; i < 6; i++) this.addUnit('mengqi', 'enemy', { x: 11.5, z: -5 + i * 2.1 });
    for (let i = 0; i < 6; i++) this.addUnit('mao', 'enemy', { x: 10, z: -12 + i * 4.6 });
    for (let i = 0; i < 6; i++) this.addUnit('kun', 'enemy', { x: 17 + i % 2 * 2.3, z: 3 + Math.floor(i / 2) * 2.8 });
    for (let i = 0; i < 3; i++) this.addUnit('jiahao', 'enemy', { x: 19, z: -3 + i * 2 });
    for (let i = 0; i < 2; i++) this.addUnit('nailong', 'enemy', { x: 14, z: -2 + i * 6 });
    for (let i = 0; i < 2; i++) this.addUnit('naiwa', 'enemy', { x: 22, z: 3 + i * 5 });
    for (const unit of this.units) {
      const p = nearestWalkable({ x: unit.x + 20, z: unit.z * 1.6 });
      unit.x = p.x; unit.z = p.z; unit.spawnZ = p.z;
    }
  }

  canDeploy(kind, center, count = 1, formation = 'grid', angle = 0, team = 'ally') {
    const type = UNIT_TYPES[kind];
    if (this.phase !== 'preparation') return { ok: false, reason: '开战后不能增援' };
    if (!type || !Number.isInteger(count) || count < 1 || count > 100) return { ok: false, reason: '无效的编队数量' };
    if (this.units.filter(u => u.team === team).length + count > 100 || this.units.length + count > 200) return { ok: false, reason: '己方最多100名，总人数最多200名' };
    if (this.budgets[team] < type.cost * count) return { ok: false, reason: '预算不足' };
    const points = formationPoints(count, center, formation, 1.35, angle);
    if (points.some(p => !inDeployment(p.x, p.z, .35, this.deploymentTeam || team) || !isWalkable(p.x, p.z))) return { ok: false, reason: '整支编队必须位于己方准备区内' };
    if (points.some(p => this.units.some(u => u.team === team && distance(p, u) < type.radius + u.radius + .12))) return { ok: false, reason: '与已有部队重叠，请换一个位置' };
    return { ok: true, points };
  }

  deploy(kind, center, count = 1, formation = 'grid', angle = 0, team = 'ally') {
    const validation = this.canDeploy(kind, center, count, formation, angle, team);
    if (!validation.ok) return validation;
    const added = validation.points.map(p => this.addUnit(kind, team, p));
    this.budgets[team] -= UNIT_TYPES[kind].cost * count;
    const ids = added.map(u => u.id); this.histories[team].push(ids);
    return { ok: true, ids };
  }

  remove(ids, team = 'ally') {
    if (this.phase !== 'preparation') return 0;
    const set = new Set(ids); let count = 0;
    this.units = this.units.filter(unit => {
      if (unit.team === team && set.has(unit.id)) { this.budgets[team] += unit.cost; count++; return false; }
      return true;
    });
    if (count) this.visionDirty = true;
    return count;
  }
  undo(team = 'ally') { if (this.phase === 'preparation' && this.histories[team].length) return this.remove(this.histories[team].pop(), team); return 0; }
  clearAllies(team = 'ally') { const result = this.remove(this.units.map(u => u.id), team); this.histories[team] = []; if (this.phase === 'preparation') this.plans = this.plans.filter(p => p.team !== team); return result; }

  quickDeploy(team = 'ally') {
    if (this.phase !== 'preparation' || this.initialBudget < 3250) return false;
    this.clearAllies(team);
    const plan = [
      ['mengqi', 6, -18.3, -5, 2], ['mao', 6, -20.2, -7, 2.8],
      ['nailong', 2, -22, -3, 6], ['jiahao', 3, -23.6, -6, 6],
      ['kun', 6, -25.3, -5, 2], ['naiwa', 2, -27.1, -2, 4]
    ];
    const ids = [];
    for (const [kind, count, x, z, spacing] of plan) for (let i = 0; i < count; i++) {
      const unit = this.addUnit(kind, team, { x: (x - 18) * (team === 'enemy' ? -1 : 1), z: (z + i * spacing) * 1.5 });
      this.budgets[team] -= unit.cost; ids.push(unit.id);
    }
    this.histories[team].push(ids); return true;
  }

  start() {
    if (this.phase !== 'preparation' || !this.units.some(u => u.team === 'ally' && u.hp > 0)) return false;
    this.phase = 'battle'; this.paused = false; this.time = 0; this.refreshVisibility(); return true;
  }
  setPaused(value) { if (this.phase === 'battle') this.paused = !!value; }
  getUnit(id) { return this.units.find(u => u.id === id); }

  refreshVisibility() {
    const alive = this.units.filter(u => u.hp > 0);
    for (const team of ['ally', 'enemy']) {
      const observers = alive.filter(u => u.team === team), visible = new Set();
      for (const target of alive) if (target.team !== team && observers.some(u => canObserve(u, target))) visible.add(target.id);
      this.visibility[team] = visible;
    }
    this.nextVision = this.time + .1; this.visionDirty = false;
  }

  isPointVisible(point, team = 'ally') { return this.units.some(u => u.team === team && u.hp > 0 && canObserve(u, point)); }
  isVisible(unit, team = 'ally') {
    if (!unit) return false;
    if (unit.team === team) return true;
    if (this.visionDirty || this.time >= this.nextVision) this.refreshVisibility();
    return unit.hp > 0 ? this.visibility[team].has(unit.id) : this.isPointVisible(unit, team);
  }

  issueMove(ids, center, formation = 'grid', team = 'ally') {
    if (!['preparation', 'battle'].includes(this.phase) || !inMap(center.x, center.z)) return 0;
    const set = new Set(ids), units = this.units.filter(u => set.has(u.id) && u.team === team && u.hp > 0);
    if (!units.length) return 0;
    const centroid = { x: units.reduce((n, u) => n + u.x, 0) / units.length, z: units.reduce((n, u) => n + u.z, 0) / units.length };
    const angle = Math.atan2(center.z - centroid.z, center.x - centroid.x) - Math.PI / 2;
    const points = formationPoints(units.length, center, formation, 1.24, angle);
    if (this.phase === 'preparation') {
      if (points.some(p => !inDeployment(p.x, p.z, .35, team) || !isWalkable(p.x, p.z) || this.units.some(u => u.team === team && !set.has(u.id) && distance(p, u) < .86))) return 0;
      units.forEach((u, i) => { u.x = points[i].x; u.z = points[i].z; u.yaw = team === 'ally' ? Math.PI / 2 : -Math.PI / 2; u.order = { kind: 'idle' }; u.path = []; u.targetId = null; });
      this.visionDirty = true;
    } else {
      units.forEach((u, i) => {
        const raw = points[i], goal = nearestWalkable({ x: Math.max(MAP.minX + 1.2, Math.min(MAP.maxX - 1.2, raw.x)), z: Math.max(MAP.minZ + 1.2, Math.min(MAP.maxZ - 1.2, raw.z)) });
        u.order = { kind: 'move', x: goal.x, z: goal.z }; u.targetId = null; u.path = []; u.nextPath = 0;
      });
    }
    return units.length;
  }

  issueAttack(ids, targetId, team = 'ally') {
    if (this.phase !== 'battle') return 0;
    const target = this.getUnit(targetId);
    if (!target || target.team === team || target.hp <= 0 || !this.isVisible(target, team)) return 0;
    const set = new Set(ids); let count = 0;
    for (const unit of this.units) if (set.has(unit.id) && unit.team === team && unit.hp > 0) {
      unit.order = { kind: 'attack', targetId, lastX: target.x, lastZ: target.z }; unit.targetId = targetId; unit.path = []; unit.nextPath = 0; count++;
    }
    return count;
  }

  setMode(ids, mode, team = 'ally') {
    if (!['preparation', 'battle'].includes(this.phase) || !['hold', 'auto'].includes(mode)) return 0;
    const set = new Set(ids);
    let count = 0;
    for (const unit of this.units) if (set.has(unit.id) && unit.team === team && unit.hp > 0) {
      unit.mode = mode; unit.order = { kind: 'idle' }; unit.path = []; unit.targetId = null; unit.nextPath = 0; count++;
    }
    return count;
  }

  assignFrontline(ids, line, team = 'ally') {
    if (!['preparation', 'battle'].includes(this.phase) || !Array.isArray(line) || line.length < 2 || line.some(p => !inMap(p.x, p.z))) return { ok: false, reason: '请在地图内拖出战线' };
    const set = new Set(ids), units = this.units.filter(u => set.has(u.id) && u.team === team && u.hp > 0);
    if (!units.length) return { ok: false, reason: '先框选己方部队' };
    const lengths = [0];
    for (let i = 1; i < line.length; i++) lengths.push(lengths.at(-1) + distance(line[i], line[i - 1]));
    const total = lengths.at(-1);
    if (total < 1) return { ok: false, reason: '战线太短，请拖出一段线' };
    const first = line[0], last = line.at(-1), tangent = { x: last.x - first.x, z: last.z - first.z };
    let nx = tangent.z, nz = -tangent.x, normalLength = Math.max(.01, Math.hypot(nx, nz));
    nx /= normalLength; nz /= normalLength; if (nx * (team === 'ally' ? 1 : -1) < 0) { nx = -nx; nz = -nz; }
    const slots = Math.min(units.length, Math.max(2, Math.floor(total / 1.25) + 1));
    const anchors = units.map((unit, i) => {
      const fraction = slots === 1 ? .5 : (i % slots) / (slots - 1), along = total * fraction;
      let segment = 1; while (segment < lengths.length - 1 && lengths[segment] < along) segment++;
      const ratio = (along - lengths[segment - 1]) / Math.max(.001, lengths[segment] - lengths[segment - 1]);
      const rank = Math.floor(i / slots);
      const point = { x: line[segment - 1].x + (line[segment].x - line[segment - 1].x) * ratio - nx * rank * 1.25, z: line[segment - 1].z + (line[segment].z - line[segment - 1].z) * ratio - nz * rank * 1.25 };
      return nearestWalkable(point);
    });
    if (anchors.some(p => !p || this.phase === 'preparation' && !inDeployment(p.x, p.z, .35, team))) return { ok: false, reason: '准备阶段的战线必须位于准备区内' };
    if (this.phase === 'preparation' && anchors.some(p => this.units.some(u => u.team === team && !set.has(u.id) && distance(p, u) < .86))) return { ok: false, reason: '战线与已有部队重叠' };
    const plan = { id: this.nextPlanId++, team, line: line.map(p => ({ x: p.x, z: p.z })), unitIds: units.map(u => u.id), anchors, target: null, executing: false };
    plan.center = { x: anchors.reduce((s, p) => s + p.x, 0) / anchors.length, z: anchors.reduce((s, p) => s + p.z, 0) / anchors.length };
    this.plans.push(plan);
    units.forEach((unit, i) => {
      unit.order = { kind: 'frontline', planId: plan.id, x: anchors[i].x, z: anchors[i].z }; unit.path = []; unit.targetId = null;
      if (this.phase === 'preparation') { unit.x = anchors[i].x; unit.z = anchors[i].z; unit.yaw = Math.atan2(nx, nz); }
    });
    this.plans = this.plans.filter(p => p.unitIds.some(id => this.getUnit(id)?.order.planId === p.id));
    this.visionDirty = true;
    return { ok: true, planId: plan.id };
  }

  setOffensiveTarget(planId, point, team = 'ally') {
    const plan = this.plans.find(p => p.id === planId && p.team === team);
    if (!plan || !inMap(point.x, point.z)) return false;
    plan.target = { x: point.x, z: point.z };
    if (plan.executing) this.executePlans([plan.id], team);
    return true;
  }

  executePlans(planIds = null, team = 'ally') {
    if (this.phase !== 'battle') return false;
    let count = 0;
    for (const plan of this.plans) {
      if (plan.team !== team || !plan.target || planIds && !planIds.includes(plan.id)) continue;
      const dx = plan.target.x - plan.center.x, dz = plan.target.z - plan.center.z;
      for (let i = 0; i < plan.unitIds.length; i++) {
        const unit = this.getUnit(plan.unitIds[i]);
        if (!unit || unit.hp <= 0 || unit.order.planId !== plan.id) continue;
        const target = nearestWalkable({ x: Math.max(MAP.minX + 1.2, Math.min(MAP.maxX - 1.2, plan.anchors[i].x + dx)), z: Math.max(MAP.minZ + 1.2, Math.min(MAP.maxZ - 1.2, plan.anchors[i].z + dz)) });
        unit.order = { kind: 'advance', planId: plan.id, x: target.x, z: target.z }; unit.path = []; unit.nextPath = 0; count++;
      }
      plan.executing = true;
    }
    return count > 0;
  }

  pausePlans(team = 'ally') {
    for (const plan of this.plans) if (plan.team === team) plan.executing = false;
    for (const unit of this.units) if (unit.team === team && unit.order.kind === 'advance') { unit.order = { kind: 'frontline', planId: unit.order.planId, x: unit.x, z: unit.z }; unit.path = []; }
  }

  nearestEnemy(unit, inRange = false) {
    let best = null, score = Infinity;
    for (const other of this.units) {
      if (other.team === unit.team || other.hp <= 0 || !this.isVisible(other, unit.team)) continue;
      if (inRange && distance(unit, other) > attackRange(unit, other)) continue;
      const d = (unit.x - other.x) ** 2 + (unit.z - other.z) ** 2;
      if (d < score) { best = other; score = d; }
    }
    return best;
  }

  commandAi() {
    if (!this.aiEnabled || this.time < this.nextAiCommand) return;
    this.nextAiCommand = this.time + .8;
    for (const unit of this.units) {
      if (unit.team !== 'enemy' || unit.hp <= 0) continue;
      if (unit.mode !== 'auto') this.setMode([unit.id], 'auto', 'enemy');
      const target = this.nearestEnemy(unit);
      if (target) {
        if (unit.order.kind !== 'attack' || unit.order.targetId !== target.id) this.issueAttack([unit.id], target.id, 'enemy');
        continue;
      }
      // The commander scouts map objectives without using hidden player positions.
      const lane = [-24, 0, 24][unit.id % 3], offset = (Math.floor(unit.id / 3) % 5 - 2) * 1.25;
      const route = [{x:16,z:lane},{x:-8,z:lane},{x:-28,z:lane},{x:-48,z:lane},{x:-55,z:30},{x:-32,z:-30},{x:-55,z:-30},{x:-32,z:30}];
      unit.scoutIndex ??= 0;
      let point = nearestWalkable({x:route[unit.scoutIndex].x+offset,z:route[unit.scoutIndex].z});
      if (distance(unit,point)<1.4) {
        unit.scoutIndex = (unit.scoutIndex + 1) % route.length;
        point = nearestWalkable({x:route[unit.scoutIndex].x+offset,z:route[unit.scoutIndex].z});
      }
      if (unit.order.kind === 'advance' && distance(unit.order,point)<.1) continue;
      unit.order = {kind:'advance',x:point.x,z:point.z}; unit.path=[]; unit.nextPath=0; unit.targetId=null;
    }
  }

  walk(unit, goal, dt) {
    if (unit.speed <= 0) return;
    if (this.time >= unit.nextPath && (!unit.path.length || !unit.pathTarget || distance(unit.pathTarget, goal) > 1.4)) {
      unit.path = findPath(unit, goal); unit.pathTarget = { x: goal.x, z: goal.z }; unit.nextPath = this.time + .7;
    }
    while (unit.path.length && (distance(unit, unit.path[0]) < .04 || distance(unit, unit.path[0]) < .3 && unit.path[1] && canTraverse(unit, unit.path[1]))) unit.path.shift();
    const waypoint = unit.path[0];
    if (!waypoint) return;
    const d = distance(unit, waypoint); if (d < .001) return;
    const slow = unit.slowUntil > this.time ? .62 : 1;
    const uphill = Math.max(0, heightAt(waypoint.x, waypoint.z) - heightAt(unit.x, unit.z));
    const step = Math.min(d, unit.speed * terrainAt(unit.x, unit.z).speed * slow / (1 + uphill * .4) * dt);
    const nearby = this.units.filter(other => other.id !== unit.id && other.hp > 0 && distance(unit, other) < 2.1);
    const direction = Math.atan2(waypoint.z - unit.z, waypoint.x - unit.x);
    let best = null, bestScore = -Infinity;
    for (const turn of [0, .55, -.55, 1.05, -1.05, 1.55, -1.55]) {
      const angle = direction + turn, x = unit.x + Math.cos(angle) * step, z = unit.z + Math.sin(angle) * step;
      if (!canTraverse(unit, { x, z })) continue;
      let blocked = false, pressure = 0;
      for (const other of nearby) {
        const gap = Math.hypot(x - other.x, z - other.z), oldGap = distance(unit, other), min = unit.radius + other.radius + .04;
        if (gap < min && gap < oldGap - .001) { blocked = true; break; }
        if (gap < min + .55) pressure += Math.max(0, oldGap - gap) / Math.max(.08, gap - min + .1) * 2.2;
      }
      if (blocked) continue;
      const score = d - Math.hypot(waypoint.x - x, waypoint.z - z) - pressure - Math.abs(turn) * .003;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
      if (!nearby.length) break;
    }
    if (best) { unit.yaw = Math.atan2(best.x - unit.x, best.z - unit.z); unit.x = best.x; unit.z = best.z; }
    if (this.time - unit.progressAt > 1.2) {
      if (Math.hypot(unit.x - unit.progressX, unit.z - unit.progressZ) < .3) {
        unit.path = []; unit.nextPath = this.time + .1;
        // Step sideways before retrying when stationary troops occupy the route.
        for (const side of [1, -1]) {
          const detour = { x: unit.x + Math.cos(direction + side * Math.PI / 2) * 1.35, z: unit.z + Math.sin(direction + side * Math.PI / 2) * 1.35 };
          if (canTraverse(unit, detour) && !nearby.some(other => distance(detour, other) < unit.radius + other.radius + .12)) { unit.path = [detour]; break; }
        }
      }
      unit.progressAt = this.time; unit.progressX = unit.x; unit.progressZ = unit.z;
    }
  }

  hit(attacker, target, multiplier = 1) {
    if (!target || target.hp <= 0) return;
    let amount = damageFor(attacker, target) * multiplier;
    if (amount <= 0) return;
    const shieldDamage = Math.min(target.shield, amount); target.shield -= shieldDamage; amount -= shieldDamage;
    const healthDamage = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount); target.lastDamage = this.time;
    const length = Math.max(.01, distance(attacker, target));
    target.hitX = (target.x - attacker.x) / length; target.hitZ = (target.z - attacker.z) / length;
    this.events.push({ kind: 'hit', x: target.x, z: target.z, team: attacker.team, targetTeam: target.team, unitId: target.id, amount: healthDamage, shieldDamage, time: this.time });
    if (target.hp <= 0) {
      target.diedAt = this.time; this.kills[attacker.team]++; this.visionDirty = true;
      this.events.push({ kind: 'death', x: target.x, z: target.z, team: target.team, unitId: target.id, time: this.time });
    }
  }

  attack(unit, target) {
    unit.lastAttack = this.time; unit.yaw = Math.atan2(target.x - unit.x, target.z - unit.z);
    unit.nextAttack = this.time + unit.cooldown / (unit.buffUntil > this.time ? 1.22 : 1);
    if (unit.kind === 'kun') {
      this.projectiles.push({ id: `${unit.id}:${this.time}`, attackerId: unit.id, targetId: target.id, team: unit.team, fromX: unit.x, fromZ: unit.z, x: target.x, z: target.z, time: 0, duration: .32 + distance(unit, target) / 19 });
      this.events.push({ kind: 'throw', x: unit.x, z: unit.z, team: unit.team, time: this.time });
    } else if (unit.kind === 'jiahao') {
      const dx = target.x - unit.x, dz = target.z - unit.z, length = Math.max(.001, Math.hypot(dx, dz));
      for (const other of this.units) {
        if (other.team === unit.team || other.hp <= 0) continue;
        const px = other.x - unit.x, pz = other.z - unit.z, along = (px * dx + pz * dz) / length, across = Math.abs(px * dz - pz * dx) / length;
        if (along >= 0 && along < unit.range + .4 && across < .8) { this.hit(unit, other, other.id === target.id ? 1 : .65); other.stunnedUntil = this.time + .16; }
      }
      this.events.push({ kind: 'wave', x: unit.x, z: unit.z, tx: target.x, tz: target.z, time: this.time, team: unit.team });
    } else if (unit.kind === 'nailong') {
      for (const other of this.units) if (other.team !== unit.team && other.hp > 0 && distance(other, target) < 2.45) {
        this.hit(unit, other, other.id === target.id ? 1 : .75); other.stunnedUntil = this.time + .45;
      }
      this.events.push({ kind: 'stomp', x: target.x, z: target.z, radius: 2.45, time: this.time, team: unit.team });
    } else {
      this.hit(unit, target);
      if (unit.kind === 'mao') {
        target.slowUntil = this.time + 1.4;
        this.events.push({ kind: 'hiss', x: target.x, z: target.z, time: this.time, team: unit.team });
      }
    }
  }

  support(unit) {
    if (unit.kind !== 'naiwa' || this.time < unit.nextSupport) return;
    unit.nextSupport = this.time + 3.8;
    let count = 0;
    for (const other of this.units) if (other.team === unit.team && other.hp > 0 && distance(unit, other) < 5.2) {
      other.hp = Math.min(other.maxHp, other.hp + 16); other.buffUntil = this.time + 3.4; count++;
    }
    if (count > 1) this.events.push({ kind: 'inspire', x: unit.x, z: unit.z, radius: 5.2, time: this.time, team: unit.team });
  }

  separate(dt) {
    const living = this.units.filter(u => u.hp > 0);
    for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
      const a = living[i], b = living[j], dx = a.x - b.x, dz = a.z - b.z, squared = dx * dx + dz * dz, min = a.radius + b.radius;
      if (squared >= min * min) continue;
      const d = Math.max(.01, Math.sqrt(squared)), push = Math.min(.12, (min - d) * .4) * Math.min(1, dt * 30);
      const nx = squared < .0001 ? (a.id % 2 ? 1 : -1) : dx / d, nz = squared < .0001 ? 0 : dz / d;
      for (const [unit, sign] of [[a, 1], [b, -1]]) {
        const x = unit.x + nx * push * sign, z = unit.z + nz * push * sign;
        if (canTraverse(unit, { x, z })) { unit.x = x; unit.z = z; }
      }
    }
  }

  step(dt) {
    if (this.phase !== 'battle' || this.paused) return;
    dt = Math.max(0, Math.min(.1, dt)); this.time += dt;
    if (this.visionDirty || this.time >= this.nextVision) this.refreshVisibility();
    this.commandAi();
    for (const unit of this.units) {
      if (unit.hp <= 0) continue;
      this.support(unit);
      if (unit.maxShield && this.time - unit.lastDamage > 4) unit.shield = Math.min(unit.maxShield, unit.shield + dt * 9);
      if (unit.stunnedUntil > this.time) continue;
      if (unit.order.kind === 'move') {
        if (distance(unit, unit.order) < .55) { unit.order = { kind: 'idle' }; unit.path = []; }
        else { this.walk(unit, unit.order, dt); continue; }
      }
      if (unit.order.kind === 'frontline' || unit.order.kind === 'advance') {
        const target = this.nearestEnemy(unit, unit.mode === 'hold'), aggro = target ? Math.max(3.4, attackRange(unit, target) + 1.1) : 0;
        const engage = target && distance(unit, target) <= aggro && (unit.order.kind === 'advance' || distance(target, unit.order) <= aggro + 1.2);
        if (engage) {
          unit.targetId = target.id;
          if (distance(unit, target) > attackRange(unit, target) && unit.mode === 'auto') this.walk(unit, target, dt);
          else { unit.path = []; if (this.time >= unit.nextAttack) this.attack(unit, target); }
        } else {
          unit.targetId = null;
          if (distance(unit, unit.order) > .55) this.walk(unit, unit.order, dt);
          else if (unit.order.kind === 'advance') { unit.order = { ...unit.order, kind: 'frontline' }; unit.path = []; }
        }
        continue;
      }
      let target = unit.order.kind === 'attack' ? this.getUnit(unit.order.targetId) : null;
      if (target && (target.hp <= 0 || !this.isVisible(target, unit.team))) { target = null; unit.order = { kind: 'idle' }; unit.path = []; }
      if (target) { unit.order.lastX = target.x; unit.order.lastZ = target.z; }
      if (!target) target = this.nearestEnemy(unit, unit.mode === 'hold');
      unit.targetId = target?.id ?? null;
      if (!target) { unit.path = []; continue; }
      if (distance(unit, target) > attackRange(unit, target)) { if (unit.mode === 'auto') this.walk(unit, target, dt); else unit.path = []; }
      else { unit.path = []; if (this.time >= unit.nextAttack) this.attack(unit, target); }
    }
    const pending = [];
    for (const projectile of this.projectiles) {
      projectile.time += dt;
      const target = this.getUnit(projectile.targetId);
      if (target && target.hp > 0 && this.isVisible(target, projectile.team)) { projectile.x = target.x; projectile.z = target.z; }
      if (projectile.time < projectile.duration) { pending.push(projectile); continue; }
      const attacker = this.getUnit(projectile.attackerId);
      if (attacker && target?.hp > 0 && distance(target, projectile) < 1.3) {
        this.hit(attacker, target);
        for (const other of this.units) if (other.id !== target.id && other.team !== attacker.team && other.hp > 0 && distance(other, target) < 1.3) this.hit(attacker, other, .45);
      }
      this.events.push({ kind: 'impact', x: projectile.x, z: projectile.z, time: this.time, team: projectile.team });
    }
    this.projectiles = pending; this.separate(dt);
    for (const plan of this.plans) if (plan.executing && !this.units.some(u => u.hp > 0 && u.order.planId === plan.id && u.order.kind === 'advance')) plan.executing = false;
    const allies = this.units.some(u => u.team === 'ally' && u.hp > 0), enemies = this.units.some(u => u.team === 'enemy' && u.hp > 0);
    if (!allies || !enemies) { this.winner = allies ? 'ally' : enemies ? 'enemy' : null; this.phase = allies ? 'victory' : 'defeat'; this.paused = false; }
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
  }

  drainEvents() { const result = this.events; this.events = []; return result; }
  snapshot() {
    return { phase: this.phase, paused: this.paused, time: this.time, budget: this.budget, allies: this.units.filter(u => u.team === 'ally' && u.hp > 0).length, enemies: this.units.filter(u => u.team === 'enemy' && u.hp > 0).length, visibleEnemies: this.units.filter(u => u.team === 'enemy' && u.hp > 0 && this.isVisible(u)).length, projectiles: this.projectiles.length, kills: { ...this.kills } };
  }
}
