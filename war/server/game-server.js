import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { BattleRoom } from './room.js';
import { PROTOCOL_VERSION } from '../src/game/protocol.js';

const root = new URL('../', import.meta.url);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function connectionIp(req, trustProxy = false) {
  const remote = req.socket.remoteAddress, forwarded = req.headers['x-real-ip'];
  if (trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) && typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  return remote;
}

export function createGameServer({ reconnectMs = 30000, maxRooms = 64, trustProxy = false } = {}) {
  const rooms = new Map(), clients = new Set(); let closing = false;
  const server = createServer(async (req, res) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' };
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400, headers).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers).end(); return; }
    if (pathname === '/health') { res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', version: PROTOCOL_VERSION })); return; }
    if (!['/', '/index.html'].includes(pathname)) { res.writeHead(404, headers).end('Not found'); return; }
    try { const body = await readFile(new URL('index.html', root)); res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }).end(req.method === 'HEAD' ? undefined : body); }
    catch { res.writeHead(503, headers).end('Run npm run build first'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let valid = false;
    try { valid = new URL(req.url, 'http://localhost').pathname === '/battle' && new URL(req.headers.origin).host === req.headers.host; } catch {}
    const ip = connectionIp(req, trustProxy);
    if (!valid || clients.size >= 128 || [...clients].filter(c => c.ip === ip).length >= 16) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    const client = { ws, ip: connectionIp(req, trustProxy), room: null, seat: null, tokens: 40, refreshedAt: Date.now(), alive: true };
    clients.add(client);
    const send = message => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
      ws.send(JSON.stringify(message));
    };
    const handshake = setTimeout(() => { if (!client.seat) ws.close(1008, 'Handshake required'); }, 10000); handshake.unref();
    ws.on('pong', () => { client.alive = true; });
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(handshake); clients.delete(client); client.room?.disconnect(client.seat); });
    ws.on('message', (data, binary) => {
      const now = Date.now(); client.tokens = Math.min(40, client.tokens + (now - client.refreshedAt) / 1000 * 20); client.refreshedAt = now;
      if (client.tokens < 1 || binary) { ws.close(1008, 'Invalid message rate or format'); return; } client.tokens--;
      let message;
      try { message = JSON.parse(data.toString()); } catch { send({ type: 'error', reason: '消息格式错误' }); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { send({ type: 'error', reason: '消息格式错误' }); return; }
      if (!client.seat) {
        if (message.version !== PROTOCOL_VERSION) { send({ type: 'error', reason: '游戏版本不一致，请刷新页面' }); return; }
        try {
          let room, seat;
          if (message.type === 'create') {
            if (rooms.size >= maxRooms) throw new Error('房间已满，请稍后重试');
            let code;
            do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
            room = new BattleRoom(code, { reconnectMs }); rooms.set(code, room); seat = room.join(send);
          } else if (['join', 'resume'].includes(message.type) && typeof message.code === 'string' && /^[A-Z2-9]{6}$/.test(message.code)) {
            room = rooms.get(message.code); if (!room) throw new Error('房间不存在或已结束');
            if (message.type === 'resume') {
              if (typeof message.token !== 'string' || !/^[a-f0-9]{48}$/.test(message.token)) throw new Error('无法恢复席位');
              seat = room.resume(message.token, send);
            } else seat = room.join(send);
          } else throw new Error('请输入有效房间码');
          client.room = room; client.seat = seat; clearTimeout(handshake);
          send({ type: 'welcome', code: room.code, token: seat.token, side: seat.team === 'ally' ? 'west' : 'east', lastSeq: seat.lastSeq, version: PROTOCOL_VERSION });
          room.broadcast();
        } catch (error) { send({ type: 'error', reason: error.message }); }
        return;
      }
      if (message.type !== 'command') { send({ type: 'error', reason: '无效指令' }); return; }
      const ack = client.room.command(client.seat, message); send(ack);
      // All snapshots are broadcast on the fixed 10 Hz cadence, independent of command spam.
    });
  });
  let last = performance.now(), accumulator = 0, frame = 0;
  const timer = setInterval(() => {
    if (closing) return;
    const now = performance.now(); accumulator = Math.min(.2, accumulator + (now - last) / 1000); last = now;
    while (accumulator >= 1 / 30) {
      for (const room of rooms.values()) room.step();
      accumulator -= 1 / 30;
      if (++frame % 3 === 0) for (const room of rooms.values()) room.broadcast();
    }
    for (const [code, room] of rooms) {
      const age = Date.now() - (room.finishedAt ?? room.lastActivity);
      if (room.finishedAt !== null && age > 120000 || room.sim.phase === 'preparation' && age > 15 * 60000) {
        for (const c of clients) if (c.room === room) c.ws.close(1000, 'Room expired');
        rooms.delete(code);
      }
    }
  }, 1000 / 30); timer.unref();
  const heartbeat = setInterval(() => {
    for (const c of clients) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); }
  }, 10000); heartbeat.unref();
  return {
    server, rooms,
    async close() { closing = true; clearInterval(timer); clearInterval(heartbeat); for (const c of clients) c.ws.terminate(); await new Promise(resolve => wss.close(resolve)); if (server.listening) await new Promise(resolve => server.close(resolve)); }
  };
}
