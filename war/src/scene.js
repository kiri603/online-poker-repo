import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCharacter, getCharacterGeometry } from './characters.js';

const INK = '#293b40';
const KINDS = ['mao', 'jiahao', 'mengqi', 'kun', 'nailong', 'naiwa'];
const HOME_POSITIONS = [
  [0.1, 0, 4.7, .08, 1.18], [0.2, 0, .3, -.10, .99],
  [3.4, 0, 2.5, -.18, 1.04], [6.6, 0, 3.8, -.23, 1.06],
  [8.8, 0, 1, -.35, 1.08], [5.4, 0, -1.5, -.28, 1.04]
];

function mergeGeometries(geometries) {
  const pieces = geometries.map(g => g.index ? g.toNonIndexed() : g);
  const count = pieces.reduce((n, g) => n + g.attributes.position.count, 0);
  const result = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const array = new Float32Array(count * 3);
    let offset = 0;
    for (const geometry of pieces) {
      const attribute = geometry.attributes[name];
      array.set(attribute.array, offset);
      offset += attribute.array.length;
    }
    result.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  result.computeBoundingSphere();
  return result;
}

function paint(geometry, color) {
  const c = new THREE.Color(color), count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function archGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-1.8, 0); s.lineTo(1.8, 0); s.lineTo(1.8, 6.7); s.lineTo(-1.8, 6.7); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-1.08, 0); hole.lineTo(-1.08, 3.65);
  hole.absarc(0, 3.65, 1.08, Math.PI, 0, true); hole.lineTo(1.08, 0); hole.closePath();
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelThickness: .04, bevelSize: .05, bevelSegments: 1, curveSegments: 20 });
}

