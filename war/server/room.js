import { randomBytes } from 'node:crypto';
import { BattleSimulation } from '../src/game/simulation.js';
import { MAP } from '../src/game/terrain.js';
import { canObserve, sightRange } from '../src/game/visibility.js';
import { VISION_WIDTH, VISION_HEIGHT, validCommand } from '../src/game/protocol.js';

const opposite = team => team === 'ally' ? 'enemy' : 'ally';
const cellWidth = (MAP.maxX - MAP.minX) / VISION_WIDTH, cellHeight = (MAP.maxZ - MAP.minZ) / VISION_HEIGHT;
const visionPoints = Array.from({ length: VISION_WIDTH * VISION_HEIGHT }, (_, i) => ({ x: MAP.minX + (i % VISION_WIDTH + .5) * cellWidth, z: MAP.minZ + (Math.floor(i / VISION_WIDTH) + .5) * cellHeight }));

function visionMaskFor(sim, team) {
  const mask = Array(VISION_WIDTH * VISION_HEIGHT).fill(0);
  for (const unit of sim.units) {
    if (unit.team !== team || unit.hp <= 0) continue;
    const range = sightRange(unit);
    const left = Math.max(0, Math.ceil((unit.x - range - MAP.minX) / cellWidth - .5));
    const right = Math.min(VISION_WIDTH - 1, Math.floor((unit.x + range - MAP.minX) / cellWidth - .5));
    const top = Math.max(0, Math.ceil((unit.z - range - MAP.minZ) / cellHeight - .5));
    const bottom = Math.min(VISION_HEIGHT - 1, Math.floor((unit.z + range - MAP.minZ) / cellHeight - .5));
    for (let z = top; z <= bottom; z++) for (let x = left; x <= right; x++) {
      const index = z * VISION_WIDTH + x;
      if (!mask[index] && canObserve(unit, visionPoints[index])) mask[index] = 255;
    }
  }
  return mask;
}

export class BattleRoom {
  constructor(code, { now = () => Date.now(), reconnectMs = 30000 } = {}) {
    this.code = code; this.now = now; this.reconnectMs = reconnectMs;
    this.sim = new BattleSimulation({ enemyRoster: false }); this.seats = [];
    this.tick = 0; this.eventId = 0; this.reason = ''; this.createdAt = now(); this.finishedAt = null;
    this.pendingEvents = { ally: [], enemy: [] }; this.lastActivity = now();
  }

  join(send) {
    if (this.seats.length >= 2 || this.finishedAt !== null) throw new Error('房间已满或已结束');
    const seat = { team: this.seats.length ? 'enemy' : 'ally', token: randomBytes(24).toString('hex'), send, connected: true, ready: false, disconnectedAt: null, lastSeq: 0, lastAck: null, visibleIds: new Set() };
    this.seats.push(seat); this.lastActivity = this.now(); return seat;
  }

  resume(token, send) {
    const seat = this.seats.find(s => s.token === token);
    if (!seat || seat.connected || seat.disconnectedAt === null || this.now() - seat.disconnectedAt >= this.reconnectMs) throw new Error('席位无法恢复，请创建新房间');
    seat.send = send; seat.connected = true; seat.disconnectedAt = null;
    seat.visibleIds.clear(); this.pendingEvents[seat.team] = []; this.lastActivity = this.now(); return seat;
  }

  disconnect(seat) {
    if (!this.seats.includes(seat) || !seat.connected) return;
    seat.connected = false; seat.send = null; seat.disconnectedAt = this.now();
    if (this.sim.phase === 'preparation') seat.ready = false;
  }

  finish(winner, reason) {
    if (this.finishedAt !== null) return;
    this.sim.winner = winner; this.sim.phase = winner === 'ally' ? 'victory' : 'defeat';
    this.reason = reason; this.finishedAt = this.now();
  }

  command(seat, message) {
    if (!this.seats.includes(seat) || !seat.connected) return { type: 'ack', seq: 0, ok: false, reason: '连接已失效', tick: this.tick };
    if (!validCommand(message)) return { type: 'ack', seq: Number.isSafeInteger(message?.seq) ? message.seq : 0, ok: false, reason: '无效指令', tick: this.tick };
    if (message.seq === seat.lastSeq) return seat.lastAck;
    if (message.seq < seat.lastSeq) return { type: 'ack', seq: message.seq, ok: false, reason: '指令已过期', tick: this.tick };
    seat.lastSeq = message.seq;
    const ack = { type: 'ack', seq: message.seq, tick: this.tick, ok: false, reason: '' };
    seat.lastAck = ack; this.lastActivity = this.now();
    const { action, payload: p } = message, sim = this.sim, team = seat.team;
    if (!['preparation', 'battle'].includes(sim.phase)) { ack.reason = '本局已结束'; return ack; }
    if (action === 'surrender') { this.finish(opposite(team), '对方认输或离开房间'); ack.ok = true; return ack; }
    if (seat.ready && sim.phase === 'preparation' && action !== 'ready') { ack.reason = '先取消准备再调整军队'; return ack; }
    if (['move', 'attack', 'mode', 'frontline', 'remove'].includes(action) && p.ids.some(id => { const u = sim.getUnit(id); return !u || u.team !== team || u.hp <= 0; })) { ack.reason = '只能指挥己方存活部队'; return ack; }
    let result = false;
    switch (action) {
      case 'deploy': result = sim.deploy(p.kind, p.center, p.count, p.formation, p.angle, team); break;
      case 'quickDeploy': result = sim.quickDeploy(team); break;
      case 'undo': result = sim.undo(team); break;
      case 'remove': result = sim.remove(p.ids, team); break;
      case 'move': result = sim.issueMove(p.ids, p.center, p.formation, team); break;
      case 'attack': result = sim.issueAttack(p.ids, p.targetId, team); break;
      case 'mode': result = sim.setMode(p.ids, p.mode, team); break;
      case 'frontline': result = sim.assignFrontline(p.ids, p.line, team); break;
      case 'offensive': result = sim.setOffensiveTarget(p.planId, p.point, team); break;
      case 'execute': result = sim.executePlans(null, team); break;
      case 'stopPlans': sim.pausePlans(team); result = true; break;
      case 'ready':
        if (sim.phase !== 'preparation' || p.value && !sim.units.some(u => u.team === team && u.hp > 0)) { ack.reason = '先部署至少一名士兵'; return ack; }
        seat.ready = p.value; result = true;
        if (this.seats.length === 2 && this.seats.every(s => s.connected && s.ready)) sim.start();
        break;
    }
    ack.ok = !!(typeof result === 'object' ? result.ok : result);
    if (typeof result === 'object') { if (result.ids) ack.ids = result.ids; if (result.planId) ack.planId = result.planId; }
    if (!ack.ok) ack.reason = result?.reason || '当前无法执行该指令';
    return ack;
  }

