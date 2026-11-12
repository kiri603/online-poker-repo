import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer, connectionIp } from '../server/game-server.js';
import { PROTOCOL_VERSION } from '../src/game/protocol.js';
import { NetworkBattle, battleSocketUrl } from '../src/game/network-client.js';

async function launch(t, options) {
  const game = createGameServer(options);
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  t.after(() => game.close());
  const port = game.server.address().port;
  return { game, origin: `http://127.0.0.1:${port}`, url: `ws://127.0.0.1:${port}/battle` };
}

async function player(server, handshake) {
  const ws = new WebSocket(server.url, { origin: server.origin });
  const messages = [], waiters = new Set(); let seq = 0;
  ws.on('message', raw => {
    const message = JSON.parse(raw.toString()); messages.push(message);
    for (const waiter of [...waiters]) if (waiter.predicate(message)) waiter.resolve(message);
  });
  ws.on('error', () => {});
  const wait = predicate => {
    const found = messages.find(predicate); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(waiter); reject(new Error('WebSocket message timed out')); }, 4000);
      const waiter = { predicate, resolve: value => { clearTimeout(timer); waiters.delete(waiter); resolve(value); } };
      waiters.add(waiter);
    });
  };
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ ...handshake, version: PROTOCOL_VERSION }));
  const welcome = await wait(m => m.type === 'welcome'); seq = welcome.lastSeq;
  await wait(m => m.type === 'snapshot');
  return { ws, messages, wait, welcome,
    async command(action, payload = {}) {
      const number = ++seq; ws.send(JSON.stringify({ type: 'command', seq: number, action, payload }));
      const ack = await wait(m => m.type === 'ack' && m.seq === number);
      if (ack.ok) await wait(m => m.type === 'snapshot' && m.lastSeq >= number);
      return ack;
    },
    async disconnect() { const closed = new Promise(resolve => ws.once('close', resolve)); ws.terminate(); await closed; }
  };
}

test('真实双端同步部署、模式、伤害与全歼结果，隐藏部署不下发', async t => {
  const server = await launch(t);
  const a = await player(server, { type: 'create' });
  const b = await player(server, { type: 'join', code: a.welcome.code });
  assert.equal(a.welcome.side, 'west'); assert.equal(b.welcome.side, 'east');
  const first = await a.command('deploy', { kind: 'kun', center: { x: -30, z: 0 }, count: 1, formation: 'grid', angle: 0 });
  const second = await b.command('deploy', { kind: 'mao', center: { x: 30, z: 0 }, count: 1, formation: 'grid', angle: 0 });
  assert.ok(first.ok && second.ok);
  assert.ok(a.messages.filter(m => m.type === 'snapshot').every(m => m.units.every(u => u.team === 'ally')));
  assert.ok((await a.command('mode', { ids: first.ids, mode: 'auto' })).ok);
  assert.ok(!(await b.command('mode', { ids: first.ids, mode: 'auto' })).ok);
  assert.ok((await a.command('ready', { value: true })).ok);
  assert.ok(!(await a.command('undo')).ok);
  assert.ok((await b.command('ready', { value: true })).ok);
  const room = server.game.rooms.get(a.welcome.code);
  // Place both armies in a visible firing lane to verify authoritative combat without a long march.
  const archer = room.sim.getUnit(first.ids[0]), target = room.sim.getUnit(second.ids[0]);
  archer.x = -25; archer.z = 0; target.x = -19; target.z = 0;
  target.hp = 50; target.attack = 0; room.sim.refreshVisibility();
  const damaged = await a.wait(m => m.type === 'snapshot' && m.units.some(u => u.id === target.id && u.hp > 0 && u.hp < 50));
  const sameTick = await b.wait(m => m.type === 'snapshot' && m.tick === damaged.tick);
  assert.equal(sameTick.units.find(u => u.id === target.id).hp, damaged.units.find(u => u.id === target.id).hp);
  assert.equal(sameTick.units.find(u => u.id === archer.id).hp, damaged.units.find(u => u.id === archer.id).hp);
  const victory = await a.wait(m => m.type === 'snapshot' && m.phase === 'victory');
  const defeat = await b.wait(m => m.type === 'snapshot' && m.phase === 'defeat');
  assert.equal(victory.tick, defeat.tick); assert.equal(victory.kills.ally, 1);
  assert.ok(victory.events.every(e => Number.isInteger(e.id)));
});

