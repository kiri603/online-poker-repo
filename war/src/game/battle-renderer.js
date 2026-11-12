import * as THREE from 'three';
import { UNIT_ORDER } from './units.js';
import { heightAt, formationPoints, MAP } from './terrain.js';
import { createBattlefield } from './battlefield-art.js';
import { getBattleGeometry } from './battle-geometry.js';
import { sightRange } from './visibility.js';

const ALLY = '#247f71', ENEMY = '#b04d37';
const HEIGHTS = { mao: 1.25, jiahao: 1.85, mengqi: 1.9, kun: 1.7, nailong: 2.1, naiwa: 1.65 };
const dummy = new THREE.Object3D(), point = new THREE.Vector3();

function ribbon(points, width, color, arrow = false) {
  const samples = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .4));
    for (let j = 0; j < steps; j++) samples.push({ x: a.x + (b.x - a.x) * j / steps, z: a.z + (b.z - a.z) * j / steps });
  }
  samples.push(points.at(-1));
  const positions = [], indices = [];
  samples.forEach((p, i) => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / length * width / 2, nz = (b.x - a.x) / length * width / 2;
    for (const side of [-1, 1]) positions.push(p.x + nx * side, heightAt(p.x + nx * side, p.z + nz * side) + .09, p.z + nz * side);
    if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  if (arrow && points.length > 1) {
    const a = points.at(-2), b = points.at(-1), length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, size = Math.min(2.1, length * .3), start = positions.length / 3;
    for (const [x, z] of [[b.x, b.z], [b.x - dx * size - dz * size * .5, b.z - dz * size + dx * size * .5], [b.x - dx * size + dz * size * .5, b.z - dz * size - dx * size * .5]]) positions.push(x, heightAt(x, z) + .12, z);
    indices.push(start, start + 1, start + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .85, depthWrite: false }));
  mesh.renderOrder = 4; return mesh;
}

function clearGroup(group) {
  for (const child of [...group.children]) { child.geometry?.dispose(); child.material?.dispose(); group.remove(child); }
}