function makeArchitecture(scene) {
  const pieces = [];
  function add(g, color, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    pieces.push(paint(g, color).applyMatrix4(matrix));
  }
  const box = (x, y, z, color, p, r) => add(new THREE.BoxGeometry(x, y, z), color, p, [1, 1, 1], r);
  const orb = (color, p, s) => add(new THREE.SphereGeometry(1, 32, 20), color, p, s);

  add(new THREE.CylinderGeometry(14.2, 14.6, .5, 96), '#a4adad', [3, -.38, 0]);
  add(new THREE.CylinderGeometry(13.9, 13.9, .10, 96), '#b8c1bc', [3, -.08, 0]);
  add(new THREE.TorusGeometry(12.7, .033, 4, 128), '#8d9c99', [3, -.015, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  const arch = archGeometry();
  for (let i = 0; i < 15; i++) {
    const angle = -.95 + i * .14;
    const x = 3 + Math.sin(angle) * 23.2, z = -Math.cos(angle) * 23.2;
    add(arch.clone(), ['#9ba9a8', '#a4b0ac', '#93a2a3'][i % 3], [x, -.25, z], [1, 1, 1], [0, -angle, 0]);
    box(3.7, .45, 1.7, '#647a7c', [x, 6.65, z], [0, -angle, 0]);
    if (i % 3 === 1) {
      box(.3, 3.2, .3, '#526a6b', [x, 8.15, z]);
      box(1.2, .18, .9, '#7e9191', [x, 9.7, z]);
    }
  }
  // Broad steps and a few broken slabs give the arena its scale.
  for (let i = 0; i < 3; i++) box(8.6 - i * .8, .55, 5.7 - i * .8, ['#89999a', '#91a1a0', '#9eaaa7'][i], [5.1, i * .55, -12.6]);
  box(4.3, .35, 3.6, '#697e7f', [5.1, 1.62, -12.9]);
  box(2.65, 2.4, 2.6, '#8b9d9b', [5.1, 2.9, -13]);
  box(2.9, .28, 2.9, '#4d676b', [5.1, 4.2, -13]);
  const monumentStart = pieces.length;
  // An original monumental chicken silhouette, with a vermilion ceramic crown.
  orb('#c2ccc3', [5.1, 5.5, -13], [1.45, 1.7, 1.1]);
  orb('#c9d0c5', [5.15, 8.0, -12.9], [2.1, 2.18, 1.7]);
  orb('#c5cbbf', [5.15, 6.6, -11.9], [1.4, .95, 1]);
  add(new THREE.ConeGeometry(.9, 1.9, 4), '#ae7851', [5.15, 7.55, -10.8], [1, 1, .72], [Math.PI / 2, Math.PI / 4, 0]);
  orb('#9d4534', [5.1, 5.95, -11.9], [.55, 1.15, .48]);
  for (let i = 0; i < 4; i++) orb(['#ab4935', '#b7543c'][i % 2], [4.95, 9.65 + Math.sin(i * .9) * .47, -14.0 + i * .75], [.48, .92, .52]);
  for (const side of [-1, 1]) {
    orb('#6b756c', [5.15 + side * 1.37, 8.35, -11.69], [.66, .75, .28]);
    orb('#ddd9be', [5.15 + side * 1.38, 8.37, -11.48], [.47, .54, .12]);
    orb('#22383d', [5.15 + side * 1.4, 8.37, -11.35], [.17, .28, .06]);
    box(1.35, .23, .35, '#879b95', [5.15 + side * 1.36, 8.93, -11.56], [0, 0, side * -.12]);
  }
  // A single visible fault across the monument replaces noisy surface decoration.
  const crack = new THREE.CatmullRomCurve3([
    new THREE.Vector3(5.7, 9.85, -11.6), new THREE.Vector3(5.5, 9.25, -11.11),
    new THREE.Vector3(5.87, 8.86, -11.1), new THREE.Vector3(5.65, 8.4, -11.04)
  ]);
  add(new THREE.TubeGeometry(crack, 10, .028, 4, false), '#5a7270');
  for (let i = monumentStart; i < pieces.length; i++) pieces[i].translate(-5.1, -4.25, 13).scale(.86, .86, .86).translate(5.1, 4.25, -13);

  for (const [x, z, ry] of [[-5, -9, .4], [12, -4, -.2], [15, -1, .5], [12, 8, -.5]]) {
    box(1.45, .45, .9, '#93a4a2', [x, .02, z], [.03, ry, .1]);
    box(.8, .27, .7, '#a3b2ad', [x + .8, -.01, z + .75], [0, ry + .7, -.1]);
  }
  // Thin brass inlays form an incomplete court; they do not compete with the units.
  for (const [x, z, w, d] of [[3, 6, 15, .025], [3, -6, 15, .025], [-4.5, 0, .025, 12], [10.5, 0, .025, 12]]) box(w, .012, d, '#8f8f6b', [x, -.015, z]);
  add(new THREE.TorusGeometry(4, .018, 4, 72), '#8f8f6b', [3, -.014, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);

  const geometry = mergeGeometries(pieces);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88, metalness: .02 });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  pieces.forEach(p => p.dispose());
  return mesh;
}

function makeBanners(scene) {
  const banners = [];
  for (const [x, z, height] of [[-6.8, -11.5, 6], [12, -12, 7], [17, -17, 6.8]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, height, 8), new THREE.MeshStandardMaterial({ color: '#455c60', roughness: .6, metalness: .4 }));
    pole.position.set(x, height / 2, z); pole.castShadow = true; scene.add(pole);
    const geo = new THREE.PlaneGeometry(1.35, 2.9, 6, 12);
    geo.translate(.7, -1.45, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ad4535', side: THREE.DoubleSide, roughness: .95 });
    const flag = new THREE.Mesh(geo, mat); flag.position.set(x, height - .1, z); flag.rotation.y = -.15;
    flag.castShadow = true; scene.add(flag);
    banners.push({ mesh: flag, pole, source: geo.attributes.position.array.slice() });
  }
  return banners;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .96;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aebfbe');
  scene.fog = new THREE.Fog('#aebfbe', 33, 82);
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 160);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, .025);
  scene.environment = env.texture; scene.environmentIntensity = .27;
  environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#dfefed', '#627881', 1.25));
  const sunlight = new THREE.DirectionalLight('#ffe1b2', 3.5);
  sunlight.position.set(-12, 22, 14); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -27, right: 27, top: 25, bottom: -25, near: 1, far: 75 });
  sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.00012;
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight('#b7d8dc', 1.3); fill.position.set(15, 10, -10); scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: '#a6b6b3', roughness: .82 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.66; ground.receiveShadow = true; scene.add(ground);
  const architecture = makeArchitecture(scene);
  const banners = makeBanners(scene);
  const heroes = KINDS.map((kind, i) => {
    const rig = createCharacter(kind);
    const [x, y, z, angle, scale] = HOME_POSITIONS[i];
    rig.position.set(x, y, z); rig.rotation.y = angle; rig.scale.setScalar(scale);
    scene.add(rig); return rig;
  });
  const previewRig = new THREE.Group(); scene.add(previewRig); previewRig.visible = false;
  const previewModels = KINDS.map(kind => { const model = createCharacter(kind); model.scale.setScalar(3.35 / model.userData.height); model.visible = false; previewRig.add(model); return model; });

  const armyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .01 });
  const army = KINDS.map((kind, index) => {
    const mesh = new THREE.InstancedMesh(getCharacterGeometry(kind), armyMaterial, 8);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 8; i++) {
      const x = -3 + index * 2.5 + (i % 2) * .95;
      const z = -5.5 - Math.floor(i / 2) * 2.15;
      matrix.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(.58, .58, .58));
      mesh.setMatrixAt(i, matrix);
    }
    scene.add(mesh); return mesh;
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(1.95, 1.97, 80), new THREE.MeshBasicMaterial({ color: '#9c4d37', transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(3.7, .008, 2.5); ring.visible = false; scene.add(ring);
  const portraitBase = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4, .22, 96), new THREE.MeshStandardMaterial({ color: '#b3c0b8', roughness: .85 }));
  portraitBase.position.set(3.7, -.1, 2.5); portraitBase.receiveShadow = true; portraitBase.visible = false; scene.add(portraitBase);

  let view = 'home', selected = 0, animated = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = 0, spread = 0, targetSpread = 0, azimuthOffset = 0, elevationOffset = 0, zoom = 0;
  let width = 1, height = 1;
  const pointer = new THREE.Vector2(), target = new THREE.Vector3();
  const homeCamera = { x: 1.1, y: 1.7, z: 2.4, distance: 25.8, azimuth: .22, elevation: .24 };
  const current = { ...homeCamera };
  let dragging = null;

  function presets() {
    const mobile = width < 700 || width < height;
    if (view === 'codex') return mobile
      ? { x: 3.7, y: 1.9, z: 1, distance: 16.7, azimuth: .18, elevation: .12 }
      : { x: 1.6, y: 1.3, z: 2.5, distance: 12.4, azimuth: .12, elevation: .16 };
    if (view === 'arena') return { x: 3.1, y: .6, z: -2, distance: mobile ? 47 : 37, azimuth: .06, elevation: .83 };
    return mobile
      ? { x: 4.1, y: 1.0, z: 4, distance: 44, azimuth: .2, elevation: .4 }
      : width / height < 1.5 ? { ...homeCamera, x: 1.8, distance: 28.5 } : homeCamera;
  }

  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setView(next, unit = selected) {
    view = next; selected = unit; azimuthOffset = 0; elevationOffset = 0; zoom = 0;
    if (next === 'home') targetSpread = 0;
    heroes.forEach(h => { h.visible = next !== 'codex'; });
    army.forEach(h => { h.visible = next !== 'codex'; });
    previewRig.visible = next === 'codex';
    previewModels.forEach((m, i) => { m.visible = i === selected; });
    previewRig.position.set(3.7, .03, 2.5);
    previewRig.rotation.y = -.12;
    ring.visible = next === 'codex';
    portraitBase.visible = next === 'codex';
    architecture.visible = next !== 'codex';
    banners.forEach(({ mesh, pole }) => { mesh.visible = pole.visible = next !== 'codex'; });
  }

  function render(dt) {
    if (animated) elapsed += dt;
    const preset = presets(), smoothing = 1 - Math.exp(-dt * 4.2);
    for (const key of Object.keys(current)) current[key] = THREE.MathUtils.lerp(current[key], preset[key], smoothing);
    const az = current.azimuth + azimuthOffset + (view === 'home' ? pointer.x * .018 : 0);
    const el = THREE.MathUtils.clamp(current.elevation + elevationOffset, .10, 1.3);
    const dist = current.distance + zoom;
    target.set(current.x, current.y, current.z);
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);
    // Offset the portrait instead of covering it with an information panel.
    if (width < 700 || width < height) camera.setViewOffset(width, height, 0, view === 'home' ? height * .20 : view === 'codex' ? height * .19 : 0, width, height);
    else camera.clearViewOffset();
    spread = THREE.MathUtils.lerp(spread, targetSpread, smoothing);
    heroes.forEach((hero, i) => {
      const [x, y, z] = HOME_POSITIONS[i];
      hero.position.x = x + (x - 4) * spread * .38;
      hero.position.z = z + (z - 1.5) * spread * .5;
      if (animated) hero.userData.animate?.(elapsed + i * 1.73);
    });
    if (view === 'codex' && animated) previewModels[selected].userData.animate?.(elapsed);
    for (const { mesh, source } of banners) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = source[i * 3], y = source[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 2.2 + y * 1.2 + elapsed * 1.5) * .12 * x);
      }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
    }
    renderer.render(scene, camera);
  }

  canvas.addEventListener('pointerdown', event => {
    if (view === 'battle' || event.button !== 0) return;
    dragging = { x: event.clientX, y: event.clientY, az: azimuthOffset, el: elevationOffset };
    canvas.setPointerCapture(event.pointerId);
    document.getElementById('scene-hint').classList.add('dismissed');
  });
  canvas.addEventListener('pointermove', event => {
    if (view === 'battle') return;
    pointer.set(event.clientX / width * 2 - 1, event.clientY / height * 2 - 1);
    if (!dragging) return;
    azimuthOffset = dragging.az - (event.clientX - dragging.x) * .004;
    elevationOffset = THREE.MathUtils.clamp(dragging.el + (event.clientY - dragging.y) * .002, -.18, .6);
  });
  canvas.addEventListener('pointerup', () => { dragging = null; });
  canvas.addEventListener('pointercancel', () => { dragging = null; });
  canvas.addEventListener('wheel', event => {
    if (view === 'battle') return;
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * .012, -5, 14);
  }, { passive: false });
  addEventListener('resize', resize); resize();

  return {
    render, setView, renderer, scene, camera, kinds: KINDS,
    setBrightness(value) { renderer.toneMappingExposure = value * .96; },
    setAnimation(value) { animated = value; },
    setQuality(high) {
      sunlight.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
      sunlight.shadow.map?.dispose(); sunlight.shadow.map = null;
      renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.6 : 1)); resize();
    },
    toggleFormation() { targetSpread = targetSpread > 0 ? 0 : 1; return targetSpread > 0; },
    resetCamera() { azimuthOffset = elevationOffset = zoom = 0; },
    inspect() { return { view, selected, animated, width, height, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }; }
  };
}
