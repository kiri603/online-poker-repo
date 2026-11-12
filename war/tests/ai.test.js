import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSimulation } from '../src/game/simulation.js';

const advance = (sim, seconds) => { for (let i=0;i<seconds*30;i++) sim.step(1/30); };
const scenario = (position={x:-50,z:30}) => {
  const sim=new BattleSimulation({enemyRoster:false,aiEnabled:true});
  const player=sim.addUnit('mao','ally',position);
  const enemy=sim.addUnit('mao','enemy',{x:30,z:0});
  sim.start(); return {sim,player,enemy};
};

test('人机在无敌军视野时主动侦察，玩家默认待命保持原地', () => {
  const {sim,player,enemy}=scenario(); advance(sim,2);
  assert.ok(enemy.x<28); assert.equal(enemy.order.kind,'advance'); assert.equal(enemy.mode,'auto');
  assert.equal(player.mode,'hold'); assert.equal(player.x,-50); assert.equal(player.z,30);
});

test('人机发现目标会接战，失去视野后恢复侦察而非停住', () => {
  const {sim,player,enemy}=scenario({x:22,z:0}); advance(sim,1);
  assert.equal(enemy.order.kind,'attack'); assert.equal(enemy.targetId,player.id);
  player.x=-50;player.z=30;sim.refreshVisibility();
  const x=enemy.x,z=enemy.z;advance(sim,2);
  assert.equal(enemy.targetId,null); assert.equal(enemy.order.kind,'advance');
  assert.ok(Math.hypot(enemy.x-x,enemy.z-z)>1);
});

test('未发现的玩家位置不影响人机侦察路线，PVP 不启用人机指挥', () => {
  const first=scenario({x:-50,z:30}), second=scenario({x:-50,z:-30});
  advance(first.sim,3); advance(second.sim,3);
  assert.equal(first.enemy.x,second.enemy.x); assert.equal(first.enemy.z,second.enemy.z);
  const pvp=new BattleSimulation({enemyRoster:false});
  pvp.addUnit('mao','ally',{x:-50,z:0});const enemy=pvp.addUnit('mao','enemy',{x:30,z:0});
  pvp.start();advance(pvp,2);assert.equal(enemy.mode,'hold');assert.equal(enemy.x,30);
});
