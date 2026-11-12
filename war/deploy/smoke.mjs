import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION } from '../src/game/protocol.js';

const base = new URL(process.argv[2] || 'https://sanguoddz.xyz/war/');
const endpoint = new URL('./battle', base); endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const clients = [];
async function connect(type, code) {
  const ws = new WebSocket(endpoint, { origin: base.origin }); clients.push(ws);
  const messages = [], listeners = new Set(); let seq = 0;
  ws.on('error', () => {});
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); messages.push(m); for (const listener of [...listeners]) if (listener.match(m)) listener.resolve(m); });
  const wait = match => {
    const found = messages.find(match); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Smoke test timed out')); }, 10000);
      const listener = { match, resolve: m => { clearTimeout(timer); listeners.delete(listener); resolve(m); } }; listeners.add(listener);
    });
  };
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type, code, version: PROTOCOL_VERSION }));
  const welcome = await wait(m => m.type === 'welcome');
  return { welcome, wait, async command(action, payload = {}) {
    const number = ++seq; ws.send(JSON.stringify({ type: 'command', seq: number, action, payload }));
    const ack = await wait(m => m.type === 'ack' && m.seq === number); assert.ok(ack.ok, ack.reason);
    return wait(m => m.type === 'snapshot' && m.lastSeq >= number);
  } };
}
try {
  const health = await fetch(new URL('./health', base)); assert.equal(health.status, 200);
  assert.equal((await health.json()).version, PROTOCOL_VERSION);
  const a = await connect('create'), b = await connect('join', a.welcome.code);
  assert.notEqual(a.welcome.side, b.welcome.side);
  const army = await a.command('quickDeploy'); assert.equal(army.units.length, 25);
  const enemyArmy = await b.command('quickDeploy'); assert.ok(enemyArmy.units.every(u => u.team === 'ally'));
  const changed = await a.command('mode', { ids: army.units.map(u => u.id), mode: 'auto' }); assert.ok(changed.units.every(u => u.mode === 'auto'));
  await a.command('ready', { value: true }); await b.command('ready', { value: true });
  await a.wait(m => m.type === 'snapshot' && m.phase === 'battle');
  await b.command('surrender');
  await a.wait(m => m.type === 'snapshot' && m.phase === 'victory');
  console.log('HTTPS/WSS passed: create, join, deploy, mode, ready, battle and result.');
} finally { for (const ws of clients) ws.close(); }
