import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleRoom } from '../server/room.js';
import { MAP } from '../src/game/terrain.js';
import { VISION_WIDTH, VISION_HEIGHT } from '../src/game/protocol.js';

const setup = options => { const room = new BattleRoom('ABC234', options); return { room, a: room.join(() => {}), b: room.join(() => {}) }; };
const cmd = (room, seat, action, payload = {}, seq = seat.lastSeq + 1) => room.command(seat, { type: 'command', action, payload, seq });

test('双向布阵独立扣费，准备锁定，双方准备后统一开战，重复指令不重放', () => {
  const { room, a, b } = setup();
  const first = cmd(room, a, 'quickDeploy'); assert.ok(first.ok);
  assert.ok(cmd(room, a, 'quickDeploy', {}, first.seq).ok); assert.equal(room.sim.units.length, 25);
  assert.ok(cmd(room, b, 'quickDeploy').ok);
  assert.equal(room.sim.budgets.ally, 950); assert.equal(room.sim.budgets.enemy, 950);
  assert.ok(cmd(room, a, 'ready', { value: true }).ok);
  assert.equal(room.sim.phase, 'preparation'); assert.ok(!cmd(room, a, 'undo').ok);
  assert.ok(cmd(room, b, 'ready', { value: true }).ok); assert.equal(room.sim.phase, 'battle');
  assert.ok(room.sim.units.every(u => u.mode === 'hold')); room.step(); assert.equal(room.tick, 1);
});

test('指令拒绝越权、非法坐标、伪造兵种、计划归属和不可见目标', () => {
  const { room, a, b } = setup(); cmd(room, a, 'quickDeploy'); cmd(room, b, 'quickDeploy');
  const ally = room.sim.units.find(u => u.team === a.team), enemy = room.sim.units.find(u => u.team === b.team);
  assert.ok(!cmd(room, b, 'mode', { ids: [ally.id], mode: 'auto' }).ok);
  assert.ok(!cmd(room, a, 'move', { ids: [ally.id], center: { x: NaN, z: 0 }, formation: 'grid' }).ok);
  assert.ok(!cmd(room, a, 'deploy', { kind: '__proto__', center: { x: -30, z: 0 }, count: 1, formation: 'grid', angle: 0 }).ok);
  const plan = cmd(room, a, 'frontline', { ids: [ally.id], line: [{ x: -30, z: -1 }, { x: -30, z: 1 }] }); assert.ok(plan.ok);
  assert.ok(!cmd(room, b, 'offensive', { planId: plan.planId, point: { x: -10, z: 0 } }).ok);
  cmd(room, a, 'ready', { value: true }); cmd(room, b, 'ready', { value: true });
  assert.ok(!cmd(room, a, 'attack', { ids: [ally.id], targetId: enemy.id }).ok);
});

test('快照不泄露隐藏敌军、敌方计划、兵力、弹道终点或事件', () => {
  const { room, a, b } = setup(); cmd(room, a, 'quickDeploy'); cmd(room, b, 'quickDeploy');
  let snap = room.snapshot(a); assert.ok(snap.units.every(u => u.team === 'ally')); assert.equal(snap.units.length, 25);
  assert.equal(snap.enemies, undefined); assert.equal(snap.token, undefined);
  cmd(room, a, 'ready', { value: true }); cmd(room, b, 'ready', { value: true });
  const enemy = room.sim.units.find(u => u.team === 'enemy');
  room.sim.projectiles.push({ id: 'hidden', team: 'enemy', fromX: enemy.x, fromZ: enemy.z, x: -40, z: 0, time: 0, duration: 10 });
  room.sim.events.push({ kind: 'stomp', team: 'enemy', x: enemy.x, z: enemy.z, time: 0 }); room.step();
  snap = room.snapshot(a); assert.equal(snap.projectiles.length, 0); assert.ok(snap.events.every(e => e.team === 'ally'));
  const scout = room.sim.units.find(u => u.team === 'ally'); scout.x = enemy.x - 2; scout.z = enemy.z;
  room.sim.refreshVisibility(); snap = room.snapshot(a); assert.ok(snap.units.some(u => u.id === enemy.id));
  scout.x = -45; room.sim.refreshVisibility(); snap = room.snapshot(a);
  assert.ok(!snap.units.some(u => u.id === enemy.id)); assert.ok(snap.removed.includes(enemy.id));
});

test('重连恢复席位和序号，过期掉线判负；认输双方结果相反', () => {
  let now = 0;
  const { room, a, b } = setup({ now: () => now }); cmd(room, a, 'quickDeploy');
  room.disconnect(a); now = 500;
  assert.equal(room.resume(a.token, () => {}), a); assert.equal(a.lastSeq, 1);
  assert.throws(() => room.resume(a.token, () => {}));
  room.disconnect(a); now += 30001; room.step();
  assert.equal(room.snapshot(a).phase, 'defeat'); assert.equal(room.snapshot(b).phase, 'victory');
  const next = setup(); assert.ok(cmd(next.room, next.b, 'surrender').ok);
  assert.equal(next.room.snapshot(next.a).phase, 'victory');
});

test('重复改画战线不累计失效计划，双方计划仍独立保留', () => {
  const { room, a, b } = setup(); cmd(room, a, 'quickDeploy'); cmd(room, b, 'quickDeploy');
  const ally = room.sim.units.find(u => u.team === 'ally'), enemy = room.sim.units.find(u => u.team === 'enemy');
  assert.ok(cmd(room, b, 'frontline', { ids: [enemy.id], line: [{ x: 30, z: -2 }, { x: 30, z: 2 }] }).ok);
  for (let i = 0; i < 120; i++) assert.ok(cmd(room, a, 'frontline', { ids: [ally.id], line: [{ x: -30, z: -2 }, { x: -30, z: 2 }] }).ok);
  assert.equal(room.sim.plans.length, 2);
  assert.equal(room.snapshot(a).plans.length, 1); assert.equal(room.snapshot(b).plans.length, 1);
});

test('服务端视野格逐格等同共享侦察规则，包括树林、高地、地图边缘与阵亡单位', () => {
  const { room, a, b } = setup();
  const positions = [{x:-62,z:-40},{x:-9,z:-9},{x:-8,z:9},{x:0,z:0},{x:27,z:-18},{x:62,z:40}];
  for (const seat of [a,b]) for (const [i,p] of positions.entries()) room.sim.addUnit(i%2?'kun':'mao',seat.team,p);
  room.sim.units[0].hp=0;
  for (const seat of [a,b]) {
    const mask = room.snapshot(seat).vision;
    for(let z=0;z<VISION_HEIGHT;z++) for(let x=0;x<VISION_WIDTH;x++) {
      const point={x:MAP.minX+(x+.5)/VISION_WIDTH*(MAP.maxX-MAP.minX),z:MAP.minZ+(z+.5)/VISION_HEIGHT*(MAP.maxZ-MAP.minZ)};
      assert.equal(mask[z*VISION_WIDTH+x],room.sim.isPointVisible(point,seat.team)?255:0,`${seat.team} ${x},${z}`);
    }
  }
});