  step() {
    for (const seat of this.seats) if (!seat.connected && this.now() - seat.disconnectedAt >= this.reconnectMs) this.finish(opposite(seat.team), '对方掉线超过 30 秒');
    if (this.sim.phase !== 'battle') return;
    this.sim.step(1 / 30); this.tick++;
    if (!['preparation', 'battle'].includes(this.sim.phase) && this.finishedAt === null) { this.reason = '敌军已被消灭'; this.finishedAt = this.now(); }
    for (const event of this.sim.drainEvents()) {
      const id = ++this.eventId;
      for (const seat of this.seats) {
        if (!seat.connected || !(this.sim.isPointVisible(event, seat.team) || event.targetTeam === seat.team || event.kind === 'death' && event.team === seat.team)) continue;
        const safe = { id, kind: event.kind, x: event.x, z: event.z, time: event.time, team: event.team === seat.team ? 'ally' : 'enemy' };
        if (event.targetTeam) safe.targetTeam = event.targetTeam === seat.team ? 'ally' : 'enemy';
        for (const field of ['amount', 'shieldDamage', 'radius']) if (Number.isFinite(event[field])) safe[field] = event[field];
        // A wave endpoint is disclosed only when that endpoint is itself visible.
        if (Number.isFinite(event.tx) && this.sim.isPointVisible({ x: event.tx, z: event.tz }, seat.team)) { safe.tx = event.tx; safe.tz = event.tz; }
        else if (safe.kind === 'wave') { safe.kind = 'impact'; }
        this.pendingEvents[seat.team].push(safe);
        if (this.pendingEvents[seat.team].length > 600) this.pendingEvents[seat.team].shift();
      }
    }
  }

  snapshot(seat) {
    const sim = this.sim, team = seat.team, other = this.seats.find(s => s !== seat);
    // Preparation never reveals the opponent's deployment or army size.
    const visible = sim.units.filter(u => u.team === team || sim.phase !== 'preparation' && sim.isVisible(u, team));
    const visibleIds = new Set(visible.map(u => u.id));
    const removed = [...seat.visibleIds].filter(id => !visibleIds.has(id)); seat.visibleIds = visibleIds;
    const units = visible.filter(u => u.hp > 0 || sim.time - u.diedAt < .8).map(u => {
      const own = u.team === team;
      const order = own ? { ...u.order } : { kind: 'idle' };
      if (order.kind === 'attack') { delete order.lastX; delete order.lastZ; if (!visibleIds.has(order.targetId)) { order.kind = 'idle'; delete order.targetId; } }
      return { id: u.id, kind: u.kind, team: own ? 'ally' : 'enemy', x: u.x, z: u.z, yaw: u.yaw, hp: u.hp, shield: u.shield,
        mode: own ? u.mode : undefined, order, moving: u.path.length > 0, lastAttack: u.lastAttack, lastDamage: u.lastDamage, diedAt: u.diedAt };
    });
    const vision = visionMaskFor(sim, team);
    const projectiles = sim.projectiles.filter(p => sim.isPointVisible({ x: p.fromX, z: p.fromZ }, team) && sim.isPointVisible(p, team)).map(p => ({ id: p.id, team: p.team === team ? 'ally' : 'enemy', fromX: p.fromX, fromZ: p.fromZ, x: p.x, z: p.z, time: p.time, duration: p.duration }));
    const phase = ['preparation', 'battle'].includes(sim.phase) ? sim.phase : sim.winner === team ? 'victory' : 'defeat';
    return { type: 'snapshot', tick: this.tick, time: sim.time, phase, budget: sim.budgets[team], lastSeq: seat.lastSeq,
      units, removed, vision, projectiles, plans: sim.plans.filter(p => p.team === team).map(p => ({ ...p, team: 'ally' })),
      historyLength: sim.histories[team].length, kills: { ally: sim.kills[team], enemy: sim.kills[opposite(team)] },
      ready: seat.ready, opponentReady: !!other?.ready, opponentConnected: !!other?.connected, opponentPresent: !!other,
      reconnectSeconds: other && !other.connected ? Math.max(0, Math.ceil((this.reconnectMs - (this.now() - other.disconnectedAt)) / 1000)) : null,
      reason: this.reason, events: this.pendingEvents[team].splice(0) };
  }

  broadcast() { for (const seat of this.seats) if (seat.connected) seat.send(this.snapshot(seat)); }
}
