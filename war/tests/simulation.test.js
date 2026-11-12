import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSimulation, damageFor, attackRange } from '../src/game/simulation.js';
import { heightAt } from '../src/game/terrain.js';

const fresh = (budget = 4200) => new BattleSimulation({ budget, enemyRoster: false });
const advance = (sim, seconds) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) sim.step(1 / 30); };

test('批量布阵整批扣费，越界或费用不足时不会放出半支部队', () => {
  const sim = fresh(600);
  assert.ok(sim.deploy('mao', { x: -23, z: 0 }, 5).ok);
  assert.equal(sim.budget, 300);
  assert.equal(sim.units.length, 5);
  assert.ok(!sim.deploy('kun', { x: -25, z: 8 }, 5).ok);
  assert.ok(!sim.deploy('mao', { x: -15.5, z: 0 }, 5).ok);
  assert.equal(sim.units.length, 5);
  assert.equal(sim.budget, 300);
});

test('移除和撤销返还预算，开战后不能再放置或删除部队', () => {
  const sim = fresh();
  const batch = sim.deploy('kun', { x: -23, z: 0 }, 5);
  sim.remove([batch.ids[0]]);
  assert.equal(sim.budget, 4200 - 4 * 120);
  sim.undo();
  assert.equal(sim.budget, 4200);
  sim.deploy('mao', { x: -22, z: 0 }, 1);
  sim.addUnit('mao', 'enemy', { x: 22, z: 0 });
  sim.start();
  assert.ok(!sim.deploy('mao', { x: -25, z: 0 }, 1).ok);
  assert.equal(sim.remove(sim.units.map(u => u.id)), 0);
});

test('准备阶段的移动布阵被限制在准备区内', () => {
  const sim = fresh(); const batch = sim.deploy('mao', { x: -23, z: 0 }, 5);
  assert.equal(sim.issueMove(batch.ids, { x: 10, z: 0 }), 0);
  assert.equal(sim.issueMove(batch.ids, { x: -24, z: 6 }), 5);
  assert.ok(sim.units.every(u => u.x < -16 && u.z > 3));
});

test('右键移动优先到达目的地，不会被途中近敌打断', () => {
  const sim = fresh();
  const ally = sim.addUnit('mao', 'ally', { x: -22, z: 0 });
  const enemy = sim.addUnit('mao', 'enemy', { x: -21, z: 0 }, { speed: 0, attack: 0 });
  sim.start();sim.issueMove([ally.id], { x: -25, z: 0 });advance(sim, .4);
  assert.ok(ally.x < -22.5);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(ally.order.kind, 'move');
});

test('右键指定攻击优先于更近的敌人，目标阵亡后恢复待命', () => {
  const sim = fresh();
  const ally = sim.addUnit('kun', 'ally', { x: -23, z: 0 });
  const near = sim.addUnit('mao', 'enemy', { x: -21, z: 0 }, { speed: 0, attack: 0 });
  const target = sim.addUnit('mao', 'enemy', { x: -17, z: 0 }, { speed: 0, attack: 0, hp: 5 });
  sim.start();sim.issueAttack([ally.id], target.id);advance(sim, 1.2);
  assert.ok(target.hp <= 0);
  assert.equal(near.hp, near.maxHp);
  advance(sim, .1);
  assert.equal(ally.order.kind, 'idle');
  assert.equal(ally.mode, 'hold');
});

test('待命远程单位攻击射程内目标，弹道命中前不结算伤害', () => {
  const sim = fresh();
  const ally = sim.addUnit('kun', 'ally', { x: -23, z: 0 });
  const target = sim.addUnit('mao', 'enemy', { x: -17, z: 0 }, { speed: 0, attack: 0 });
  sim.start();sim.step(1/30);
  assert.equal(target.hp, target.maxHp);
  assert.equal(sim.projectiles.length, 1);
  advance(sim, .8);
  assert.ok(target.hp < target.maxHp);
});

test('树林降低篮球伤害，高地提高射程和伤害，护甲减伤', () => {
  const plain = { kind: 'kun', attack: 36, armor: 0, range: 9.5, x: -23, z: 0 };
  const target = { kind: 'mao', armor: 0, x: -20, z: 0 };
  const coverTarget = { ...target, x: -8, z: 9 };
  assert.ok(damageFor(plain, coverTarget) < damageFor(plain, target));
  const hill = { ...plain, x: -9, z: -9 };
  assert.ok(heightAt(hill.x, hill.z) > 2);
  assert.ok(attackRange(hill, target) > attackRange(plain, target));
  assert.ok(damageFor(hill, target) > damageFor(plain, target));
  assert.ok(damageFor(plain, { ...target, armor: 7 }) < damageFor(plain, target));
});

