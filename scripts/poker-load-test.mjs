// Real HTTP/WebSocket clients. Node 22+, no extra dependencies.
// Guest runs omit registered-account polling; reports keep that distinction.
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";

const { values } = parseArgs({ options: {
  url: { type: "string" }, players: { type: "string", default: "4" },
  duration: { type: "string", default: "60" },
  "ramp-ms": { type: "string", default: "2000" },
  mode: { type: "string", default: "classic" },
  sessions: { type: "string" }, output: { type: "string" },
  "stop-file": { type: "string" }, help: { type: "boolean" },
} });
if (values.help || !values.url) {
  console.log("node scripts/poker-load-test.mjs --url <origin> --players 4|100|1000 --duration 60|600 --mode classic|mixed [--sessions <JSON file>] [--stop-file <path>] [--output <path>]");
  process.exit(values.help ? 0 : 1);
}
const origin = new URL(values.url).origin;
const players = Number(values.players), duration = Number(values.duration);
const rampMs = Number(values["ramp-ms"]);
if (!Number.isInteger(players) || players < 4 || players > 1000 || players % 4 ||
    !Number.isFinite(duration) || duration < 10 || duration > 1800 ||
    !Number.isFinite(rampMs) || rampMs < 0 || !["classic", "mixed"].includes(values.mode)) {
  throw new Error("Use 4–1000 players in groups of four, 10–1800 seconds, nonnegative ramp delay, and classic/mixed mode.");
}
const sessions = values.sessions ? JSON.parse(await readFile(values.sessions, "utf8")) : null;
if (sessions && (!Array.isArray(sessions) || sessions.length < players ||
    sessions.slice(0, players).some(s => !s.username || !s.tabToken || typeof s.guest !== "boolean") ||
    new Set(sessions.slice(0, players).map(s => s.username)).size !== players)) {
  throw new Error("Sessions must contain distinct { username, tabToken, guest } entries for every client.");
}
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const output = resolve(values.output || `temp-screenshots/load-test/${runId}.json`);
const rooms = [], clients = [];
const metrics = {
  runId, origin, requestedPlayers: players, mode: values.mode,
  authentication: sessions ? "provided-sessions" : "guest",
  registeredPolling: false, startedAt: new Date().toISOString(),
  peakConnected: 0, gamesCompleted: 0, plays: 0, passes: 0, aoeResponses: 0,
  wsSent: 0, wsReceived: 0, unexpectedDisconnects: 0, disconnections: [], gameErrors: [],
  authenticationEvents: [],
  stalledActions: [],
  actionLatencyMs: [], heartbeatLatencyMs: [], httpLatencyMs: [],
  httpRequests: 0, httpFailures: 0, progress: [],
};
let stopping = false, stopReason = null, steadyStarted = 0;
const started = Date.now();
const generatorCpuStarted = process.cpuUsage();
const generatorLoopDelay = monitorEventLoopDelay({ resolution: 20 });
generatorLoopDelay.enable();
let generatorPeakRssMiB = 0;
function stop(reason) { if (!stopReason) { stopReason = reason; console.log(JSON.stringify({ event: "STOP", reason })); } }
process.on("SIGINT", () => stop("User interrupt"));
process.on("SIGTERM", () => stop("Termination requested"));

async function checkStopFile() {
  if (!values["stop-file"] || stopping || stopReason) return;
  try { await readFile(values["stop-file"]); stop("Stop file detected"); }
  catch (error) { if (error.code !== "ENOENT") stop(`Stop file check failed: ${error.message}`); }
}
let stopFileBusy = false;
const stopFileWatcher = values["stop-file"] ? setInterval(() => {
  if (stopFileBusy) return;
  stopFileBusy = true;
  checkStopFile().finally(() => { stopFileBusy = false; });
}, 500) : null;

