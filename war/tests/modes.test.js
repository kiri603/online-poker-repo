import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSimulation } from '../src/game/simulation.js';

const fresh = () => new BattleSimulation({ enemyRoster: false });
const advance = (sim, seconds) => { for (let i = 0; i < seconds * 30; i++) sim.step(1 / 30); };

test('默认待命不追敌，但会攻击射程内目标', () => {
  const sim = fresh(), ally = sim.addUnit('kun', 'ally', { x: -25, z: 0 });
  const enemy = sim.addUnit('mao', 'enemy', { x: -13, z: 0 });
  sim.start(); advance(sim, 2);
  assert.equal(ally.mode, 'hold'); assert.equal(ally.x, -25); assert.equal(enemy.hp, enemy.maxHp);
  enemy.x = -20; sim.refreshVisibility(); advance(sim, 1);
  assert.ok(enemy.hp < enemy.maxHp); assert.equal(ally.x, -25);
});

test('自动战斗追击队友发现的目标，无共享视野时停止', () => {
  const sim = fresh(), fighter = sim.addUnit('mao', 'ally', { x: -40, z: 0 });
  const scout = sim.addUnit('mao', 'ally', { x: -13, z: 0 });
  sim.addUnit('mao', 'enemy', { x: -10, z: 0 });
  sim.setMode([fighter.id], 'auto'); sim.start(); advance(sim, 1);
  assert.ok(fighter.x > -39); assert.ok(fighter.targetId);
  scout.hp = 0; sim.refreshVisibility(); const x = fighter.x, z = fighter.z;
  advance(sim, 1); assert.equal(fighter.x, x); assert.equal(fighter.z, z); assert.equal(fighter.targetId, null);
});

test('切换待命立即停止追击，手动移动结束后保留模式', () => {
  const sim = fresh(), ally = sim.addUnit('mao', 'ally', { x: -25, z: 0 });
  sim.addUnit('mao', 'enemy', { x: -17, z: 0 });
  sim.start(); sim.setMode([ally.id], 'auto'); advance(sim, .5);
  sim.setMode([ally.id], 'hold'); const x = ally.x, z = ally.z; advance(sim, 1);
  assert.equal(ally.x, x); assert.equal(ally.z, z);
  sim.issueMove([ally.id], { x: -30, z: 0 }); advance(sim, 5);
  assert.equal(ally.mode, 'hold'); assert.equal(ally.order.kind, 'idle'); assert.ok(ally.x < -29);
});

test('两方可独立部署和控制，预算、撤销与模式互不干扰', () => {
  const sim = fresh();
  const west = sim.deploy('mao', { x: -30, z: 0 }, 1);
  const east = sim.deploy('kun', { x: 30, z: 0 }, 1, 'grid', 0, 'enemy');
  assert.ok(west.ok && east.ok);
  assert.equal(sim.budget, 4140); assert.equal(sim.budgets.enemy, 4080);
  assert.equal(sim.setMode(west.ids, 'auto', 'enemy'), 0);
  assert.equal(sim.setMode(east.ids, 'auto', 'enemy'), 1);
  assert.equal(sim.getUnit(west.ids[0]).mode, 'hold');
  assert.equal(sim.issueMove(east.ids, { x: 29, z: 6 }, 'grid', 'enemy'), 1);
  sim.undo('enemy'); assert.equal(sim.budgets.enemy, 4200); assert.equal(sim.units.length, 1);
});