test('护盾先承受伤害，支援单位只治疗友军', () => {
  const sim = fresh();
  const tank = sim.addUnit('mengqi', 'ally', { x: -23, z: 0 });
  sim.addUnit('mao', 'enemy', { x: -22, z: 0 }, { speed: 0 });
  sim.start();advance(sim, .8);
  assert.ok(tank.shield < 110);assert.equal(tank.hp, tank.maxHp);
  const healing = fresh();
  healing.addUnit('naiwa', 'ally', { x: -23, z: 0 });
  const friend = healing.addUnit('mao', 'ally', { x: -25, z: 0 }, { hp: 35, speed: 0 });
  const foe = healing.addUnit('mao', 'enemy', { x: 20, z: 0 }, { hp: 35, speed: 0, attack: 0 });
  healing.start();advance(healing, .1);
  assert.ok(friend.hp > 35);assert.equal(foe.hp, 35);
});

test('暂停停止逻辑时钟与移动，敌军被消灭后触发胜利', () => {
  const sim = fresh();
  const ally = sim.addUnit('mao', 'ally', { x: -23, z: 0 });
  const enemy = sim.addUnit('mao', 'enemy', { x: -21.8, z: 0 }, { hp: 1, speed: 0, attack: 0 });
  sim.start();sim.setPaused(true);advance(sim, 1);
  assert.equal(sim.time, 0);assert.equal(ally.x, -23);assert.equal(enemy.hp, 1);
  sim.setPaused(false);advance(sim, 1);
  assert.equal(sim.phase, 'victory');
});

test('不能向敌方下令，单位总数上限为200，己方最多100名', () => {
  const sim = fresh(99999); const enemy=sim.addUnit('mao','enemy',{x:22,z:0});
  assert.equal(sim.issueMove([enemy.id],{x:-23,z:0}),0);
  assert.equal(sim.issueAttack([enemy.id],enemy.id),0);
  for(let i=0;i<100;i++)sim.addUnit('mao','ally',{x:-23,z:0});
  assert.ok(!sim.deploy('mao',{x:-25,z:8},1).ok);
  for(let i=0;i<99;i++)sim.addUnit('mao','enemy',{x:23,z:0});
  assert.equal(sim.units.length,200);
  assert.equal(sim.addUnit('mao','enemy',{x:23,z:0}),null);
});

test('战线按线段自动分列展开，推进箭头需执行后才生效', () => {
  const sim = fresh(); const batch = sim.deploy('mao',{x:-23,z:0},10);
  const plan = sim.assignFrontline(batch.ids,[{x:-22,z:-5},{x:-22,z:5}]);
  assert.ok(plan.ok);
  assert.equal(new Set(sim.units.map(u=>`${u.x.toFixed(2)},${u.z.toFixed(2)}`)).size,10);
  assert.ok(sim.units.every(u=>u.order.kind==='frontline'));
  assert.ok(sim.setOffensiveTarget(plan.planId,{x:12,z:0}));
  sim.addUnit('mao','enemy',{x:28,z:0},{speed:0,attack:0});sim.start();
  const before=sim.units[0].x;advance(sim,.2);assert.ok(Math.abs(sim.units[0].x-before)<.2);
  assert.ok(sim.executePlans());advance(sim,.7);assert.ok(sim.units[0].x>before+1);
  assert.equal(sim.units[0].order.kind,'advance');
});

test('手动右键覆盖所选单位的自动战略，其余单位继续推进', () => {
  const sim=fresh();const batch=sim.deploy('mao',{x:-23,z:0},5);
  const plan=sim.assignFrontline(batch.ids,[{x:-22,z:-3},{x:-22,z:3}]);
  sim.setOffensiveTarget(plan.planId,{x:15,z:0});sim.addUnit('mao','enemy',{x:28,z:0},{speed:0,attack:0});sim.start();sim.executePlans();
  sim.issueMove([batch.ids[0]],{x:-27,z:0});
  assert.equal(sim.getUnit(batch.ids[0]).order.kind,'move');
  assert.equal(sim.getUnit(batch.ids[1]).order.kind,'advance');
});

test('准备阶段手动重新布阵后退出旧战线，开战不会被旧计划拉回', () => {
  const sim=fresh(); const batch=sim.deploy('mao',{x:-23,z:0},5);
  const plan=sim.assignFrontline(batch.ids,[{x:-22,z:-3},{x:-22,z:3}]);
  sim.setOffensiveTarget(plan.planId,{x:15,z:0});
  assert.equal(sim.issueMove([batch.ids[0]],{x:-27,z:-10}),1);
  assert.equal(sim.getUnit(batch.ids[0]).order.kind,'idle');
  assert.equal(sim.getUnit(batch.ids[0]).order.planId,undefined);
  sim.addUnit('mao','enemy',{x:28,z:0},{speed:0,attack:0});sim.start();sim.executePlans();
  assert.equal(sim.getUnit(batch.ids[0]).order.kind,'idle');
  assert.equal(sim.getUnit(batch.ids[1]).order.kind,'advance');
});