async function api(client, path, method = "GET") {
  const before = performance.now();
  metrics.httpRequests++;
  try {
    const response = await fetch(new URL(path, origin), {
      method, signal: AbortSignal.timeout(8000),
      headers: client?.tabToken ? { "X-Poker-Auth-Token": client.tabToken } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} on ${path.split("?")[0]}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    metrics.httpFailures++;
    if (!stopping) stop(error.message);
    throw error;
  } finally { metrics.httpLatencyMs.push(performance.now() - before); }
}

function send(client, type, data = null, action = false) {
  if (client.socket?.readyState !== WebSocket.OPEN || stopping) return false;
  const payload = { type, roomId: client.room.id, userId: client.username, data };
  const state = client.room.state;
  if (action && state) {
    payload.actionStartTime = state.currentAoeType ? state.aoeStartTime : state.currentTurnStartTime;
    client.pending = { type, data, actionStartTime: payload.actionStartTime, at: performance.now() };
  }
  client.socket.send(JSON.stringify(payload));
  metrics.wsSent++;
  return true;
}

function acknowledge(client, message) {
  const pending = client.pending;
  if (!pending) return;
  const isOwn = message.userId === client.username;
  const matched = (isOwn && ["CARDS_PLAYED", "AOE_PLAYED", "PLAYER_PASSED", "AOE_ANIMATION"].includes(message.event)) ||
    (message.event === "SYNC_HAND" && ["WGFD_SELECT", "GUANXING_SELECT", "GUSHOU_DISCARD", "KUROU_AWAKEN_DISCARD"].includes(pending.type));
  if (matched) {
    metrics.actionLatencyMs.push(performance.now() - pending.at);
    if (pending.type === "PLAY_CARD") metrics.plays++;
    else if (pending.type === "PASS") metrics.passes++;
    else metrics.aoeResponses++;
    client.pending = null;
  }
}

function receive(client, event) {
  if (stopping) return; // Departure broadcasts belong to cleanup, not the measured game.
  try {
    const message = JSON.parse(event.data);
    metrics.wsReceived++;
    if (["FORCE_LOGOUT", "CONNECTION_REPLACED"].includes(message.event)) {
      const detail = { room: client.room.id, username: client.username,
        event: message.event, message: message.msg };
      metrics.authenticationEvents.push(detail);
      console.log(JSON.stringify({ event: "AUTHENTICATION_EVENT", ...detail }));
      stop(`${message.event}: ${message.msg || "Authentication interrupted"}`);
      return;
    }
    acknowledge(client, message);
    const room = client.room;
    if (message.event === "SYNC_HAND") client.hand = message.cards || [];
    if (message.event === "GUANXING_SHOW") client.guanxingCards = message.cards || [];
    if (message.event === "SYNC_STATE" && client === room.clients[0]) room.state = message;
    if (message.event === "PONG" && client.pingAt) {
      metrics.heartbeatLatencyMs.push(performance.now() - client.pingAt);
      client.pingAt = 0;
    }
    if (message.event === "GAME_OVER" && !room.overAt) {
      room.overAt = Date.now();
      metrics.gamesCompleted++;
      for (const peer of room.clients) peer.pending = null;
    }
    if (message.event === "ERROR") {
      metrics.gameErrors.push({ room: room.id, message: message.msg, action: client.pending?.type });
      client.pending = null;
      if (metrics.gameErrors.length >= 3) stop("Three game protocol errors; inspect the driver before adding load");
    }
  } catch { stop("Invalid WebSocket JSON received"); }
}

async function waitUntil(predicate, label) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (stopReason || Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await delay(50);
  }
}

