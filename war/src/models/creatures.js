import * as THREE from 'three';
import { workshop } from './workshop.js';

const TAU = Math.PI * 2;
const colour = (value) => new THREE.Color(value);
const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);

// Reapply colour after workshop.add so the belly and facial markings follow the
// actual surface, instead of sitting on the model as separate oval plates.
function painted(w, geometry, paint) {
  w.add(geometry, '#ffffff');
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const values = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const c = paint(positions.getX(i), positions.getY(i), positions.getZ(i));
    const light = 0.98 + normals.getY(i) * 0.025 - normals.getX(i) * 0.009;
    values[i * 3] = c.r * light;
    values[i * 3 + 1] = c.g * light;
    values[i * 3 + 2] = c.b * light;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
}

function ellipsoid(position, scale, segments = 40) {
  return new THREE.SphereGeometry(1, segments, 28).scale(...scale).translate(...position);
}

// A continuous, asymmetric front/back silhouette with a smooth neck transition.
function loft(profile, depth, deform = null) {
  const curve = new THREE.CatmullRomCurve3(profile.map((p) => new THREE.Vector3(...p)));
  const bands = 64;
  const sides = 56;
  const positions = [];
  const indices = [];
  for (let j = 0; j <= bands; j++) {
    const point = curve.getPoint(j / bands);
    const radius = Math.max(0, point.x);
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * TAU;
      const x = Math.sin(angle) * radius;
      const y = point.y;
      let z = Math.cos(angle) * radius * depth + point.z;
      if (deform) z += deform(x, y, angle);
      positions.push(x, y, z);
      if (j < bands && i < sides) {
        const a = j * (sides + 1) + i;
        const b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function taperedLimb(w, shade, points, radii) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const radiiCurve = new THREE.SplineCurve(radii.map((radius, i) => new THREE.Vector2(i / (radii.length - 1), radius)));
  const frames = curve.computeFrenetFrames(40, false);
  const positions = [];
  const indices = [];
  for (let j = 0; j <= 40; j++) {
    const center = curve.getPointAt(j / 40);
    const radius = Math.max(0.005, radiiCurve.getPoint(j / 40).y);
    for (let i = 0; i <= 12; i++) {
      const angle = i / 12 * TAU;
      const p = center.clone()
        .addScaledVector(frames.normals[j], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[j], Math.sin(angle) * radius);
      positions.push(p.x, p.y, p.z);
      if (j < 40 && i < 12) {
        const a = j * 13 + i;
        const b = a + 13;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  w.add(geometry, shade);
}

function frontPatch(w, shade, shape, center, depth = 0.015, bend = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.008,
    bevelThickness: 0.008, bevelSegments: 2, curveSegments: 20,
  });
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    position.setZ(i, position.getZ(i) - x * x * bend);
  }
  geometry.computeVertexNormals();
  w.add(geometry, shade, center);
}

function curvedFeather(w, side, start, tip, width) {
  const center = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * start[0], start[1], start[2]),
    new THREE.Vector3(side * (start[0] * 0.4 + tip[0] * 0.6), start[1] * 0.45 + tip[1] * 0.55, 0.065),
    new THREE.Vector3(side * tip[0], tip[1], tip[2]),
  ]);
  const positions = [];
  const indices = [];
  const featherValues = [];
  const base = colour('#7b9de0');
  const inner = colour('#edf1e8');
  const edge = colour('#5d6fbd');
  const tipColour = colour('#3c425d');
  for (let j = 0; j <= 26; j++) {
    const t = j / 26;
    const point = center.getPoint(t);
    const tangent = center.getTangent(t);
    const lateral = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const radius = Math.pow(Math.sin(Math.PI * t), 0.6) * width * (1 - t * 0.26);
    for (let i = 0; i <= 10; i++) {
      const a = i / 10 * TAU;
      const p = point.clone().addScaledVector(lateral, Math.sin(a) * radius);
      p.z += Math.cos(a) * Math.sin(Math.PI * t) * 0.075;
      positions.push(p.x, p.y, p.z);
      const innerMix = smooth(0.04, 0.62, Math.cos(a)) * (1 - smooth(0.68, 0.87, t));
      const c = base.clone().lerp(inner, innerMix).lerp(edge, smooth(0.5, 0.8, t) * 0.4);
      c.lerp(tipColour, smooth(0.78, 0.91, t));
      featherValues.push(c.r, c.g, c.b);
      if (j < 26 && i < 10) {
        const k = j * 11 + i;
        indices.push(k, k + 11, k + 1, k + 1, k + 11, k + 12);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  w.add(geometry, '#ffffff');
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(featherValues, 3));
}

export function makeMengqi() {
  const w = workshop();
  const blue = '#709bdf';
  const white = '#f2f0e8';
  const deepBlue = '#3c4f9c';
  const bodyBlue = colour(blue);
  const bellyWhite = colour(white);
  const body = ellipsoid([0, 1.03, 0], [0.76, 0.86, 0.61]);
  painted(w, body, (x, y, z) => {
    const patch = (x / 0.65) ** 2 + ((y - 1.03) / 0.8) ** 2;
    const amount = (1 - smooth(0.88, 1.07, patch)) * smooth(0.12, 0.31, z);
    return bodyBlue.clone().lerp(bellyWhite, amount);
  });
  for (const side of [-1, 1]) {
    w.sphere(blue, [side * 0.43, 0.3, -0.015], [0.275, 0.33, 0.3]);
    w.sphere(blue, [side * 0.44, 0.13, 0.17], [0.25, 0.13, 0.32]);
    for (let i = -1; i <= 1; i++) {
      w.sphere(white, [side * 0.44 + i * 0.092, 0.12, 0.438 - Math.abs(i) * 0.02], [0.049, 0.063, 0.054]);
    }
  }
  taperedLimb(w, blue, [[-0.57, 1.56, 0], [-0.8, 1.22, 0.035], [-0.87, 0.97, 0.17]], [0.25, 0.2, 0.17]);
  w.sphere(white, [-0.88, 0.86, 0.24], [0.205, 0.19, 0.19]);
  for (let i = 0; i < 3; i++) w.sphere('#786f71', [-1 + i * 0.1, 0.739, 0.319], [0.025, 0.048, 0.037]);
  taperedLimb(w, blue, [[0.57, 1.54, 0], [0.85, 1.7, 0.03], [1.01, 1.97, 0.13]], [0.24, 0.19, 0.16]);
  w.sphere(white, [1.03, 2.08, 0.15], [0.2, 0.22, 0.16], [0, 0, -0.28]);
  for (let i = 0; i < 3; i++) w.sphere('#756c73', [0.94 + i * 0.105, 2.263 - i * 0.025, 0.197], [0.031, 0.069, 0.039], [0, 0, -0.24]);

  // The neck scarf and its turquoise hanging crystal are central identity marks.
  w.tube('#1f76cd', [[-0.56, 1.63, 0.19], [-0.34, 1.61, 0.51], [0, 1.61, 0.61], [0.34, 1.61, 0.51], [0.56, 1.63, 0.19], [0.4, 1.68, -0.32], [0, 1.69, -0.43], [-0.4, 1.68, -0.32]], 0.082, true);
  w.tube('#55b0ec', [[-0.52, 1.674, 0.25], [-0.28, 1.669, 0.535], [0, 1.67, 0.643], [0.28, 1.669, 0.535], [0.52, 1.674, 0.25]], 0.025);
  w.sphere('#c29848', [0, 1.64, 0.693], [0.14, 0.14, 0.067]);
  for (const x of [-0.073, -0.036, 0, 0.036, 0.073]) {
    w.tube('#efcc77', [[x * 0.3, 1.53, 0.751], [x, 1.65, 0.755], [x * 0.5, 1.735, 0.731]], 0.009);
  }
  const jewel = new THREE.OctahedronGeometry(1, 0).scale(0.13, 0.27, 0.085).translate(0, 1.345, 0.72);
  painted(w, jewel, (x, y, z) => colour(z > 0.73 ? '#27d4df' : '#2580bc'));
  w.tube('#3671be', [[0.15, 1.45, 0.586], [0.22, 1.25, 0.608], [0.03, 1.08, 0.616], [-0.06, 0.94, 0.608], [0.095, 0.77, 0.573], [0.065, 0.6, 0.525]], 0.041);

  w.section('head', [0, 1.84, 0.01]);
  const headBlue = colour('#7c9de0');
  const faceWhite = colour('#f3f0e8');
  painted(w, ellipsoid([0, 1.995, 0.045], [0.64, 0.58, 0.5]), (x, y, z) => {
    const eyePatch = Math.min(((x - 0.22) / 0.245) ** 2 + ((y - 2.06) / 0.335) ** 2, ((x + 0.22) / 0.245) ** 2 + ((y - 2.06) / 0.335) ** 2);
    const cheekPatch = (x / 0.58) ** 2 + ((y - 1.78) / 0.285) ** 2;
    const amount = (1 - smooth(0.92, 1.07, Math.min(eyePatch, cheekPatch))) * smooth(0.08, 0.26, z);
    return headBlue.clone().lerp(faceWhite, amount);
  });
  w.sphere(white, [0, 1.82, 0.463], [0.47, 0.2, 0.165]);
  for (const side of [-1, 1]) {
    w.sphere('#9b2f9d', [side * 0.222, 2.084, 0.517], [0.078, 0.106, 0.035]);
    w.sphere('#2a203f', [side * 0.222, 2.086, 0.548], [0.04, 0.079, 0.018]);
    w.sphere('#ffffff', [side * 0.222 - 0.019, 2.12, 0.566], [0.015, 0.022, 0.009]);
    w.sphere(deepBlue, [side * 0.505, 1.952, 0.408], [0.115, 0.057, 0.024], [0, side * 0.52, side * 0.24]);
    w.sphere(deepBlue, [side * 0.5, 1.79, 0.45], [0.073, 0.104, 0.027], [0, side * 0.48, side * 0.34]);
    // The ear is a fan of swept feathers, not a single cylindrical rabbit ear.
    curvedFeather(w, side, [0.46, 2.27, -0.045], [0.96, 3.37, 0], 0.25);
    curvedFeather(w, side, [0.51, 2.3, -0.03], [1.08, 2.54, 0.035], 0.16);
    curvedFeather(w, side, [0.55, 2.36, -0.025], [1.26, 2.82, 0.015], 0.15);
    curvedFeather(w, side, [0.6, 2.46, -0.025], [1.32, 3.09, 0.015], 0.155);
    curvedFeather(w, side, [0.62, 2.61, -0.035], [1.21, 3.4, -0.005], 0.145);
    curvedFeather(w, side, [0.65, 2.7, -0.04], [1.04, 3.53, -0.03], 0.12);
  }
  const nose = new THREE.Shape();
  nose.moveTo(-0.07, 0.022); nose.quadraticCurveTo(0, 0.058, 0.07, 0.022);
  nose.quadraticCurveTo(0.055, -0.022, 0, -0.049); nose.quadraticCurveTo(-0.055, -0.022, -0.07, 0.022);
  frontPatch(w, '#2e2935', nose, [0, 1.97, 0.626]);
  w.tube('#4a4350', [[-0.17, 1.835, 0.609], [-0.07, 1.814, 0.628], [0, 1.825, 0.634], [0.07, 1.814, 0.628], [0.17, 1.835, 0.609]], 0.011);
  return w.finish();
}

export function makeNailong() {
  const w = workshop();
  const yellow = '#f1c53b';
  const yellowColour = colour(yellow);
  const belly = colour('#f6ead9');
  const skin = loft([
    [0, 0.29, 0], [0.4, 0.3, 0], [0.74, 0.5, 0], [0.9, 0.93, -0.015],
    [0.9, 1.45, -0.02], [0.81, 1.94, 0.01], [0.86, 2.18, 0.06],
    [0.93, 2.58, 0.09], [0.86, 2.95, 0.09], [0.62, 3.19, 0.09],
    [0.4, 3.258, 0.09], [0.2, 3.289, 0.09], [0.08, 3.299, 0.09], [0, 3.3, 0.09],
  ], 0.76, (x, y, angle) => {
    const front = Math.pow(Math.max(0, Math.cos(angle)), 2);
    return 0.16 * Math.exp(-(((y - 2.43) / 0.35) ** 2)) * Math.exp(-((x / 0.85) ** 6)) * front;
  });
  painted(w, skin, (x, y, z) => {
    const oval = (x / 0.67) ** 2 + ((y - 1.12) / 0.83) ** 2;
    const amount = (1 - smooth(0.9, 1.07, oval)) * smooth(0.21, 0.4, z);
    return yellowColour.clone().lerp(belly, amount);
  });
  for (const side of [-1, 1]) {
    w.sphere('#e5b53a', [side * 0.435, 0.22, 0.055], [0.3, 0.25, 0.32]);
    w.sphere(yellow, [side * 0.435, 0.125, 0.19], [0.315, 0.125, 0.33]);
    for (let i = -1; i <= 1; i++) {
      w.sphere('#77645a', [side * 0.435 + i * 0.15, 0.105, 0.483 - Math.abs(i) * 0.025], [0.065, 0.071, 0.05]);
    }
    taperedLimb(w, yellow, [[side * 0.72, 1.89, 0], [side * 1.05, 2.08, 0.03], [side * 1.17, 2.4, 0.11]], [0.25, 0.225, 0.18]);
    w.sphere(yellow, [side * 1.18, 2.44, 0.11], [0.23, 0.25, 0.19]);
    w.sphere('#d88c87', [side * 1.18, 2.47, 0.292], [0.13, 0.135, 0.019]);
    for (let i = -1; i <= 1; i++) {
      w.sphere('#76665b', [side * 1.18 + i * 0.125, 2.642 - Math.abs(i) * 0.03, 0.16], [0.045, 0.085, 0.054], [0, 0, i * -0.25]);
    }
  }
  taperedLimb(w, yellow, [[0, 0.65, -0.52], [-0.45, 0.66, -0.87], [-0.94, 0.93, -0.89]], [0.28, 0.2, 0.015]);

  // Eyes are small and half embedded in the broad face. The visible white rim is thin.
  for (const side of [-1, 1]) {
    w.sphere('#f0ead8', [side * 0.355, 2.728, 0.819], [0.168, 0.185, 0.051]);
    w.sphere('#426b3d', [side * 0.355, 2.722, 0.864], [0.14, 0.158, 0.031]);
    w.sphere('#1f2927', [side * 0.355, 2.711, 0.893], [0.106, 0.129, 0.021]);
    w.sphere('#f9f3d6', [side * 0.355 - 0.038, 2.756, 0.914], [0.015, 0.021, 0.005]);
    w.sphere(yellow, [side * 0.355, 2.572, 0.879], [0.198, 0.088, 0.066]);
  }
  // Sculpted cheek volume forms the transverse muzzle instead of a protruding snout.
  w.sphere(yellow, [0, 2.39, 0.809], [0.69, 0.295, 0.19]);
  const smile = new THREE.Shape();
  smile.moveTo(-0.315, 0.025); smile.quadraticCurveTo(0, -0.016, 0.315, 0.058);
  smile.quadraticCurveTo(0.23, -0.115, -0.12, -0.095);
  smile.quadraticCurveTo(-0.28, -0.08, -0.315, 0.025);
  frontPatch(w, '#776244', smile, [0, 2.329, 1.001], 0.012, 0.25);
  const teeth = new THREE.Shape();
  teeth.moveTo(-0.277, 0.012); teeth.quadraticCurveTo(0, -0.022, 0.272, 0.042);
  teeth.quadraticCurveTo(0.18, -0.059, -0.16, -0.052);
  teeth.quadraticCurveTo(-0.25, -0.039, -0.277, 0.012);
  frontPatch(w, '#dcdac9', teeth, [0, 2.323, 1.016], 0.008, 0.25);
  return w.finish();
}

export function makeNaiwa() {
  const w = workshop();
  const yellow = '#e3be35';
  const yellowColour = colour(yellow);
  const cream = colour('#e7dec2');
  const hands = '#665d3e';
  const body = loft([
    [0, 0.51, 0], [0.54, 0.52, 0.02], [0.89, 0.83, 0.035], [1.02, 1.34, 0.015],
    [0.98, 1.86, -0.035], [0.84, 2.24, -0.12], [0.62, 2.57, -0.21],
    [0.34, 2.78, -0.27], [0, 2.86, -0.28],
  ], 0.78);
  painted(w, body, (x, y, z) => {
    const oval = (x / 0.84) ** 2 + ((y - 1.3) / 0.8) ** 2;
    const amount = (1 - smooth(0.92, 1.08, oval)) * smooth(0.18, 0.39, z);
    return yellowColour.clone().lerp(cream, amount);
  });
  for (const side of [-1, 1]) {
    w.sphere(yellow, [side * 0.595, 0.67, -0.03], [0.345, 0.49, 0.365], [0.14, 0, side * -0.27]);
    taperedLimb(w, '#c69b32', [[side * 0.64, 0.66, 0], [side * 0.72, 0.36, 0.03], [side * 0.71, 0.2, 0.15]], [0.24, 0.17, 0.13]);
    w.sphere(hands, [side * 0.71, 0.12, 0.3], [0.31, 0.12, 0.43], [0, side * -0.22, 0]);
    for (let i = -1; i <= 1; i++) {
      w.sphere(hands, [side * 0.71 + i * 0.15, 0.088, 0.61 - Math.abs(i) * 0.035], [0.094, 0.086, 0.17], [0, side * -0.15, 0]);
    }
    // Thick rounded shoulders lead to slimmer wrists and long individual fingers.
    taperedLimb(w, yellow, [[side * 0.68, 2.17, -0.015], [side * 0.95, 1.83, 0.12], [side * 0.81, 1.52, 0.5], [side * 0.58, 1.35, 0.74]], [0.29, 0.27, 0.21, 0.14]);
    w.sphere(yellow, [side * 0.68, 2.17, -0.015], [0.305, 0.305, 0.305]);
    w.sphere(hands, [side * 0.43, 1.308, 0.821], [0.235, 0.174, 0.12], [0, 0, side * -0.18]);
    for (let i = 0; i < 4; i++) {
      const y = 1.155 + i * 0.085;
      w.tube(hands, [[side * 0.4, y + 0.055, 0.891], [side * 0.24, y, 0.95], [side * 0.07, y + 0.035, 0.937]], 0.034);
    }
    w.tube(hands, [[side * 0.46, 1.423, 0.844], [side * 0.3, 1.52, 0.882], [side * 0.18, 1.46, 0.921]], 0.054);
  }
  w.sphere('#b19a57', [0.12, 0.64, -0.755], [0.18, 0.16, 0.3], [-0.3, 0.3, 0]);

  // Its little head leans forward out of a high, hunched back.
  w.section('head', [0, 2.57, 0.38]);
  w.sphere(yellow, [0, 2.69, 0.423], [0.505, 0.485, 0.44]);
  w.sphere(yellow, [0, 2.44, 0.443], [0.43, 0.3, 0.36]);
  for (const side of [-1, 1]) {
    w.sphere('#98a946', [side * 0.29, 2.9, 0.755], [0.17, 0.183, 0.14]);
    w.sphere('#b8c54e', [side * 0.29, 2.913, 0.842], [0.125, 0.136, 0.062]);
    w.sphere('#182720', [side * 0.29, 2.892, 0.902], [0.063, 0.085, 0.028]);
    w.sphere('#eae3af', [side * 0.29 - 0.02, 2.928, 0.927], [0.013, 0.018, 0.007]);
  }
  const mouth = new THREE.Shape();
  mouth.moveTo(-0.335, 0.12);
  mouth.quadraticCurveTo(-0.02, 0.035, 0.338, 0.192);
  mouth.bezierCurveTo(0.343, -0.11, 0.2, -0.345, 0.015, -0.355);
  mouth.bezierCurveTo(-0.16, -0.37, -0.31, -0.17, -0.335, 0.12);
  frontPatch(w, '#211c19', mouth, [0, 2.545, 0.819], 0.026, 0.23);
  w.tube('#bd8e36', [[-0.346, 2.67, 0.815], [-0.265, 2.34, 0.82], [0, 2.17, 0.844], [0.267, 2.37, 0.82], [0.346, 2.736, 0.805]], 0.033);
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 0.073;
    const y = 2.625 + x * 0.09 + x * x * 0.41;
    w.box('#e6debf', [x, y, 0.86 - x * x * 0.25], [0.071, 0.065, 0.025], [0, 0, x * 0.2], 0.012);
  }
  w.tube('#ded4b2', [[-0.215, 2.437, 0.858], [-0.145, 2.312, 0.874], [0.015, 2.28, 0.88], [0.17, 2.352, 0.87], [0.245, 2.514, 0.847]], 0.019);
  return w.finish();
}