test('正在推进时修改箭头会更新计划内单位的目标，保留手动接管', () => {
  const sim=fresh();const batch=sim.deploy('mao',{x:-23,z:0},5);
  const plan=sim.assignFrontline(batch.ids,[{x:-22,z:-3},{x:-22,z:3}]);
  sim.setOffensiveTarget(plan.planId,{x:15,z:0});
  sim.addUnit('mao','enemy',{x:28,z:0},{speed:0,attack:0});sim.start();sim.executePlans();
  sim.issueMove([batch.ids[0]],{x:-27,z:0});
  const previous=sim.getUnit(batch.ids[1]).order.z;
  sim.setOffensiveTarget(plan.planId,{x:15,z:12});
  assert.ok(sim.getUnit(batch.ids[1]).order.z>previous+8);
  assert.equal(sim.getUnit(batch.ids[0]).order.kind,'move');
});

test('推荐编队默认待命，人机主动侦察时玩家不会无命令行军', () => {
  const sim=new BattleSimulation();assert.ok(sim.quickDeploy());
  const positions=sim.units.map(u=>({x:u.x,z:u.z}));
  assert.ok(sim.start());advance(sim,3);
  assert.equal(sim.phase,'battle');
  sim.units.forEach((u,i)=>{if(u.team==='ally'){assert.equal(u.mode,'hold');assert.equal(u.x,positions[i].x);assert.equal(u.z,positions[i].z);}});
  assert.ok(sim.units.some((u,i)=>u.team==='enemy' && Math.hypot(u.x-positions[i].x,u.z-positions[i].z)>1));
});

test('视野由己方共享，范围外无法指定攻击，失去视野后不追踪真实位置', () => {
  const sim = fresh();
  const archer = sim.addUnit('kun', 'ally', { x: -25, z: 0 }, { speed: 0 });
  const scout = sim.addUnit('mao', 'ally', { x: 18, z: 0 }, { speed: 0 });
  const enemy = sim.addUnit('mao', 'enemy', { x: 25, z: 0 }, { speed: 0, attack: 0 });
  sim.start();
  assert.ok(sim.isVisible(enemy));
  assert.equal(sim.issueAttack([archer.id], enemy.id), 1);
  scout.hp = 0; sim.refreshVisibility();
  assert.ok(!sim.isVisible(enemy));
  assert.equal(sim.issueAttack([archer.id], enemy.id), 0);
  advance(sim, .2);
  assert.equal(archer.targetId, null);
  assert.notEqual(archer.order.kind, 'attack');
  assert.equal(enemy.hp, enemy.maxHp);
});

test('双方自动索敌遵循视野，远端目标保持未知', () => {
  const sim = fresh();
  const ally = sim.addUnit('mao', 'ally', { x: -45, z: 0 });
  const enemy = sim.addUnit('mao', 'enemy', { x: 45, z: 0 });
  sim.setMode([ally.id], 'auto'); sim.setMode([enemy.id], 'auto', 'enemy');
  sim.start(); advance(sim, 1);
  assert.equal(ally.targetId, null); assert.equal(enemy.targetId, null);
  assert.ok(!sim.isVisible(enemy));
  assert.equal(ally.x, -45); assert.equal(enemy.x, 45);
});

test('移动命令可到达扩大后的地图边缘', () => {
  const sim = fresh();
  const ally = sim.addUnit('mao', 'ally', { x: -48, z: -30 });
  sim.addUnit('mao', 'enemy', { x: 50, z: 30 }, { speed: 0, attack: 0 });
  sim.start(); sim.issueMove([ally.id], { x: -55, z: -30 });
  assert.ok(ally.order.x < -54);
  let furthest = ally.x;
  for (let i = 0; i < 150; i++) { sim.step(1 / 30); furthest = Math.min(furthest, ally.x); }
  assert.ok(furthest < -54);
});

test('基础移速降低，给移动微操保留反应时间', () => {
  const sim = fresh();
  const ally = sim.addUnit('mao', 'ally', { x: -25, z: 0 });
  sim.addUnit('mao', 'enemy', { x: 45, z: 30 }, { speed: 0, attack: 0 });
  sim.start(); sim.issueMove([ally.id], { x: -35, z: 0 }); advance(sim, 1);
  assert.ok(ally.x < -26.5 && ally.x > -28);
});

test('行军能绕过静止友军，不会持续卡在模型正面', () => {
  const sim = fresh();
  const mover = sim.addUnit('mao', 'ally', { x: -25, z: 0 });
  const blocker = sim.addUnit('mengqi', 'ally', { x: -22, z: 0 }, { speed: 0, attack: 0 });
  sim.addUnit('mao', 'enemy', { x: 50, z: 30 }, { speed: 0, attack: 0 });
  sim.start(); sim.issueMove([mover.id], { x: -18, z: 0 });
  let reached = false;
  for (let i = 0; i < 300; i++) {
    sim.step(1 / 30);
    assert.ok(Math.hypot(mover.x - blocker.x, mover.z - blocker.z) >= mover.radius + blocker.radius - .08);
    if (Math.hypot(mover.x + 18, mover.z) < .7) reached = true;
  }
  assert.ok(reached);
});
