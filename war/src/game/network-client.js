import { BattleSimulation } from './simulation.js';
import { UNIT_TYPES } from './units.js';
import { MAP } from './terrain.js';
import { PROTOCOL_VERSION, VISION_WIDTH, VISION_HEIGHT } from './protocol.js';

export function battleSocketUrl(pageUrl) {
  const url = new URL('./battle', pageUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

export class NetworkBattle extends BattleSimulation {
  constructor(onStatus = () => {}) {
    super({ enemyRoster: false });
    this.network = true; this.onStatus = onStatus; this.connected = false; this.ready = false; this.opponentPresent = false;
    this.visionMask = new Uint8Array(VISION_WIDTH * VISION_HEIGHT); this.latestTime = 0;
    this.pending = new Map(); this.interpolation = new Map(); this.seq = 0; this.lastSeq = 0;
    this.closed = false; this.received = false; this.reconnecting = false; this.reason = ''; this.generation = 0;
  }

  connect(type, code = '') {
    if (!['http:', 'https:'].includes(location.protocol)) return Promise.reject(new Error('联机需要通过本地服务器打开页面，请使用 npm run dev'));
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(battleSocketUrl(location.href));
      this.socket = socket; const generation = ++this.generation; let welcomed = false, settled = false;
      const fail = reason => { if (!settled) { settled = true; reject(new Error(reason)); } };
      const timer = setTimeout(() => { fail('连接超时，请确认服务器正在运行'); socket.close(); }, 8000);
      socket.onopen = () => {
        if (this.closed || generation !== this.generation) { socket.close(); return; }
        socket.send(JSON.stringify({ type, code, token: type === 'resume' ? this.token : undefined, version: PROTOCOL_VERSION }));
      };
      socket.onmessage = event => {
        if (this.closed || generation !== this.generation) return;
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'welcome') {
          welcomed = true; this.code = message.code; this.token = message.token; this.side = message.side;
          this.deploymentTeam = this.side === 'east' ? 'enemy' : 'ally'; this.seq = Math.max(this.seq, message.lastSeq); this.lastSeq = message.lastSeq;
          this.connected = true; this.reconnecting = false; this.reconnectStarted = 0; this.interpolation.clear(); this.events = [];
          this.connectionMessage = ''; this.onStatus('connected');
        } else if (message.type === 'snapshot') {
          this.applySnapshot(message);
          if (welcomed) { clearTimeout(timer); settled = true; resolve(this); welcomed = false; }
        } else if (message.type === 'ack') {
          const pending = this.pending.get(message.seq);
          if (!pending) return;
          pending.ack = message;
          if (!message.ok || this.lastSeq >= message.seq) this.settle(message.seq);
        } else if (message.type === 'error') {
          const connecting = !settled; clearTimeout(timer); fail(message.reason);
          if (connecting || !this.connected) socket.close(); else this.onStatus(message.reason);
        }
      };
      socket.onerror = () => { clearTimeout(timer); fail('无法连接对战服务器，请使用支持 PVP 的服务地址'); };
      socket.onclose = () => {
        clearTimeout(timer); if (generation !== this.generation) return;
        this.connected = false;
        for (const [seq] of this.pending) this.settle(seq, '连接中断，请重连后确认部队状态');
        fail(this.closed ? '已取消连接' : '连接已关闭');
        if (this.closed || !this.code) return;
        this.retryConnection();
      };
    });
  }

  retryConnection() {
    if (this.closed || this.retryTimer) return;
    this.reconnectStarted ||= performance.now(); this.reconnecting = true; this.onStatus('reconnecting');
    if (performance.now() - this.reconnectStarted > 30000) { this.reconnecting = false; this.connectionMessage = '重连超时，请返回菜单重新建房'; this.onStatus(this.connectionMessage); return; }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect('resume', this.code).catch(() => this.retryConnection());
    }, 1000);
  }

  settle(seq, reason) {
    const pending = this.pending.get(seq); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(seq);
    pending.resolve(reason ? { ok: false, reason } : pending.ack);
  }

  command(action, payload = {}) {
    if (!this.connected) return Promise.resolve({ ok: false, reason: '正在重连，暂时无法下令' });
    const seq = ++this.seq;
    return new Promise(resolve => {
      const timer = setTimeout(() => this.settle(seq, '指令回执超时，请检查连接与部队状态'), 8000);
      this.pending.set(seq, { resolve, timer, ack: null });
      try { this.socket.send(JSON.stringify({ type: 'command', seq, action, payload })); }
      catch { this.settle(seq, '连接中断，请重连后确认部队状态'); }
    });
  }

  applySnapshot(s) {
    const old = new Map(this.units.map(u => [u.id, u]));
    this.interpolation.clear();
    this.units = s.units.map(data => {
      const stats = UNIT_TYPES[data.kind], previous = old.get(data.id);
      const unit = { ...stats, ...data, maxHp: stats.hp, maxShield: stats.shield, path: data.moving ? [{}] : [], hitX: 0, hitZ: 0 };
      if (previous && s.phase === 'battle' && this.phase === 'battle') {
        this.interpolation.set(unit.id, { fromX: previous.x, fromZ: previous.z, toX: data.x, toZ: data.z, fromYaw: previous.yaw, toYaw: data.yaw });
        unit.x = previous.x; unit.z = previous.z; unit.yaw = previous.yaw;
      }
      return unit;
    });
    this.receivedAt = performance.now(); this.latestTime = s.time; this.phase = s.phase; this.time = s.time;
    this.budgets.ally = s.budget; this.plans = s.plans; this.histories.ally = Array(s.historyLength).fill(null); this.kills = s.kills;
    this.ready = s.ready; this.opponentReady = s.opponentReady; this.opponentPresent = s.opponentPresent; this.opponentConnected = s.opponentConnected;
    this.reconnectSeconds = s.reconnectSeconds; this.reason = s.reason; this.tick = s.tick; this.lastSeq = s.lastSeq;
    this.visionMask.set(s.vision); this.projectiles = s.projectiles; this.events.push(...s.events); this.received = true;
    for (const [seq, pending] of this.pending) if (pending.ack && seq <= this.lastSeq) this.settle(seq);
  }

  updateNetwork() {
    const t = Math.min(1, (performance.now() - this.receivedAt) / 110);
    for (const unit of this.units) {
      const p = this.interpolation.get(unit.id); if (!p) continue;
      unit.x = p.fromX + (p.toX - p.fromX) * t; unit.z = p.fromZ + (p.toZ - p.fromZ) * t;
      const angle = Math.atan2(Math.sin(p.toYaw - p.fromYaw), Math.cos(p.toYaw - p.fromYaw)); unit.yaw = p.fromYaw + angle * t;
    }
  }
  isVisible(unit) { return !!unit && this.units.some(u => u.id === unit.id); }
  isPointVisible(p) {
    const x = Math.floor((p.x - MAP.minX) / (MAP.maxX - MAP.minX) * VISION_WIDTH), z = Math.floor((p.z - MAP.minZ) / (MAP.maxZ - MAP.minZ) * VISION_HEIGHT);
    return x >= 0 && x < VISION_WIDTH && z >= 0 && z < VISION_HEIGHT && this.visionMask[z * VISION_WIDTH + x] > 0;
  }
  deploy(kind, center, count, formation, angle) { return this.command('deploy', { kind, center, count, formation, angle }); }
  quickDeploy() { return this.command('quickDeploy'); }
  undo() { return this.command('undo'); }
  remove(ids) { return this.command('remove', { ids }); }
  issueMove(ids, center, formation) { return this.command('move', { ids, center, formation }); }
  issueAttack(ids, targetId) { return this.command('attack', { ids, targetId }); }
  setMode(ids, mode) { return this.command('mode', { ids, mode }); }
  assignFrontline(ids, line) { return this.command('frontline', { ids, line }); }
  setOffensiveTarget(planId, point) { return this.command('offensive', { planId, point }); }
  executePlans() { return this.command('execute'); }
  pausePlans() { return this.command('stopPlans'); }
  setPaused() {}
  step() {}
  start() { return this.command('ready', { value: !this.ready }); }
  close() {
    this.closed = true; clearTimeout(this.retryTimer);
    if (this.connected && ['preparation', 'battle'].includes(this.phase)) this.socket.send(JSON.stringify({ type: 'command', seq: ++this.seq, action: 'surrender', payload: {} }));
    this.socket?.close(); this.token = null;
    for (const [seq] of this.pending) this.settle(seq, '已离开房间');
  }
}
