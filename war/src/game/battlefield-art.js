import * as THREE from 'three';
import {
  MAP, DEPLOYMENT, BRIDGE, FORESTS, HILLS, ROCKS, TREES,
  heightAt, terrainAt, riverCenter, riverHalfWidth, inBridge,
} from './terrain.js';

const WATER_HEIGHT = -0.065;
const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);

function paintedGeometry(geometry, shade) {
  const color = new THREE.Color(shade);
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const light = 0.97 + normal.getY(i) * 0.035;
    colors[i * 3] = color.r * light;
    colors[i * 3 + 1] = color.g * light;
    colors[i * 3 + 2] = color.b * light;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeGeometry(parts) {
  const flat = parts.map((part) => {
    const result = part.index ? part.toNonIndexed() : part;
    if (result !== part) part.dispose();
    return result;
  });
  const vertices = flat.reduce((sum, part) => sum + part.attributes.position.count, 0);
  const geometry = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'color']) {
    const data = new Float32Array(vertices * 3);
    let offset = 0;
    for (const part of flat) {
      data.set(part.attributes[key].array, offset);
      offset += part.attributes[key].array.length;
    }
    geometry.setAttribute(key, new THREE.BufferAttribute(data, 3));
  }
  flat.forEach((part) => part.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function woodBox(parts, size, position, color) {
  parts.push(paintedGeometry(new THREE.BoxGeometry(...size).translate(...position), color));
}

function branch(start, end, radius, tipRadius) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(tipRadius, radius, direction.length(), 7, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
  geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
  return paintedGeometry(geometry, '#716f5d');
}

function groundGeometry() {
  const geometry = new THREE.PlaneGeometry(MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ, 256, 168);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((MAP.minX + MAP.maxX) / 2, 0, (MAP.minZ + MAP.maxZ) / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    position.setY(i, heightAt(x, z));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const plain = new THREE.Color('#91a57d');
  const dryGrass = new THREE.Color('#bab98c');
  const slope = new THREE.Color('#7b8d70');
  const stone = new THREE.Color('#b8b7a3');
  const earth = new THREE.Color('#c4baa1');
  const forestFloor = new THREE.Color('#5f865e');
  const riverbed = new THREE.Color('#849f93');
  const ford = new THREE.Color('#c0bf9f');
  const bridge = new THREE.Color('#b49676');
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const terrain = terrainAt(x, z);
    const variation = (Math.sin(x * 0.93 + Math.sin(z * 0.37)) * Math.cos(z * 0.68) + Math.sin(x * 2.2 + z * 1.4) * 0.24) * 0.025;
    c.copy(plain).lerp(dryGrass, THREE.MathUtils.smoothstep(y, 0.5, 3.5) * 0.5);
    c.lerp(slope, (1 - normal.getY(i)) * 0.8);
    if (y > 2) c.lerp(stone, THREE.MathUtils.smoothstep(y, 2, 3.9) * 0.25);
    if (terrain.kind === 'forest') c.lerp(forestFloor, 0.52);
    if (terrain.kind === 'mud') c.copy(earth).lerp(slope, .5).multiplyScalar(.8);
    if (terrain.kind === 'road') c.copy(earth).multiplyScalar(.98);
    if (terrain.kind === 'river') c.lerp(riverbed, 0.75);
    if (terrain.kind === 'ford') c.lerp(ford, 0.85);
    if (terrain.kind === 'bridge') c.copy(bridge);
    if (terrain.kind === 'plain' || terrain.kind === 'highland') {
      const bridgeTrack = Math.exp(-(((z - (BRIDGE.minZ + BRIDGE.maxZ) / 2) / 0.8) ** 2));
      const fordTrack = Math.exp(-(((z + 8) / 0.82) ** 2));
      const road = x > -20 && x < 23 ? Math.max(bridgeTrack * 0.56, fordTrack * 0.36) : 0;
      c.lerp(earth, road);
    }
    c.multiplyScalar(1 + variation);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function bankDistance(z, side) {
  const width = riverHalfWidth(z);
  if (z >= BRIDGE.minZ && z <= BRIDGE.maxZ) return width + 0.44;
  let low = width - 0.4, high = width + 0.9;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (heightAt(riverCenter(z) + side * mid, z) < WATER_HEIGHT) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function waterGeometry() {
  const positions = [], colors = [], indices = [];
  const across = 12, along = 168;
  const deep = new THREE.Color('#4f8c8b');
  const shallow = new THREE.Color('#a7c5b5');
  const ford = new THREE.Color('#b8ccb4');
  for (let j = 0; j <= along; j++) {
    const z = THREE.MathUtils.lerp(MAP.minZ, MAP.maxZ, j / along);
    const center = riverCenter(z);
    const left = bankDistance(z, -1), right = bankDistance(z, 1);
    for (let i = 0; i <= across; i++) {
      const t = i / across;
      const x = center + THREE.MathUtils.lerp(-left, right, t);
      positions.push(x, WATER_HEIGHT, z);
      const edge = Math.abs(t * 2 - 1);
      const c = deep.clone().lerp(shallow, edge ** 3 * 0.65);
      const fordMix = (1 - THREE.MathUtils.smoothstep(Math.abs(z + 8), 1.5, 2.3)) * 0.42;
      c.lerp(ford, fordMix);
      colors.push(c.r, c.g, c.b);
      if (j < along && i < across) {
        const a = j * (across + 1) + i, b = a + across + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function preparationGeometry(team = 'ally') {
  const positions = [], indices = [];
  const corners = [
    [DEPLOYMENT.minX, DEPLOYMENT.minZ], [DEPLOYMENT.maxX, DEPLOYMENT.minZ],
    [DEPLOYMENT.maxX, DEPLOYMENT.maxZ], [DEPLOYMENT.minX, DEPLOYMENT.maxZ],
  ];
  for (let edge = 0; edge < 4; edge++) {
    const a = new THREE.Vector2(...corners[edge]);
    const b = new THREE.Vector2(...corners[(edge + 1) % 4]);
    if (team === 'enemy') { a.x *= -1; b.x *= -1; }
    const direction = b.clone().sub(a);
    const steps = Math.ceil(direction.length() * 2);
    const offset = new THREE.Vector2(-direction.y, direction.x).normalize().multiplyScalar(0.045);
    const start = positions.length / 3;
    for (let i = 0; i <= steps; i++) {
      const p = a.clone().lerp(b, i / steps);
      for (const side of [-1, 1]) {
        const x = p.x + offset.x * side, z = p.y + offset.y * side;
        positions.push(x, heightAt(x, z) + 0.027, z);
      }
      if (i < steps) {
        const k = start + i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createBattlefield(scene, visionTexture) {
  const root = new THREE.Group();
  root.name = 'battlefield';
  root.userData = { treeCount: TREES.length, rockCount: ROCKS.length, hillCount: HILLS.length, forestCount: FORESTS.length };
  scene.add(root);
  const groundMesh = new THREE.Mesh(groundGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }));
  groundMesh.material.onBeforeCompile = shader => {
    shader.uniforms.uBattleVision = { value: visionTexture };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainPosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vTerrainPosition;
      uniform sampler2D uBattleVision;
      float terrainNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        vec3 k=vec3(127.1,311.7,74.7);
        float a=fract(sin(dot(i,k.xy))*43758.5453), b=fract(sin(dot(i+vec2(1.,0.),k.xy))*43758.5453);
        float c=fract(sin(dot(i+vec2(0.,1.),k.xy))*43758.5453), d=fract(sin(dot(i+vec2(1.,1.),k.xy))*43758.5453);
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain=terrainNoise(vTerrainPosition.xz*7.0)*0.55+terrainNoise(vTerrainPosition.xz*1.8)*0.45;
      diffuseColor.rgb*=0.93+grain*0.12;
      float contour=abs(fract(vTerrainPosition.y/0.75)-0.5);
      diffuseColor.rgb*=1.0-smoothstep(0.46,0.49,contour)*0.065*smoothstep(0.8,1.3,vTerrainPosition.y);
      vec2 visionUV=(vTerrainPosition.xz-vec2(${MAP.minX.toFixed(1)},${MAP.minZ.toFixed(1)}))/vec2(${(MAP.maxX - MAP.minX).toFixed(1)},${(MAP.maxZ - MAP.minZ).toFixed(1)});
      diffuseColor.rgb*=mix(0.60,1.0,texture2D(uBattleVision,visionUV).r);`);
  };
  groundMesh.material.customProgramCacheKey = () => 'terrain-grain-vision-2';
  groundMesh.name = 'battlefield-ground';
  groundMesh.receiveShadow = true;
  root.add(groundMesh);

  const rimVertices = [], rimIndices = [];
  const border = [[MAP.minX, MAP.minZ], [MAP.maxX, MAP.minZ], [MAP.maxX, MAP.maxZ], [MAP.minX, MAP.maxZ], [MAP.minX, MAP.minZ]];
  for (let side = 1; side < border.length; side++) {
    const [ax, az] = border[side - 1], [bx, bz] = border[side], steps = Math.ceil(Math.hypot(bx - ax, bz - az));
    const start = rimVertices.length / 3;
    for (let i = 0; i <= steps; i++) {
      const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps;
      rimVertices.push(x, heightAt(x, z), z, x, -1.65, z);
      if (i) { const j = start + i * 2; rimIndices.push(j - 2, j, j - 1, j - 1, j, j + 1); }
    }
  }
  const rimGeometry = new THREE.BufferGeometry(); rimGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rimVertices, 3)); rimGeometry.setIndex(rimIndices); rimGeometry.computeVertexNormals();
  const rim = new THREE.Mesh(rimGeometry, new THREE.MeshStandardMaterial({ color: '#79856b', roughness: 1, side: THREE.DoubleSide })); rim.name = 'battlefield-edge'; rim.receiveShadow = true; root.add(rim);

  const riverTime = { value: 0 };
  const waterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.04, transparent: true, opacity: 0.83, depthWrite: false });
  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uRiverTime = riverTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uRiverTime; varying vec2 vRiverXZ;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverXZ = position.xz; transformed.y += sin(position.z * 2.4 + position.x * 3.2 - uRiverTime * 1.1) * 0.008;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRiverTime; varying vec2 vRiverXZ;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat ripple = sin(vRiverXZ.y * 4.3 + vRiverXZ.x * 10.5 - uRiverTime * 1.7); diffuseColor.rgb += vec3(0.016, 0.022, 0.019) * smoothstep(0.91, 1.0, ripple);');
  };
  waterMaterial.customProgramCacheKey = () => 'battlefield-river-1';
  const water = new THREE.Mesh(waterGeometry(), waterMaterial);
  water.name = 'battlefield-river';
  water.receiveShadow = true;
  water.renderOrder = 1;
  root.add(water);

  const bridgeParts = [];
  const length = BRIDGE.maxX - BRIDGE.minX, width = BRIDGE.maxZ - BRIDGE.minZ;
  const bridgeX = (BRIDGE.minX + BRIDGE.maxX) / 2, bridgeZ = (BRIDGE.minZ + BRIDGE.maxZ) / 2;
  woodBox(bridgeParts, [length, 0.16, width], [bridgeX, BRIDGE.height - 0.15, bridgeZ], '#8d7a64');
  const boards = Math.ceil(length / 0.55);
  for (let i = 0; i < boards; i++) {
    const boardWidth = length / boards;
    woodBox(bridgeParts, [boardWidth - 0.026, 0.105, width], [BRIDGE.minX + (i + 0.5) * boardWidth, BRIDGE.height - 0.0525, bridgeZ], i % 3 ? '#bb9a77' : '#b18e6b');
  }
  for (const side of [-1, 1]) {
    woodBox(bridgeParts, [length + 0.05, 0.28, 0.16], [bridgeX, BRIDGE.height - 0.24, bridgeZ + side * (width / 2 - 0.07)], '#8b795f');
  }
  const bridgeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const bridge = new THREE.Mesh(mergeGeometry(bridgeParts), bridgeMaterial);
  bridge.name = 'battlefield-bridge';
  bridge.castShadow = bridge.receiveShadow = true;
  root.add(bridge);

  const trunkGeometry = mergeGeometry([
    branch([0, 0, 0], [0.04, 3.65, 0], 0.18, 0.065),
    branch([0.02, 1.7, 0], [-0.53, 3.15, 0.12], 0.075, 0.026),
    branch([0.03, 2.35, 0], [0.6, 3.9, -0.08], 0.06, 0.02),
  ]);
  const canopyGeometry = mergeGeometry([
    paintedGeometry(new THREE.IcosahedronGeometry(1, 1).scale(0.54, 0.65, 0.43).translate(-0.48, 3.21, 0.1), '#527b58'),
    paintedGeometry(new THREE.IcosahedronGeometry(1, 1).scale(0.61, 0.69, 0.42).translate(0.47, 3.75, -0.06), '#6a8d5b'),
    paintedGeometry(new THREE.IcosahedronGeometry(1, 1).scale(0.48, 0.56, 0.37).translate(0, 4.24, 0.02), '#86a473'),
  ]);
  const trunkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const canopyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.FrontSide });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, TREES.length);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, TREES.length);
  trunks.name = 'battlefield-tree-trunks';
  canopies.name = 'battlefield-tree-canopies';
  trunks.castShadow = trunks.receiveShadow = true;
  canopies.receiveShadow = true;
  canopies.renderOrder = 2;
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (let i = 0; i < TREES.length; i++) {
    const tree = TREES[i];
    rotation.setFromAxisAngle(up, tree.rotation);
    scale.set(tree.scale, tree.height / 4.8, tree.scale);
    matrix.compose(new THREE.Vector3(tree.x, heightAt(tree.x, tree.z), tree.z), rotation, scale);
    trunks.setMatrixAt(i, matrix);
    canopies.setMatrixAt(i, matrix);
  }
  trunks.instanceMatrix.needsUpdate = canopies.instanceMatrix.needsUpdate = true;
  trunks.computeBoundingSphere(); canopies.computeBoundingSphere();
  root.add(trunks, canopies);

  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const rockPositions = rockGeometry.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
    const distortion = 1 + Math.sin(x * 8 + z * 5) * 0.08;
    rockPositions.setXYZ(i, x * distortion, y * (0.93 + x * 0.08), z * distortion);
  }
  rockGeometry.computeVertexNormals();
  paintedGeometry(rockGeometry, '#90978e');
  const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, ROCKS.length);
  rocks.name = 'battlefield-collision-rocks';
  rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < ROCKS.length; i++) {
    const rock = ROCKS[i];
    rotation.setFromEuler(new THREE.Euler(0.05, i * 1.93, -0.08));
    matrix.compose(new THREE.Vector3(rock.x, heightAt(rock.x, rock.z) + rock.radius * 0.36, rock.z), rotation, new THREE.Vector3(rock.radius * 0.9, rock.radius * 0.84, rock.radius * 0.83));
    rocks.setMatrixAt(i, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingSphere();
  root.add(rocks);

  const pebbles = new THREE.InstancedMesh(rockGeometry, rockMaterial, 18);
  pebbles.name = 'battlefield-ford-pebbles';
  pebbles.receiveShadow = true;
  for (let i = 0; i < 18; i++) {
    const z = -9.7 + (i % 9) * 0.4 + Math.sin(i * 2.3) * 0.08;
    const side = i < 9 ? -1 : 1;
    const x = riverCenter(z) + side * (riverHalfWidth(z) * (0.62 + 0.18 * (0.5 + 0.5 * Math.sin(i * 2.1))));
    const size = 0.14 + (0.5 + Math.sin(i * 1.73) * 0.5) * 0.11;
    rotation.setFromEuler(new THREE.Euler(0, i * 2.4, 0.1));
    matrix.compose(new THREE.Vector3(x, heightAt(x, z) + size * 0.45, z), rotation, new THREE.Vector3(size * 1.2, size * 0.72, size));
    pebbles.setMatrixAt(i, matrix);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  pebbles.computeBoundingSphere();
  root.add(pebbles);

  const grassPositions = [];
  for (let i = 0; i < 960; i++) {
    const x = MAP.minX + 1 + ((i * 19.733) % (MAP.maxX - MAP.minX - 2));
    const z = MAP.minZ + 1 + ((i * 11.381) % (MAP.maxZ - MAP.minZ - 2));
    const terrain = terrainAt(x, z);
    if (!['plain', 'forest', 'highland'].includes(terrain.kind) || inBridge(x, z)) continue;
    const y = heightAt(x, z) + 0.014, height = 0.07 + (0.5 + Math.sin(i * 2.7) * 0.5) * 0.07;
    grassPositions.push(x - 0.035, y, z, x, y + height, z + 0.015, x, y + height, z + 0.015, x + 0.055, y, z + 0.035);
  }
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
  const grass = new THREE.LineSegments(grassGeometry, new THREE.LineBasicMaterial({ color: '#8da185', transparent: true, opacity: 0.36 }));
  grass.name = 'battlefield-grass';
  root.add(grass);

  const prepMaterial = new THREE.MeshBasicMaterial({ color: '#4d9c8b', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const preparation = new THREE.Mesh(preparationGeometry(), prepMaterial);
  preparation.name = 'battlefield-preparation';
  preparation.renderOrder = 3;
  root.add(preparation);
  let disposed = false;
  return {
    root,
    groundMesh,
    setSide(side) { preparation.geometry.dispose(); preparation.geometry = preparationGeometry(side === 'east' ? 'enemy' : 'ally'); },
    setPreparation(active) { preparation.visible = Boolean(active); },
    update(time) {
      if (disposed || !Number.isFinite(time)) return;
      riverTime.value = time;
      if (preparation.visible) prepMaterial.opacity = 0.75 + Math.sin(time * 1.5) * 0.045;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set(), materials = new Set();
      root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        if (object.isInstancedMesh) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.removeFromParent();
      root.clear();
    },
  };
}
