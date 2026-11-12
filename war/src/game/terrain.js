export const MAP = { minX: -64, maxX: 64, minZ: -42, maxZ: 42, cell: 1.1 };
export const DEPLOYMENT = { minX: -59, maxX: -16, minZ: -35, maxZ: 35 };
export const NAV_RADIUS = .52;
export const BRIDGE = { minX: -4.6, maxX: 6.2, minZ: 6.2, maxZ: 8.6, height: .42 };
export const FORESTS = [{ x: -8, z: 9, rx: 5, rz: 6 }, { x: 13, z: -9, rx: 6, rz: 5 }, { x: -33, z: -23, rx: 9, rz: 7 }, { x: 34, z: 24, rx: 10, rz: 7 }, { x: -19, z: 29, rx: 7, rz: 5 }, { x: 43, z: -25, rx: 7, rz: 7 }];
export const HILLS = [{ x: -9, z: -9, rx: 6.5, rz: 5.6, height: 3.1 }, { x: 17, z: 7, rx: 7.5, rz: 6.3, height: 3.9 }, { x: -26, z: 16, rx: 9, rz: 7, height: 3.4 }, { x: 30, z: -22, rx: 11, rz: 7, height: 4.8 }, { x: -43, z: -10, rx: 9, rz: 6, height: 2.8 }, { x: 8, z: 30, rx: 7, rz: 6, height: 3.3 }];
export const ROCKS = [{ x: -4.8, z: -2.4, radius: 1.05 }, { x: 7.5, z: 1.8, radius: 1.3 }, { x: 23, z: -12, radius: 1.2 }, { x: -20, z: -17, radius: 1.8 }, { x: -17, z: -19, radius: 1.3 }, { x: 25, z: 19, radius: 2.1 }, { x: 29, z: 18, radius: 1.5 }, { x: -42, z: 24, radius: 1.8 }, { x: 45, z: 5, radius: 2 }];
export const MARSHES = [{ x: -17, z: 21, rx: 6, rz: 4 }, { x: 11, z: -25, rx: 6, rz: 5 }, { x: 4, z: 18, rx: 3.5, rz: 5 }];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const riverCenter = z => 1 + Math.sin(z * .16) * 1.4;
export const riverHalfWidth = z => 2.05 + .18 * Math.cos(z * .3);
export const inBridge = (x, z) => x >= BRIDGE.minX && x <= BRIDGE.maxX && z >= BRIDGE.minZ && z <= BRIDGE.maxZ;
export const inDeployment = (x, z, margin = .35, team = 'ally') => {
  const sideX = team === 'enemy' ? -x : x;
  return sideX >= DEPLOYMENT.minX + margin && sideX <= DEPLOYMENT.maxX - margin && z >= DEPLOYMENT.minZ + margin && z <= DEPLOYMENT.maxZ - margin;
};
export const inMap = (x, z, margin = .5) => Number.isFinite(x) && Number.isFinite(z) && x >= MAP.minX + margin && x <= MAP.maxX - margin && z >= MAP.minZ + margin && z <= MAP.maxZ - margin;

export function heightAt(x, z) {
  let height = Math.sin(x * .15) * Math.cos(z * .12) * .12;
  for (const hill of HILLS) {
    const r = Math.hypot((x - hill.x) / hill.rx, (z - hill.z) / hill.rz);
    height += hill.height * (1 - smooth(.08, 1, r));
  }
  if (inBridge(x, z)) return Math.max(height, BRIDGE.height);
  const distance = Math.abs(x - riverCenter(z)), width = riverHalfWidth(z);
  if (distance < width + .7) {
    const depth = z >= -10 && z <= -6 ? .19 : .65;
    height = height * smooth(width - .3, width + .7, distance) - depth * (1 - smooth(width - .4, width + .7, distance));
  }
  return height;
}

export function forestAt(x, z) {
  return FORESTS.find(f => ((x - f.x) / f.rx) ** 2 + ((z - f.z) / f.rz) ** 2 < 1) || null;
}

