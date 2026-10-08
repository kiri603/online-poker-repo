import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const read = (name) => readFileSync(new URL(`../src/store/${name}.js`, import.meta.url), "utf8");
const stripImports = (source) => source.replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "");

function setup() {
  let timerId = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const sockets = [];
  const storage = new Map();
  storage.set("poker:tab-auth-token", "token");
  const listeners = new Map();
  const playedAudio = [];
  const sessionStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  class Socket {
    static CONNECTING = 0;
    static OPEN = 1;
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code, wasClean: code === 1000 }); }
  }
  const globals = {
    ref: (value) => ({ value }),
    computed: (fn) => ({ get value() { return fn(); } }),
    WebSocket: Socket, Date, console,
    alert: () => {}, prompt: () => null,
    getTabAuthToken: () => storage.get("poker:tab-auth-token") || "", getWsBaseUrl: () => "ws://localhost",
    clearTabAuthToken: () => storage.delete("poker:tab-auth-token"),
    setTabAuthToken: (value) => storage.set("poker:tab-auth-token", value),
    resetSocialState: () => {}, resetAuthState: async () => {},
    playAudio: (name) => playedAudio.push(name), playCardAudio: () => {}, playBGM: () => {}, stopCountdownAudio: () => {},
    clearBattleEffects: () => {}, handleBattleFeedback: () => {}, stopGameAudio: () => {},
    setInterval: (fn, ms) => { intervals.set(++timerId, { fn, ms }); return timerId; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (fn, ms) => { timeouts.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => timeouts.delete(id),
  };
  globals.window = {
    sessionStorage, localStorage: sessionStorage,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    setInterval: globals.setInterval, clearInterval: globals.clearInterval,
    setTimeout: globals.setTimeout, clearTimeout: globals.clearTimeout,
    crypto: { randomUUID: () => "tab-1" },
  };
  const context = vm.createContext(globals);
  const stateSource = read("gameState");
  const names = [...stateSource.matchAll(/export const (\w+)/g)].map((m) => m[1]);
  vm.runInContext(`(() => { ${stripImports(stateSource).replace(/export const /g, "const ")}\nglobalThis.state = {${names.join(",")}}; })()`, context);
  const socketSource = read("gameSocket");
  const socketNames = [...socketSource.matchAll(/export const (\w+)/g)].map((m) => m[1]);
  vm.runInContext(`(() => { ${stripImports(socketSource).replace(/export const /g, "const ")}\nglobalThis.api = {${socketNames.join(",")}}; })()`, context);
  const state = context.state;
  state.roomId.value = "101";
  state.userId.value = "p1";
  state.isAuthenticated.value = true;
  state.authUser.value = { username: "p1", guest: false };
  context.api.connectWebSocket(false);
  const socket = sockets.at(-1);
  socket.readyState = Socket.OPEN;
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ event: "SYNC_STATE", phase: "PLAYING",
    isStarted: true, currentTurn: "p1", currentTurnStartTime: Date.now(),
    players: [{ userId: "p1", status: "PLAYING" }], spectators: [], settings: {}, tableCards: [] }) });
  state.gameStarted.value = true;
  state.handCards.value = [{ suit: "♠", rank: "3", weight: 1 }];
  function loadAuth(status) {
    context.disconnectWebSocket = (options) => context.api.disconnectWebSocket(options);
    context.apiFetch = async (path) => path === "/api/auth/me"
      ? { ok: status === 200, status, json: async () => ({ username: "p1", guest: false, tabToken: "token" }) }
      : { ok: true, json: async () => ({}) };
    const source = read("authStore");
    vm.runInContext(`(() => { ${stripImports(source).replace(/export const /g, "const ")}\nglobalThis.authApi = {verifyCurrentSession, resetAuthState, bootstrapAuth, submitGuestLogin}; })()`, context);
    context.resetAuthState = context.authApi.resetAuthState;
  }
  return { context, state, sockets, socket, intervals, timeouts, loadAuth, playedAudio };
}

test("temporary auth HTTP 503 retains the authenticated game", async () => {
  const t = setup();
  t.loadAuth(503);
  await t.context.authApi.verifyCurrentSession();
  assert.equal(t.state.isAuthenticated.value, true);
  assert.equal(t.state.gameStarted.value, true);
  assert.equal(t.socket.readyState, WebSocketOpen);
});
const WebSocketOpen = 1;