async function connect(room, index) {
  const identity = sessions ? sessions[index] : await api(null, "/api/auth/guest", "POST");
  if (!identity?.username || !identity.tabToken) throw new Error("Authentication response lacks username/tabToken");
  const client = { ...identity, room, hand: [], pending: null, pingAt: 0,
    lastPing: Date.now(), lastAuth: Date.now() + Math.random() * 5000,
    lastSocial: Date.now() + Math.random() * 2000, pollBusy: {}, scrollUsed: false };
  room.clients.push(client);
  clients.push(client);
  if (clients.slice(0, -1).some(peer => peer.username === client.username)) {
    throw new Error(`Guest authentication issued a duplicate active username: ${client.username}`);
  }
  const url = new URL("/ws/game", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("authToken", client.tabToken);
  client.socket = new WebSocket(url);
  client.socket.addEventListener("message", event => receive(client, event));
  client.socket.addEventListener("close", event => {
    if (!stopping) {
      const detail = { seconds: Math.round((Date.now() - started) / 1000),
        room: room.id, playerIndex: index, username: client.username,
        code: event.code, reason: event.reason, wasClean: event.wasClean };
      metrics.disconnections.push(detail);
      metrics.unexpectedDisconnects++;
      console.log(JSON.stringify({ event: "DISCONNECT", ...detail }));
      stop(`Unexpected WebSocket disconnect: code ${event.code}`);
    }
  });
  client.socket.addEventListener("error", () => { if (!stopping) stop("WebSocket connection error"); });
  await waitUntil(() => client.socket.readyState === WebSocket.OPEN, "WebSocket open");
  const connected = clients.filter(c => c.socket?.readyState === WebSocket.OPEN).length;
  metrics.peakConnected = Math.max(metrics.peakConnected, connected);
  send(client, "JOIN_ROOM", {
    isCreating: room.clients.length === 1, isPrivate: true, password: room.password,
    settings: room.settings,
  });
  await waitUntil(() => room.state?.players?.some(p => p.userId === client.username), "room join");
  if (!client.guest) metrics.registeredPolling = true;
  return client;
}

function chooseAction(room, client, state) {
  const hand = client.hand;
  if (state.currentAoeType) {
    if (state.currentAoeType === "WGFD") return ["WGFD_SELECT", state.settings?.wgfdCards?.[0] || null];
    if (state.currentAoeType === "GUANXING") return ["GUANXING_SELECT", (client.guanxingCards || []).slice(0, 2)];
    if (state.currentAoeType === "GUIXIN_DECISION") return ["GUIXIN_DECISION", { accept: false }];
    if (state.currentAoeType === "GUSHOU_DISCARD") return ["GUSHOU_DISCARD", hand.slice(0, 2)];
    if (state.currentAoeType === "KUROU_AWAKEN_DISCARD") return ["KUROU_AWAKEN_DISCARD", null];
    const red = state.currentAoeType === "NMRQ";
    const card = hand.find(c => red ? ["♥", "♦"].includes(c.suit) || c.rank === "大王" :
      ["♠", "♣"].includes(c.suit) || c.rank === "小王");
    return ["RESPOND_AOE", card || null];
  }
  const free = !state.tableCards?.length || state.lastPlayPlayer === client.username;
  const scroll = hand.find(c => c.suit === "SCROLL" && c.rank !== "JDSR");
  if (scroll && !client.scrollUsed) { client.scrollUsed = true; return ["PLAY_CARD", [scroll]]; }
  const regular = hand.filter(c => c.suit !== "SCROLL").sort((a, b) => a.weight - b.weight);
  const card = free ? regular[0] : state.tableCards.length === 1 ?
    regular.find(c => c.weight > state.tableCards[0].weight) : null;
  return card ? ["PLAY_CARD", [card]] : ["PASS", null];
}

function tickRoom(room, now) {
  const state = room.state;
  if (!room.enabled || !state || now < room.nextAt || room.busy) return;
  if (room.overAt) {
    for (const client of room.clients) send(client, "RETURN_TO_ROOM");
    room.overAt = 0;
    room.nextAt = now + 1000;
    return;
  }
  if (state.phase === "WAITING" && !state.isStarted) {
    for (const client of room.clients) {
      client.scrollUsed = false;
      const player = state.players.find(p => p.userId === client.username);
      if (client.username !== state.ownerId && !player?.isReady) send(client, "READY");
    }
    if (state.players.every(p => p.userId === state.ownerId || p.isReady)) send(room.clients[0], "START_GAME");
    room.nextAt = now + 1000;
    return;
  }
  if (state.phase === "SKILL_SELECTION") {
    for (const client of room.clients) {
      if (!state.settings?.skillsSelected?.[client.username]) send(client, "SELECT_SKILL", "TIEQI");
    }
    room.nextAt = now + 1000;
    return;
  }
  if (!state.isStarted || state.phase !== "PLAYING") return;
  if (["NMRQ", "WJQF"].includes(state.currentAoeType)) {
    // Everyone receives the same 10-second prompt; each player responds independently.
    for (const username of state.pendingAoePlayers || []) {
      const responder = room.clients.find(c => c.username === username);
      if (!responder || responder.pending) continue;
      const [type, data] = chooseAction(room, responder, state);
      send(responder, type, data, true);
    }
    room.nextAt = now + 1000 + Math.random() * 2000;
    return;
  }
  const actor = state.currentAoeType ? state.pendingAoePlayers?.[0] : state.currentTurn;
  const client = room.clients.find(c => c.username === actor);
  if (!client || client.pending) return;
  const [type, data] = chooseAction(room, client, state);
  send(client, type, data, true);
  room.nextAt = now + 1000 + Math.random() * 2000;
}

function poll(client, path, key, interval, now) {
  if (client.guest || client.pollBusy[key] || now - client[key] < interval) return;
  client[key] = now;
  client.pollBusy[key] = true;
  api(client, path).then(result => {
    if (key === "lastAuth" && result?.tabToken) client.tabToken = result.tabToken;
  }).catch(() => {}).finally(() => { client.pollBusy[key] = false; });
}
function progress() {
  generatorPeakRssMiB = Math.max(generatorPeakRssMiB, process.memoryUsage().rss / 1048576);
  const snapshot = {
    seconds: Math.round((Date.now() - started) / 1000),
    connected: clients.filter(c => c.socket?.readyState === WebSocket.OPEN).length,
    playingRooms: rooms.filter(r => r.state?.isStarted).length,
    games: metrics.gamesCompleted, plays: metrics.plays, passes: metrics.passes,
    aoeResponses: metrics.aoeResponses, errors: metrics.gameErrors.length,
    recentActionP95Ms: distribution(metrics.actionLatencyMs.slice(-500)).p95,
    generatorLoopP95Ms: Math.round(generatorLoopDelay.percentile(95) / 1e5) / 10,
  };
  metrics.progress.push(snapshot);
  console.log(JSON.stringify({ event: "PROGRESS", ...snapshot }));
}
function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = p => sorted.length ? Math.round(sorted[Math.ceil(p * sorted.length) - 1] * 10) / 10 : null;
  return { count: sorted.length, median: at(.5), p95: at(.95), p99: at(.99), max: at(1) };
}