export function terrainAt(x, z) {
  const height = heightAt(x, z);
  if (inBridge(x, z)) return { kind: 'bridge', name: '桥梁', height, speed: 1, cover: 1 };
  if (Math.abs(x - riverCenter(z)) < riverHalfWidth(z)) {
    const ford = z >= -10 && z <= -6;
    return { kind: ford ? 'ford' : 'river', name: ford ? '浅滩' : '河流', height, speed: ford ? .72 : .43, cover: 1 };
  }
  if (forestAt(x, z)) return { kind: 'forest', name: '树林', height, speed: .78, cover: .65 };
  if (MARSHES.some(f => ((x - f.x) / f.rx) ** 2 + ((z - f.z) / f.rz) ** 2 < 1)) return { kind: 'mud', name: '泥地', height, speed: .52, cover: 1 };
  if (Math.abs(x) < 55 && (Math.abs(z - 7.4) < 1 || Math.abs(z + 8) < .8) && height < .9) return { kind: 'road', name: '道路', height, speed: 1.15, cover: 1 };
  return { kind: height > .9 ? 'highland' : 'plain', name: height > .9 ? '高地' : '平地', height, speed: 1, cover: 1 };
}

let seed = 93187;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
export const TREES = [];
for (const forest of FORESTS) {
  let attempts = 0, count = 0;
  while (count < 24 && attempts++ < 300) {
    const x = forest.x + (random() * 2 - 1) * forest.rx, z = forest.z + (random() * 2 - 1) * forest.rz;
    if (!forestAt(x, z) || Math.abs(x - riverCenter(z)) < riverHalfWidth(z) + 1.2 || inBridge(x, z)) continue;
    if (TREES.some(t => Math.hypot(t.x - x, t.z - z) < 2.1)) continue;
    TREES.push({ x, z, height: 3.8 + random() * 2, scale: .8 + random() * .5, rotation: random() * 6.28 });
    count++;
  }
}

