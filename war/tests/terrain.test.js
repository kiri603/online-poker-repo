import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainAt, heightAt, riverCenter, BRIDGE, TREES, ROCKS, MAP, isWalkable, canTraverse, findPath, inDeployment, formationPoints } from '../src/game/terrain.js';

test('高地具有真实高度，河流、浅滩、树林影响移动和掩护', () => {
  assert.ok(heightAt(-9, -9) > heightAt(-23, 0) + 2);
  const river = terrainAt(riverCenter(0), 0), ford = terrainAt(riverCenter(-8), -8);
  assert.equal(river.kind, 'river');
  assert.equal(ford.kind, 'ford');
  assert.ok(river.speed < ford.speed && ford.speed < 1);
  const forest = terrainAt(-8, 9);
  assert.equal(forest.kind, 'forest');
  assert.ok(forest.cover < 1 && forest.speed < 1);
});

test('桥面高于水面，过桥不会受到涉水减速', () => {
  const t = terrainAt(1, (BRIDGE.minZ + BRIDGE.maxZ) / 2);
  assert.equal(t.kind, 'bridge');
  assert.equal(t.speed, 1);
  assert.ok(t.height > 0);
});

test('布阵区域边界与整批阵型位置明确', () => {
  assert.ok(inDeployment(-22, 0));
  assert.ok(!inDeployment(-8, 0));
  const points = formationPoints(10, { x: -23, z: 0 }, 'grid', 1.5, Math.PI / 2);
  assert.equal(points.length, 10);
  assert.equal(new Set(points.map(p => `${p.x},${p.z}`)).size, 10);
  assert.ok(points.every(p => inDeployment(p.x, p.z)));
});

test('导航避开岩石和树干，并可以穿过河流抵达对岸', () => {
  assert.ok(TREES.length > 20 && ROCKS.length > 0);
  assert.ok(!isWalkable(ROCKS[0].x, ROCKS[0].z));
  const path = findPath({ x: -22, z: 0 }, { x: 22, z: 0 });
  assert.ok(path.length > 3);
  assert.ok(path.every(p => isWalkable(p.x, p.z)));
  assert.ok(Math.hypot(path.at(-1).x - 22, path.at(-1).z) < 1.5);
});

test('大战场面积扩大四倍，远端仍可导航', () => {
  assert.ok((MAP.maxX - MAP.minX) * (MAP.maxZ - MAP.minZ) >= 64 * 42 * 4);
  const path = findPath({ x: -52, z: -30 }, { x: 52, z: 30 });
  assert.ok(path.length > 0);
  assert.ok(Math.hypot(path.at(-1).x - 52, path.at(-1).z - 30) < 1);
});

test('导航的每一段都能通过，包括起点接入与树石边缘', () => {
  const routes = [
    [{ x: -22, z: 0 }, { x: 22, z: 0 }],
    [{ x: -13, z: 8 }, { x: -3, z: 11 }],
    [{ x: 5, z: 1.8 }, { x: 10, z: 1.8 }],
  ];
  for (const [start, goal] of routes) {
    const path = findPath(start, goal);
    assert.ok(path.length > 0);
    let previous = start;
    for (const p of path) {
      assert.ok(canTraverse(previous, p), `blocked segment ${JSON.stringify([previous, p])}`);
      previous = p;
    }
  }
});

test('泥地减速、道路加速，影响路线选择', () => {
  assert.equal(terrainAt(-17, 21).kind, 'mud');
  assert.ok(terrainAt(-17, 21).speed < terrainAt(-25, 0).speed);
  assert.equal(terrainAt(-25, 7.4).kind, 'road');
  assert.ok(terrainAt(-25, 7.4).speed > 1);
});