test("leaving a room cancels delayed cavalry audio and removes transient judgement cards", () => {
  const t = setup();
  t.socket.onmessage({ data: JSON.stringify({ event: "TIEQI_JUDGE", userId: "p1", card: { suit: "♥", rank: "3" }, success: true, suppressed: ["p2"] }) });
  assert.equal(t.state.tieqiJudgeCards.value.length, 0);
  t.context.api.disconnectWebSocket();
  for (const { fn } of [...t.timeouts.values()]) fn();
  assert.equal(t.state.tieqiJudgeCards.value.length, 0);
  assert.equal(t.playedAudio.includes("skill_tieqi_horse"), false);
  assert.equal(Object.keys(t.state.activeActionTexts.value).length, 0);
});

test("real auth HTTP 401 still ends the authenticated session", async () => {
  const t = setup();
  t.loadAuth(401);
  await t.context.authApi.verifyCurrentSession();
  assert.equal(t.state.isAuthenticated.value, false);
  assert.equal(t.state.gameStarted.value, false);
});

test("initial session bootstrap still restores a valid login", async () => {
  const t = setup();
  t.loadAuth(200);
  t.state.isAuthenticated.value = false;
  t.state.authUser.value = null;
  await t.context.authApi.bootstrapAuth();
  assert.equal(t.state.authChecked.value, true);
  assert.equal(t.state.isAuthenticated.value, true);
});

test("abnormal disconnect preserves the game and schedules recovery", () => {
  const t = setup();
  t.socket.close(1006);
  assert.equal(t.state.gameStarted.value, true);
  assert.equal(t.state.handCards.value.length, 1);
  assert.equal(t.state.isReconnecting.value, true);
  assert.ok([...t.timeouts.values()].some((timer) => timer.ms <= 1000));
});

test("a replaced socket cannot clear the active connection", () => {
  const t = setup();
  t.context.api.connectWebSocket(false);
  const replacement = t.sockets.at(-1);
  replacement.readyState = WebSocketOpen;
  replacement.onopen();
  t.socket.onclose({ code: 1006 });
  assert.equal(t.state.isConnected.value, true);
  assert.equal(t.state.handCards.value.length, 1);
});

test("sending without a usable connection reports failure", () => {
  const t = setup();
  t.socket.readyState = 3;
  assert.equal(t.context.api.sendMsg("PASS", null), false);
  assert.notEqual(t.state.errorMessage.value, "");
});

test("empty WGFD candidates cannot crash the countdown", () => {
  const t = setup();
  t.state.currentAoeType.value = "WGFD";
  t.state.pendingAoePlayers.value = ["p1"];
  t.state.aoeStartTime.value = Date.now() - 11_000;
  t.state.wgfdCards.value = [];
  const tick = [...t.intervals.values()].find((timer) => timer.ms === 500).fn;
  assert.doesNotThrow(tick);
});

test("explicit exit cancels recovery and cannot reopen the room", () => {
  const t = setup();
  t.socket.close(1006);
  t.context.api.disconnectWebSocket();
  for (const timer of [...t.timeouts.values()]) timer.fn();
  assert.equal(t.state.isReconnecting.value, false);
  assert.equal(t.state.gameStarted.value, false);
  assert.equal(t.sockets.length, 1);
});

test("recovery rejoins the existing room and accepts a new private hand", async () => {
  const t = setup();
  t.socket.close(1006);
  [...t.timeouts.values()].find((timer) => timer.ms === 500).fn();
  const recovered = t.sockets.at(-1);
  recovered.readyState = WebSocketOpen;
  recovered.onopen();
  assert.equal(recovered.sent[0].type, "JOIN_ROOM");
  assert.equal(recovered.sent[0].data.isCreating, false);
  await recovered.onmessage({ data: JSON.stringify({ event: "SYNC_HAND", cards: [{ suit: "♥", rank: "4", weight: 2 }] }) });
  await recovered.onmessage({ data: JSON.stringify({ event: "SYNC_STATE", phase: "PLAYING", isStarted: true,
    currentTurn: "p2", players: [{ userId: "p1", status: "PLAYING" }], settings: {} }) });
  assert.equal(t.state.isReconnecting.value, false);
  assert.equal(t.state.currentTurn.value, "p2");
  assert.equal(t.state.handCards.value[0].suit, "♥");
});