const obstacleBuckets = new Map();
for (const obstacle of [...ROCKS.map(r => ({ ...r, clearance: r.radius + NAV_RADIUS + .08 })), ...TREES.map(t => ({ ...t, clearance: .22 * t.scale + NAV_RADIUS + .06 }))]) {
  for (let x = Math.floor((obstacle.x - obstacle.clearance) / 4); x <= Math.floor((obstacle.x + obstacle.clearance) / 4); x++) {
    for (let z = Math.floor((obstacle.z - obstacle.clearance) / 4); z <= Math.floor((obstacle.z + obstacle.clearance) / 4); z++) {
      const key = `${x},${z}`;
      if (!obstacleBuckets.has(key)) obstacleBuckets.set(key, []);
      obstacleBuckets.get(key).push(obstacle);
    }
  }
}
export function isWalkable(x, z) {
  return inMap(x, z, NAV_RADIUS + .08) && !(obstacleBuckets.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`) || []).some(r => (x - r.x) ** 2 + (z - r.z) ** 2 < r.clearance ** 2);
}

export function canTraverse(a, b) {
  if (!isWalkable(a.x, a.z)) return false;
  const distance = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(distance / .22));
  let previous = heightAt(a.x, a.z);
  for (let i = 1; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps, y = heightAt(x, z);
    if (!isWalkable(x, z) || Math.abs(y - previous) > .85) return false;
    previous = y;
  }
  return true;
}

const COLS = Math.floor((MAP.maxX - MAP.minX) / MAP.cell), ROWS = Math.floor((MAP.maxZ - MAP.minZ) / MAP.cell);
const cells = Array.from({ length: COLS * ROWS }, (_, id) => {
  const x = MAP.minX + (id % COLS + .5) * MAP.cell, z = MAP.minZ + (Math.floor(id / COLS) + .5) * MAP.cell;
  return { x, z, ...terrainAt(x, z), walkable: isWalkable(x, z) };
});

export function nearestWalkable(point) {
  if (isWalkable(point.x, point.z)) return { x: point.x, z: point.z };
  let best = null, distance = Infinity;
  for (const cell of cells) {
    if (!cell.walkable) continue;
    const d = (cell.x - point.x) ** 2 + (cell.z - point.z) ** 2;
    if (d < distance) { distance = d; best = cell; }
  }
  return best ? { x: best.x, z: best.z } : null;
}

function cellId(point) {
  const x = clamp(Math.floor((point.x - MAP.minX) / MAP.cell), 0, COLS - 1), z = clamp(Math.floor((point.z - MAP.minZ) / MAP.cell), 0, ROWS - 1);
  let id = z * COLS + x;
  if (cells[id].walkable && canTraverse(point, cells[id])) return id;
  let distance = Infinity;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].walkable) continue;
    const d = (cells[i].x - point.x) ** 2 + (cells[i].z - point.z) ** 2;
    if (d < distance && canTraverse(point, cells[i])) { distance = d; id = i; }
  }
  return Number.isFinite(distance) ? id : -1;
}

// Cache static edge clearance. A walkable cell centre alone does not guarantee a safe segment.
const connections = new Map();
function neighbors(id) {
  if (connections.has(id)) return connections.get(id);
  const result = [], cx = id % COLS, cz = Math.floor(id / COLS), current = cells[id];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dz) || cx + dx < 0 || cx + dx >= COLS || cz + dz < 0 || cz + dz >= ROWS) continue;
    const next = (cz + dz) * COLS + cx + dx, cell = cells[next];
    if (!cell.walkable || !canTraverse(current, cell)) continue;
    const cost = (dx && dz ? Math.SQRT2 : 1) / cell.speed + Math.max(0, cell.height - current.height) * .35;
    result.push({ id: next, cost });
  }
  connections.set(id, result); return result;
}

class MinHeap {
  items = [];
  push(value) { const a = this.items; let i = a.length; a.push(value); while (i > 0) { const p = (i - 1) >> 1; if (a[p].score <= value.score) break; a[i] = a[p]; i = p; } a[i] = value; }
  pop() {
    const a = this.items, first = a[0], last = a.pop();
    if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1].score < a[c].score) c++; if (a[c].score >= last.score) break; a[i] = a[c]; i = c; } a[i] = last; }
    return first;
  }
}

export function findPath(from, requested) {
  if (!inMap(from.x, from.z, 0) || !inMap(requested.x, requested.z, 0)) return [];
  const origin = nearestWalkable(from), destination = nearestWalkable(requested);
  if (!origin || !destination) return [];
  if (Math.hypot(from.x - destination.x, from.z - destination.z) < 2 && canTraverse(from, destination)) return [destination];
  const start = cellId(origin), goal = cellId(destination), heap = new MinHeap();
  if (start < 0 || goal < 0) return [];
  const costs = new Float64Array(cells.length).fill(Infinity), parent = new Int32Array(cells.length).fill(-1), closed = new Uint8Array(cells.length);
  costs[start] = 0; heap.push({ id: start, score: 0 });
  while (heap.items.length) {
    const { id } = heap.pop();
    if (closed[id]) continue;
    if (id === goal) {
      const ids = []; let current = goal;
      while (current !== start && current !== -1) { ids.push(current); current = parent[current]; }
      ids.reverse();
      const path = [start, ...ids].map(i => ({ x: cells[i].x, z: cells[i].z }));
      if (!path.length || canTraverse(path.at(-1), destination)) path.push(destination);
      if (path[1] && canTraverse(from, path[1])) path.shift();
      return path;
    }
    closed[id] = 1;
    for (const { id: next, cost } of neighbors(id)) {
      if (closed[next]) continue;
      const cell = cells[next], score = costs[id] + cost;
      if (score >= costs[next]) continue;
      parent[next] = id; costs[next] = score;
      heap.push({ id: next, score: score + Math.hypot(cell.x - cells[goal].x, cell.z - cells[goal].z) / (MAP.cell * 1.15) });
    }
  }
  return [];
}

export function formationPoints(count, center, formation = 'grid', spacing = 1.35, angle = 0) {
  const columns = formation === 'line' ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns), points = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns), col = i % columns;
    let x = (col - (Math.min(columns, count - row * columns) - 1) / 2) * spacing, z = (row - (rows - 1) / 2) * spacing;
    if (formation === 'wedge') { const rank = Math.ceil(i / 2); x = i ? (i % 2 ? -1 : 1) * rank * spacing * .65 : 0; z = rank * spacing * .6; }
    points.push({ x: center.x + x * Math.cos(angle) - z * Math.sin(angle), z: center.z + x * Math.sin(angle) + z * Math.cos(angle) });
  }
  return points;
}