test('真实连接可恢复原席位和指令序号，超时掉线双方结算相反', async t => {
  const server = await launch(t, { reconnectMs: 500 });
  const a = await player(server, { type: 'create' });
  const b = await player(server, { type: 'join', code: a.welcome.code });
  assert.ok((await a.command('quickDeploy')).ok);
  await a.disconnect();
  await b.wait(m => m.type === 'snapshot' && m.opponentPresent && !m.opponentConnected);
  const resumed = await player(server, { type: 'resume', code: a.welcome.code, token: a.welcome.token });
  assert.equal(resumed.welcome.side, 'west'); assert.equal(resumed.welcome.lastSeq, 1);
  assert.ok((await resumed.command('mode', { ids: [1], mode: 'auto' })).ok);
  assert.equal(server.game.rooms.get(a.welcome.code).sim.getUnit(1).mode, 'auto');
  await resumed.disconnect();
  await b.wait(m => m.type === 'snapshot' && m.phase === 'victory');
  assert.equal(server.game.rooms.get(a.welcome.code).snapshot(server.game.rooms.get(a.welcome.code).seats[0]).phase, 'defeat');
});

test('拒绝跨站连接、畸形指令和访问服务端源码，之后仍可正常建房', async t => {
  const server = await launch(t);
  const rejected = new WebSocket(server.url, { origin: 'https://untrusted.example' });
  const status = await new Promise(resolve => {
    rejected.once('unexpected-response', (_, response) => { response.resume(); rejected.terminate(); resolve(response.statusCode); });
    rejected.on('error', () => {});
  });
  assert.equal(status, 403);
  assert.equal((await fetch(`${server.origin}/server/room.js`)).status, 404);
  const a = await player(server, { type: 'create' });
  a.ws.send('{');
  await a.wait(m => m.type === 'error' && m.reason === '消息格式错误');
  assert.ok(!(await a.command('deploy', { kind: '__proto__' })).ok);
  assert.ok((await a.command('deploy', { kind: 'mao', center: {x:-30,z:0}, count:1, formation:'grid', angle:0, ids:'unexpected' })).ok);
  assert.ok((await a.command('ready', {value:false, ids:{some:'unexpected'}})).ok);
  assert.ok((await a.command('quickDeploy')).ok);
});

test('游戏网络客户端等待权威快照、短线重连并可取消尚未完成的连接', async t => {
  const server = await launch(t);
  const previousSocket = globalThis.WebSocket, previousLocation = globalThis.location;
  globalThis.location = { protocol: 'http:', host: new URL(server.origin).host, href: `${server.origin}/` };
  globalThis.WebSocket = class extends WebSocket { constructor(url) { super(url, { origin: server.origin }); } };
  t.after(() => { globalThis.WebSocket = previousSocket; globalThis.location = previousLocation; });
  const statuses = [], a = new NetworkBattle(status => statuses.push(status)), b = new NetworkBattle();
  t.after(() => { a.close(); b.close(); });
  await a.connect('create'); await b.connect('join', a.code);
  assert.ok((await a.quickDeploy()).ok); assert.equal(a.units.length, 25); assert.equal(b.units.length, 0);
  const ids = a.units.map(u => u.id);
  assert.ok((await a.setMode(ids, 'auto')).ok); assert.ok(a.units.every(u => u.mode === 'auto'));
  const socket = a.socket, sequence = a.lastSeq;
  socket.terminate();
  const deadline = Date.now() + 4000;
  while (!(a.connected && a.socket !== socket && statuses.includes('reconnecting'))) {
    assert.ok(Date.now() < deadline, '客户端未在期限内恢复连接');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(a.lastSeq, sequence); assert.equal(a.units.length, 25);
  assert.ok((await a.setMode(ids, 'hold')).ok); assert.ok(a.units.every(u => u.mode === 'hold'));
  const cancelled = new NetworkBattle(), connecting = cancelled.connect('create');
  cancelled.close(); await assert.rejects(connecting, /取消|连接/);
});

test('联机地址随部署目录解析，HTTPS 子目录使用同目录 WSS 且不携带页面参数', () => {
  assert.equal(battleSocketUrl('http://127.0.0.1:5189/'), 'ws://127.0.0.1:5189/battle');
  assert.equal(battleSocketUrl('https://sanguoddz.xyz/war/'), 'wss://sanguoddz.xyz/war/battle');
  assert.equal(battleSocketUrl('https://sanguoddz.xyz/war/index.html?qa=1#view'), 'wss://sanguoddz.xyz/war/battle');
});

test('只在显式信任本机代理时使用有效真实 IP，其他来源不能伪造连接限额身份', () => {
  const request = (remoteAddress, address) => ({socket:{remoteAddress},headers:{'x-real-ip':address}});
  assert.equal(connectionIp(request('127.0.0.1','203.0.113.5')), '127.0.0.1');
  assert.equal(connectionIp(request('127.0.0.1','203.0.113.5'), true), '203.0.113.5');
  assert.equal(connectionIp(request('::1','2001:db8::1'), true), '2001:db8::1');
  assert.equal(connectionIp(request('198.51.100.1','203.0.113.5'), true), '198.51.100.1');
  assert.equal(connectionIp(request('127.0.0.1','203.0.113.5, 203.0.113.6'), true), '127.0.0.1');
});