test("heartbeat detects a silent broken connection", () => {
  const t = setup();
  const originalNow = Date.now;
  try {
    const now = Date.now();
    Date.now = () => now + 31_000;
    [...t.intervals.values()].find((timer) => timer.ms === 10_000).fn();
    assert.equal(t.state.isReconnecting.value, true);
  } finally { Date.now = originalNow; }
});

test("restored skill selection uses the server deadline and one timer", async () => {
  const t = setup();
  await t.socket.onmessage({ data: JSON.stringify({ event: "START_SKILL_SELECTION" }) });
  await t.socket.onmessage({ data: JSON.stringify({ event: "SYNC_STATE", phase: "SKILL_SELECTION", isStarted: true,
    currentTurnStartTime: Date.now() - 21_000, players: [{ userId: "p1", status: "WAITING" }], settings: { skillsSelected: {} } }) });
  assert.equal(t.intervals.size, 2);
  [...t.intervals.values()].find((timer) => timer.ms === 500).fn();
  assert.equal(t.socket.sent.at(-1).type, "SELECT_SKILL");
  assert.equal(t.socket.sent.at(-1).data, "ZHIHENG");
  assert.equal(t.state.showSkillSelection.value, false);
});

test("recovery stops after thirty seconds", () => {
  const t = setup();
  t.socket.close(1006);
  const retry = [...t.timeouts.values()].find((timer) => timer.ms === 500).fn;
  const originalNow = Date.now;
  try {
    const now = Date.now();
    Date.now = () => now + 31_000;
    retry();
    assert.equal(t.state.isReconnecting.value, false);
    assert.equal(t.state.gameStarted.value, false);
    assert.equal(t.sockets.length, 1);
    assert.match(t.state.errorMessage.value, /恢复超时/);
  } finally { Date.now = originalNow; }
});

test("timeout leads with a card when the table belongs to this player", () => {
  const t = setup();
  t.state.tableCards.value = [{ suit: "♠", rank: "2", weight: 13 }];
  t.state.lastPlayPlayer.value = "p1";
  assert.equal(t.context.api.handleTimeout(), true);
  assert.equal(t.socket.sent.at(-1).type, "PLAY_CARD");
});

test("guest login retains the server-issued page credential", async () => {
  const t = setup();
  t.loadAuth(200);
  t.context.apiFetch = async () => ({ ok: true, json: async () => ({ username: "guest-one", guest: true, tabToken: "guest-credential" }) });
  await t.context.authApi.submitGuestLogin();
  assert.equal(t.context.getTabAuthToken(), "guest-credential");
  assert.equal(t.state.userId.value, "guest-one");
});

test("replacement close stops recovery even if its message was lost", async () => {
  const t = setup();
  t.loadAuth(200);
  t.socket.close(4001);
  await Promise.resolve();
  assert.equal(t.state.isReconnecting.value, false);
  assert.equal(t.state.isAuthenticated.value, false);
  assert.equal(t.state.gameStarted.value, false);
  assert.match(t.state.authError.value, /其他页面/);
  assert.match(t.state.errorMessage.value, /其他页面/);
  for (const timer of [...t.timeouts.values()]) timer.fn();
  assert.equal(t.sockets.length, 1);
});

test("replacement message ends the old page without logging out the new page", async () => {
  const t = setup();
  t.loadAuth(200);
  const paths = [];
  t.context.apiFetch = async (path) => { paths.push(path); return { ok: true, json: async () => ({}) }; };
  await t.socket.onmessage({ data: JSON.stringify({ event: "CONNECTION_REPLACED", msg: "该身份已在其他页面进入房间" }) });
  assert.equal(t.state.isAuthenticated.value, false);
  assert.equal(t.state.isReconnecting.value, false);
  assert.equal(paths.includes("/api/auth/logout"), false);
  assert.match(t.state.errorMessage.value, /其他页面/);
});