const ticker = setInterval(() => {
  if (stopping || stopReason) return;
  const now = Date.now();
  for (const room of rooms) tickRoom(room, now);
  for (const client of clients) {
    if (!stopReason && client.pending && performance.now() - client.pending.at > 8000) {
      const state = client.room.state;
      const detail = { room: client.room.id, username: client.username,
        action: client.pending.type, data: client.pending.data,
        actionStartTime: client.pending.actionStartTime, hand: client.hand,
        phase: state?.phase, currentTurn: state?.currentTurn,
        currentAoeType: state?.currentAoeType, pendingAoePlayers: state?.pendingAoePlayers,
        currentTurnStartTime: state?.currentTurnStartTime, aoeStartTime: state?.aoeStartTime,
        tableCards: state?.tableCards, lastPlayPlayer: state?.lastPlayPlayer };
      metrics.stalledActions.push(detail);
      console.log(JSON.stringify({ event: "STALLED_ACTION", ...detail }));
      stop("Game action acknowledgement exceeded 8 seconds");
    }
    if (client.socket?.readyState !== WebSocket.OPEN) continue;
    if (now - client.lastPing > 10000) {
      if (client.pingAt) stop("Missing heartbeat response");
      client.pingAt = performance.now(); client.lastPing = now; send(client, "PING");
    }
    poll(client, "/api/auth/me", "lastAuth", 5000, now);
    poll(client, "/api/social/overview", "lastSocial", 2000, now);
  }
}, 200);
const logger = setInterval(progress, 10000);
try {
  await checkStopFile();
  for (let index = 0; index < players / 4 && !stopReason; index++) {
    const room = { id: `load_${runId}_${index}`, password: String(1000 + Math.floor(Math.random() * 9000)),
      clients: [], state: null, enabled: false, nextAt: Date.now() + 1000,
      settings: { enableScrollCards: values.mode === "mixed", enableSkills: values.mode === "mixed", enableWildcard: false } };
    rooms.push(room);
    for (let player = 0; player < 4 && !stopReason; player++) await connect(room, index * 4 + player);
    if (stopReason) break;
    room.enabled = true;
    if (players <= 100 || (index + 1) % 25 === 0 || index + 1 === players / 4) progress();
    await delay(rampMs);
  }
  if (!stopReason) {
    steadyStarted = Date.now();
    metrics.steadyStartedAt = new Date(steadyStarted).toISOString();
    while (!stopReason && Date.now() - steadyStarted < duration * 1000) {
      await delay(500);
    }
  }
} catch (error) { stop(error.message); }
finally {
  progress();
  metrics.steadySeconds = steadyStarted ? Math.round((Date.now() - steadyStarted) / 1000) : 0;
  metrics.steadyEndedAt = steadyStarted ? new Date().toISOString() : null;
  const generatorCpu = process.cpuUsage(generatorCpuStarted);
  metrics.loadGenerator = {
    cpuMeanPercentOfOneCore: Math.round((generatorCpu.user + generatorCpu.system) / ((Date.now() - started) * 10) * 10) / 10,
    eventLoopP95Ms: Math.round(generatorLoopDelay.percentile(95) / 1e5) / 10,
    eventLoopMaxMs: Math.round(generatorLoopDelay.max / 1e5) / 10,
    peakRssMiB: Math.round(generatorPeakRssMiB * 10) / 10,
  };
  generatorLoopDelay.disable();
  stopping = true;
  clearInterval(ticker); clearInterval(logger);
  if (stopFileWatcher) clearInterval(stopFileWatcher);
  for (const client of clients) {
    if (client.socket?.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify({ type: "LEAVE_ROOM", roomId: client.room.id, userId: client.username }));
    }
  }
  await delay(1500);
  for (const client of clients) client.socket?.close();
  for (let index = 0; index < clients.length; index += 4) {
    await Promise.allSettled(clients.slice(index, index + 4).map(client => api(client, "/api/auth/logout", "POST")));
    await delay(100);
  }
  const remainingRooms = [];
  for (const room of rooms) {
    if (!room.clients.length) continue;
    try { if ((await api(null, `/api/rooms/check?roomId=${encodeURIComponent(room.id)}`))?.exists) remainingRooms.push(room.id); }
    catch { remainingRooms.push(room.id); }
  }
  metrics.remainingRooms = remainingRooms;
  metrics.endedAt = new Date().toISOString();
  metrics.stopReason = stopReason;
  metrics.actionLatency = distribution(metrics.actionLatencyMs);
  metrics.heartbeatLatency = distribution(metrics.heartbeatLatencyMs);
  metrics.httpLatency = distribution(metrics.httpLatencyMs);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(metrics, null, 2) + "\n");
  console.log(JSON.stringify({ event: "RESULT", output, peakConnected: metrics.peakConnected,
    steadySeconds: metrics.steadySeconds, games: metrics.gamesCompleted, plays: metrics.plays,
    errors: metrics.gameErrors.length, unexpectedDisconnects: metrics.unexpectedDisconnects,
    actionLatency: metrics.actionLatency, heartbeatLatency: metrics.heartbeatLatency,
    remainingRooms: remainingRooms.length, stopReason }));
  if (stopReason || remainingRooms.length) process.exitCode = 1;
}