export function createBattleRenderer(renderer, environment) {
  const canvas = renderer.domElement, scene = new THREE.Scene();
  scene.background = new THREE.Color('#aebda8'); scene.fog = new THREE.Fog('#aebda8', 180, 330);
  scene.environment = environment; scene.environmentIntensity = .32;
  scene.add(new THREE.HemisphereLight('#e5efdd', '#566c58', 1.25));
  const sun = new THREE.DirectionalLight('#ffe9c8', 2.7); sun.position.set(-40, 80, 36); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 64, bottom: -64, near: 1, far: 200 });
  sun.shadow.normalBias = .045; sun.shadow.bias = -.00015; scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1, .15, 440), target = new THREE.Vector3(-29, 0, -2);
  let azimuth = .08, elevation = 1.0, distance = 60, width = 1, height = 1, clock = 0, side = 'west';
  const vision = { width: 64, height: 42, data: new Uint8Array(64 * 42) };
  const visionTexture = new THREE.DataTexture(vision.data, vision.width, vision.height, THREE.RedFormat);
  visionTexture.minFilter = visionTexture.magFilter = THREE.LinearFilter;
  const map = createBattlefield(scene, visionTexture), raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let visionSim = null, visionAt = -1, shake = 0, motion = !matchMedia('(prefers-reduced-motion: reduce)').matches, resultAge = 0;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65, metalness: .035 });
  const armies = [], scales = {};
  for (const kind of UNIT_ORDER) {
    const geometry = getBattleGeometry(kind);
    geometry.computeBoundingBox(); scales[kind] = HEIGHTS[kind] / geometry.boundingBox.max.y;
    for (const team of ['ally', 'enemy']) {
      const mesh = new THREE.InstancedMesh(geometry, material, 100); mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.userData = { kind, team, units: [] }; scene.add(mesh); armies.push(mesh);
    }
  }
  const ringGeometry = new THREE.RingGeometry(.87, 1, 24); ringGeometry.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }), 200);
  rings.frustumCulled = false; scene.add(rings);
  const selectedRings = new THREE.InstancedMesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#f6ffe9', depthWrite: false, side: THREE.DoubleSide }), 100);
  selectedRings.frustumCulled = false; scene.add(selectedRings);
  const ghostMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: .38, depthWrite: false, roughness: .7 });
  const ghosts = new THREE.InstancedMesh(getBattleGeometry('mao'), ghostMaterial, 100); ghosts.count = 0; ghosts.frustumCulled = false; scene.add(ghosts);
  const ghostRings = new THREE.InstancedMesh(ringGeometry, new THREE.MeshBasicMaterial({ color: ALLY, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }), 100);
  ghostRings.count = 0; ghostRings.frustumCulled = false; scene.add(ghostRings);
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.17, 10, 8), new THREE.MeshStandardMaterial({ color: '#ce652d', roughness: .7 }), 200);
  balls.frustumCulled = false; balls.count = 0; scene.add(balls);
  const plansRoot = new THREE.Group(), draftRoot = new THREE.Group(); scene.add(plansRoot, draftRoot);
  const effects = [], particles = [], color = new THREE.Color(); let planSignature = '';
  const sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.065, 0), new THREE.MeshBasicMaterial(), 320);
  sparks.count = 0; sparks.frustumCulled = false; scene.add(sparks);
  const visionRing = new THREE.Mesh(new THREE.RingGeometry(.991, 1, 100), new THREE.MeshBasicMaterial({ color: '#d2e8bf', transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide }));
  visionRing.rotation.x = -Math.PI / 2; visionRing.visible = false; scene.add(visionRing);

  function syncCamera() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w !== width || h !== height) { width = w; height = h; camera.aspect = w / h; camera.updateProjectionMatrix(); }
    target.y = Math.max(0, heightAt(target.x, target.z)) + .4;
    camera.position.set(target.x + Math.sin(azimuth) * Math.cos(elevation) * distance, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 1.1);
    if (motion && shake > .001) camera.position.x += Math.sin(clock * 78) * shake;
    camera.lookAt(target); camera.updateMatrixWorld();
  }
  function project(x, z, y = heightAt(x, z)) {
    point.set(x, y, z).project(camera);
    return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1 };
  }
  function setRay(x, y) {
    const rect = canvas.getBoundingClientRect(); ndc.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(ndc, camera);
  }
  function groundAt(x, y) {
    setRay(x, y); const hit = raycaster.intersectObject(map.groundMesh, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
  function pickUnit(x, y, sim, team = null) {
    // Screen-space picking avoids ray-testing thousands of model triangles per pointer move.
    let result = null, best = Infinity;
    for (const unit of sim.units) {
      if (unit.hp <= 0 || team && unit.team !== team || !sim.isVisible(unit)) continue;
      const foot = project(unit.x, unit.z), head = project(unit.x, unit.z, heightAt(unit.x, unit.z) + HEIGHTS[unit.kind]);
      if (!foot.visible) continue;
      const radius = Math.max(8, Math.hypot(foot.x - head.x, foot.y - head.y) * .35);
      const cx = (foot.x + head.x) / 2, cy = (foot.y + head.y) / 2;
      const score = Math.hypot(x - cx, y - cy) / radius;
      if (score < 1.45 && score < best) { best = score; result = unit; }
    }
    return result;
  }
  function preview(kind, center, count, formation, angle, valid) {
    ghosts.count = ghostRings.count = kind && center ? count : 0;
    if (!kind || !center) return;
    ghosts.geometry = getBattleGeometry(kind); ghostRings.material.color.set(valid ? ALLY : ENEMY);
    formationPoints(count, center, formation, 1.35, angle).forEach((p, i) => {
      dummy.position.set(p.x, heightAt(p.x, p.z) + .015, p.z); dummy.rotation.set(0, Math.PI / 2 + angle, 0); dummy.scale.setScalar(scales[kind]); dummy.updateMatrix(); ghosts.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.57); dummy.updateMatrix(); ghostRings.setMatrixAt(i, dummy.matrix);
    }); ghosts.instanceMatrix.needsUpdate = ghostRings.instanceMatrix.needsUpdate = true;
  }
  function draft(points, arrow = false) { clearGroup(draftRoot); if (points.length > 1) draftRoot.add(ribbon(points, arrow ? .24 : .13, '#f4ffe4', arrow)); }
  function mark(p, attack = false) { effects.push({ kind: attack ? 'target' : 'move', x: p.x, z: p.z, age: 0, duration: .85, radius: attack ? .8 : 1 }); }
  function updatePlans(sim, selectedPlan) {
    const signature = JSON.stringify(sim.plans.map(p => [p.id, p.line, p.target, p.executing, p.id === selectedPlan, p.unitIds.filter(id => sim.getUnit(id)?.order.planId === p.id && sim.getUnit(id)?.hp > 0).length]));
    if (signature === planSignature) return; planSignature = signature; clearGroup(plansRoot);
    for (const plan of sim.plans) {
      const members = plan.unitIds.filter(id => sim.getUnit(id)?.order.planId === plan.id && sim.getUnit(id)?.hp > 0);
      if (!members.length) continue;
      const tint = plan.id === selectedPlan ? '#ecf8c8' : '#398572';
      plansRoot.add(ribbon(plan.line, .18, tint));
      if (plan.target) plansRoot.add(ribbon([plan.center, plan.target], plan.executing ? .38 : .24, tint, true));
    }
  }
  const effectPool = Array.from({ length: 48 }, () => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.83, 1, 32), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; scene.add(mesh); return mesh;
  });
  function update(sim, selection, selectedPlan, dt, events = []) {
    clock += dt; syncCamera(); map.setPreparation(sim.phase === 'preparation'); map.update(clock);
    resultAge = ['victory', 'defeat'].includes(sim.phase) ? resultAge + dt : 0;
    shake *= Math.exp(-dt * 13);
    const visionNow = sim.phase === 'preparation' ? clock : sim.time;
    if (visionSim !== sim || visionNow < visionAt || visionNow - visionAt >= .15) {
      if (sim.visionMask) vision.data.set(sim.visionMask);
      else for (let row = 0; row < vision.height; row++) for (let col = 0; col < vision.width; col++) {
        const p = { x: MAP.minX + (col + .5) / vision.width * (MAP.maxX - MAP.minX), z: MAP.minZ + (row + .5) / vision.height * (MAP.maxZ - MAP.minZ) };
        vision.data[row * vision.width + col] = sim.isPointVisible(p) ? 255 : 0;
      }
      visionTexture.needsUpdate = true; visionSim = sim; visionAt = visionNow;
    }
    let ringCount = 0, selectionCount = 0;
    for (const mesh of armies) {
      const { kind, team } = mesh.userData;
      const units = sim.units.filter(u => u.kind === kind && u.team === team && sim.isVisible(u) && (u.hp > 0 || sim.time - u.diedAt + resultAge < .8)); mesh.userData.units = units; mesh.count = units.length;
      units.forEach((unit, i) => {
        const dead = unit.hp <= 0, death = dead ? Math.min(1, (sim.time - unit.diedAt + resultAge) / .8) : 0;
        const moving = unit.path.length > 0 && sim.phase === 'battle' && !sim.paused;
        const bob = moving ? Math.abs(Math.sin(sim.time * 14 + unit.id)) * .055 : 0;
        const attack = Math.max(0, 1 - (sim.time - unit.lastAttack) / .22);
        const hit = Math.max(0, 1 - (sim.time - unit.lastDamage) / .18);
        dummy.position.set(unit.x + (unit.hitX || 0) * hit * .13, heightAt(unit.x, unit.z) + bob - death * .55, unit.z + (unit.hitZ || 0) * hit * .13);
        dummy.rotation.set(Math.sin(sim.time * 14 + unit.id) * (moving ? .055 : 0) + attack * .16, unit.yaw, death * 1.4);
        dummy.scale.setScalar(scales[kind] * (1 - death * .5)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setRGB(1 + hit * 1.5, 1 + hit * 1.3, 1 + hit));
        if (dead) return;
        dummy.position.set(unit.x, heightAt(unit.x, unit.z) + .035, unit.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(unit.radius + .13); dummy.updateMatrix();
        rings.setMatrixAt(ringCount, dummy.matrix); rings.setColorAt(ringCount++, color.set(team === 'ally' ? ALLY : ENEMY));
        if (selection.has(unit.id)) { dummy.scale.setScalar(unit.radius + .25); dummy.updateMatrix(); selectedRings.setMatrixAt(selectionCount++, dummy.matrix); }
      }); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    rings.count = ringCount; selectedRings.count = selectionCount; rings.instanceMatrix.needsUpdate = selectedRings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    const visibleProjectiles = sim.projectiles.filter(p => p.team === 'ally' || sim.isPointVisible({ x: THREE.MathUtils.lerp(p.fromX, p.x, p.time / p.duration), z: THREE.MathUtils.lerp(p.fromZ, p.z, p.time / p.duration) })).slice(0, 200);
    visibleProjectiles.forEach((p, i) => {
      const t = p.time / p.duration, x = THREE.MathUtils.lerp(p.fromX, p.x, t), z = THREE.MathUtils.lerp(p.fromZ, p.z, t);
      const y = THREE.MathUtils.lerp(heightAt(p.fromX, p.fromZ) + 1.35, heightAt(p.x, p.z) + .7, t) + Math.sin(t * Math.PI) * 2.4;
      dummy.position.set(x, y, z); dummy.rotation.set(t * 9, t * 12, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); balls.setMatrixAt(i, dummy.matrix);
    }); balls.count = visibleProjectiles.length; balls.instanceMatrix.needsUpdate = true;
    for (const event of events) {
      if (['hit', 'death', 'stomp', 'inspire', 'wave', 'impact', 'hiss'].includes(event.kind)) effects.push({ ...event, age: 0, duration: event.kind === 'inspire' ? .8 : .4 });
      if (['hit', 'death', 'stomp', 'impact'].includes(event.kind)) {
        const count = event.kind === 'stomp' ? 16 : event.kind === 'death' ? 10 : 5;
        for (let i = 0; i < count; i++) {
          const a = i * 2.399 + event.x, speed = event.kind === 'stomp' ? 4 : 1.8;
          particles.push({ x: event.x, z: event.z, y: heightAt(event.x, event.z) + (event.kind === 'stomp' ? .15 : .85), vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 1.8 + i % 3 * .6, age: 0, duration: .4 + i % 4 * .06, tint: event.shieldDamage > 0 ? '#a8ebff' : event.kind === 'death' ? '#8c7661' : '#ffe3a0' });
        }
      }
      if (event.kind === 'stomp' && project(event.x, event.z).visible) shake = .12;
    }
    if (effects.length > 48) effects.splice(0, effects.length - 48);
    for (let i = effects.length - 1; i >= 0; i--) { effects[i].age += dt; if (effects[i].age > effects[i].duration) effects.splice(i, 1); }
    effectPool.forEach((mesh, i) => {
      const effect = effects[i]; mesh.visible = !!effect && (['move', 'target'].includes(effect.kind) || sim.isPointVisible(effect)); if (!mesh.visible) return;
      const t = effect.age / effect.duration, r = (effect.radius || .65) * (.3 + .7 * t);
      let x = effect.x, z = effect.z;
      if (effect.kind === 'wave') { x = THREE.MathUtils.lerp(x, effect.tx, t); z = THREE.MathUtils.lerp(z, effect.tz, t); }
      mesh.position.set(x, heightAt(x, z) + .12, z); mesh.scale.setScalar(r); mesh.material.opacity = (1 - t) * .7;
      mesh.material.color.set(effect.shieldDamage > 0 ? '#a8ebff' : effect.kind === 'inspire' ? '#dded9b' : effect.kind === 'target' || effect.team === 'enemy' ? '#ba5038' : '#f4e6b0');
    });
    if (particles.length > 320) particles.splice(0, particles.length - 320);
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].age += dt; if (particles[i].age > particles[i].duration) particles.splice(i, 1); }
    particles.forEach((p, i) => {
      const t = p.age;
      dummy.position.set(p.x + p.vx * t, p.y + p.vy * t - 5 * t * t, p.z + p.vz * t); dummy.rotation.set(t * 4, t * 8, 0); dummy.scale.setScalar(sim.isPointVisible(p) ? (1 - t / p.duration) * 1.5 : 0); dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix); sparks.setColorAt(i, color.set(p.tint));
    });
    sparks.count = particles.length; sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    const selected = selection.size === 1 ? sim.getUnit([...selection][0]) : null;
    visionRing.visible = !!selected && selected.hp > 0;
    if (visionRing.visible) { visionRing.position.set(selected.x, heightAt(selected.x, selected.z) + .04, selected.z); visionRing.scale.setScalar(sightRange(selected)); }
    updatePlans(sim, selectedPlan);
    renderer.render(scene, camera);
  }
  function pan(dx, dz, dt = 1) {
    target.x = THREE.MathUtils.clamp(target.x + (Math.cos(azimuth) * dx + Math.sin(azimuth) * dz) * dt, MAP.minX + 3, MAP.maxX - 3);
    target.z = THREE.MathUtils.clamp(target.z + (-Math.sin(azimuth) * dx + Math.cos(azimuth) * dz) * dt, MAP.minZ + 2, MAP.maxZ - 2);
  }
  function resetCamera() { target.set(side === 'east' ? 29 : -29, 0, -2); distance = width < 700 ? 100 : 86; azimuth = .08; elevation = 1.0; syncCamera(); }
  syncCamera();
  return {
    scene, camera, update, project, groundAt, pickUnit, preview, draft, mark, pan, resetCamera,
    setSide(value) { side = value; map.setSide(value); },
    visionMask: () => vision,
    resetEffects() { effects.length = 0; particles.length = 0; shake = 0; visionSim = null; },
    setMotion(value) { motion = value; },
    orbit(dx, dy) { azimuth -= dx * .005; elevation = THREE.MathUtils.clamp(elevation + dy * .004, .23, 1.45); syncCamera(); },
    rotate(radians) { azimuth += radians; },
    zoom(delta) { distance = THREE.MathUtils.clamp(distance * Math.exp(delta * .001), 12, 185); syncCamera(); },
    focus(p) { target.set(p.x, 0, p.z); syncCamera(); },
    setQuality(high) { sun.castShadow = high; },
    inspect() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, distance, elevation, azimuth, renderedEnemies: armies.filter(m => m.userData.team === 'enemy').reduce((n, m) => n + m.count, 0), effects: effects.length, particles: particles.length, groundClearance: camera.position.y - heightAt(camera.position.x, camera.position.z), target: { x: target.x, z: target.z } }; },
    thumbnails() {
      const thumbScene = new THREE.Scene(); thumbScene.background = new THREE.Color('#dce4d6'); thumbScene.environment = environment;
      thumbScene.add(new THREE.HemisphereLight('#fff9e1', '#71887c', 2));
      const light = new THREE.DirectionalLight('#ffe0b8', 3); light.position.set(-3, 5, 6); thumbScene.add(light);
      const thumbCamera = new THREE.PerspectiveCamera(30, 1, .1, 20), renderTarget = new THREE.WebGLRenderTarget(144, 144);
      const pixels = new Uint8Array(144 * 144 * 4), c = document.createElement('canvas'); c.width = c.height = 144;
      const ctx = c.getContext('2d'), data = ctx.createImageData(144, 144), result = {};
      const priorTarget = renderer.getRenderTarget();
      for (const kind of UNIT_ORDER) {
        const mesh = new THREE.Mesh(getBattleGeometry(kind), material); mesh.scale.setScalar(scales[kind]); mesh.rotation.y = -.26; thumbScene.add(mesh);
        const h = HEIGHTS[kind]; thumbCamera.position.set(.25, h * .75, h * 2.7); thumbCamera.lookAt(0, h * .52, 0);
        renderer.setRenderTarget(renderTarget); renderer.render(thumbScene, thumbCamera); renderer.readRenderTargetPixels(renderTarget, 0, 0, 144, 144, pixels);
        for (let y = 0; y < 144; y++) data.data.set(pixels.subarray((143 - y) * 576, (144 - y) * 576), y * 576);
        ctx.putImageData(data, 0, 0); result[kind] = c.toDataURL(); thumbScene.remove(mesh);
      }
      renderer.setRenderTarget(priorTarget); renderTarget.dispose(); return result;
    }
  };
}
