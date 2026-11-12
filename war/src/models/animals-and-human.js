import * as THREE from 'three';
import { workshop } from './workshop.js';

function fur(w, center, scale, amount, color, seed = 7) {
  let state = seed;
  const random = () => { state = Math.imul(state ^ state >>> 15, 1 | state); state ^= state + Math.imul(state ^ state >>> 7, 61 | state); return ((state ^ state >>> 14) >>> 0) / 4294967296; };
  const vertices = [];
  for (let i = 0; i < amount; i++) {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2;
    const n = new THREE.Vector3(Math.sqrt(1 - y * y) * Math.cos(angle), y, Math.sqrt(1 - y * y) * Math.sin(angle));
    if (n.z > .4) continue;
    const point = new THREE.Vector3(n.x * scale[0], n.y * scale[1], n.z * scale[2]).add(new THREE.Vector3(...center));
    const tangent = new THREE.Vector3(n.z, 0, -n.x).normalize().multiplyScalar(.006 + random() * .004);
    const tip = point.clone().addScaledVector(n, .018 + random() * .015).add(new THREE.Vector3(0, -.009, -.006));
    vertices.push(...point.clone().sub(tangent).toArray(), ...point.clone().add(tangent).toArray(), ...tip.toArray());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals(); w.add(geometry, color);
}

export function makeMao() {
  const w = workshop();
  const coat = '#b77d3d', pale = '#d9ab68', stripe = '#78532f', chin = '#e2cfab';
  const bodyCoat = (x, y, z) => {
    const amount = THREE.MathUtils.smoothstep(Math.sin(z * 11 + Math.sin(y * 4) * 1.4 + Math.abs(x) * 3), .68, .96) * THREE.MathUtils.smoothstep(Math.abs(x), .25, .5) * .65;
    return new THREE.Color(coat).lerp(new THREE.Color(stripe), amount);
  };
  // A crouched domestic cat: low shoulders, slender legs and a genuinely round face.
  w.sphere(bodyCoat, [0, .83, -.38], [.58, .58, 1.03], [0, 0, 0], 48);
  w.sphere(pale, [0, .78, .4], [.51, .57, .59], [0, 0, 0], 32);
  for (const side of [-1, 1]) {
    w.sphere(coat, [side * .42, .45, .5], [.17, .46, .18]);
    w.sphere(pale, [side * .42, .12, .66], [.205, .13, .28]);
    w.sphere(coat, [side * .48, .49, -.98], [.28, .43, .36], [0, 0, side * .15]);
    w.sphere(pale, [side * .48, .13, -.86], [.22, .13, .29]);
    for (let i = 0; i < 3; i++) w.tube(stripe, [[side * .37, .62 + i * .12, .61], [side * .49, .62 + i * .12, .58]], .018);
  }
  w.section('tail', [0, .68, -1.12]);
  w.tube(coat, [[0, .68, -1.1], [.38, .58, -1.44], [.78, .25, -1.62], [1.05, .13, -1.45], [1.18, .15, -1.09]], .105);
  w.sphere(stripe, [1.17, .15, -1.09], [.12, .11, .14]);
  w.section('head', [0, 1.35, .67]);
  w.sphere((x,y,z)=>{
    const c = new THREE.Color(pale).lerp(new THREE.Color(coat), THREE.MathUtils.smoothstep(y,1.6,2.05)*.65);
    const marking = THREE.MathUtils.smoothstep(Math.cos(x*26+Math.sin(y*6)*.5),.7,.97)*THREE.MathUtils.smoothstep(y,1.81,2.02)*THREE.MathUtils.smoothstep(z,.95,1.15);
    return c.lerp(new THREE.Color(stripe),marking*.7);
  }, [0, 1.47, .77], [.79, .65, .64], [0, 0, 0], 48);
  // Ears turn outwards and sit low; their shape must not read as Garfield triangles.
  for (const side of [-1, 1]) {
    w.shape(coat, [[-.23, -.08], [.23, -.08], [0, .3]], .09, [side * .62, 1.88, .57], [.22, side * .2, side * -.9], .055);
    w.shape('#a77e71', [[-.12, -.04], [.12, -.04], [0, .18]], .018, [side * .65, 1.92, .65], [.22, side * .2, side * -.9], .025);
    w.sphere('#6d5738', [side * .34, 1.66, 1.325], [.195, .166, .063], [0, 0, side * -.06]);
    w.sphere('#9c8151', [side * .34, 1.66, 1.378], [.162, .138, .036]);
    w.sphere('#201c15', [side * .34, 1.66, 1.411], [.071, .114, .021]);
    w.sphere('#fff1cf', [side * .318, 1.71, 1.432], [.024, .032, .009]);
    w.tube('#9f7f4b', [[side * .17, 1.75, 1.34], [side * .35, 1.825, 1.30], [side * .50, 1.75, 1.28]], .019);
    w.sphere(chin, [side * .22, 1.24, 1.36], [.235, .15, .17]);
    w.tube(stripe, [[side * .58, 1.58, 1.21], [side * .66, 1.5, 1.19], [side * .7, 1.42, 1.13]], .022);
    w.tube(stripe, [[side * .58, 1.43, 1.23], [side * .67, 1.35, 1.15]], .025);
  }
  // A deep open hiss mouth, lower jaw, tongue, and visible canine teeth.
  w.sphere('#462b27', [0, 1.07, 1.37], [.268, .29, .11]);
  w.sphere('#241b1a', [0, 1.08, 1.447], [.215, .24, .039]);
  w.sphere(chin, [0, .83, 1.37], [.285, .105, .14]);
  w.sphere('#bf797b', [0, .93, 1.49], [.105, .074, .025]);
  w.sphere('#9c665a', [0, 1.39, 1.502], [.083, .055, .045]);
  for (const side of [-1, 1]) {
    w.shape('#eee4cb', [[-.038, .04], [.042, .04], [.008, -.14]], .035, [side * .16, 1.22, 1.474], [0, 0, side * .15], .01);
    for (let i = 0; i < 3; i++) w.tube('#e8ddc4', [[side * .3, 1.28 - i * .055, 1.475], [side * .66, 1.27 - i * .035, 1.56], [side * .95, 1.35 - i * .1, 1.49]], .0045);
  }
  fur(w, [0, 1.47, .77], [.79, .65, .64], 680, pale, 29);
  w.section('body', [0, 0, 0]);
  fur(w, [0, .83, -.38], [.58, .58, 1.03], 500, coat, 103);
  return w.finish();
}

function awMark(w, center, size) {
  const [x, y, z] = center;
  const point = (a, b) => [x + a * size, y + b * size, z];
  for (const points of [[[-.52, -.36], [-.32, .45], [.16, -.12]], [[-.63, -.13], [.24, .3]], [[-.1, .2], [.2, -.34], [.65, .42]], [[.2, -.34], [.53, -.1]]]) w.tube('#e2e4de', points.map(p => point(...p)), size * .028);
}

export function makeJiahao() {
  const w = workshop(); const black = '#101416', fold = '#1b2022', skin = '#c7a181';
  for (const side of [-1, 1]) {
    w.lathe(black, [[0, 0], [.14, .0], [.16, .3], [.18, .72], [.22, 1.32], [.18, 1.5], [0, 1.54]], [side * .23, .16, 0], [1, 1, .9]);
    w.box('#b8b9af', [side * .23, .095, .12], [.34, .13, .64], [0, side * -.04, 0], .035);
    w.box(black, [side * .23, .18, .11], [.32, .2, .57], [0, side * -.04, 0], .05);
  }
  w.lathe(black, [[0, 0], [.39, .0], [.42, .15], [.44, .62], [.5, 1.04], [.36, 1.23], [0, 1.26]], [0, 1.43, 0], [1, 1, .69]);
  for (const side of [-1, 1]) {
    w.tube(fold, [[side * .44, 2.48, 0], [side * .62, 2.2, .08], [side * .6, 1.94, .36]], .148);
    w.sphere(skin, [side * .52, 1.95, .51], [.105, .15, .12]);
    for (let i = 0; i < 3; i++) w.rod(skin, [side * .48 + i * .035, 1.96, .57], [side * .48 + i * .035, 1.83, .61], .022);
    w.tube('#32393a', [[side * .22, 1.5, .29], [side * .3, 1.93, .3], [side * .25, 2.38, .3]], .012);
    w.tube('#d0d3cc', [[side * .13, 2.7, .31], [side * .17, 2.27, .34], [side * .12, 1.99, .35]], .009);
  }
  awMark(w, [0, 2.27, .331], .43);
  w.box('#181e1f', [0, 1.88, .52], [.96, .10, .39], [.18, 0, 0], .025);
  for (let i = 0; i < 6; i++) w.box(i % 2 ? '#9db69e' : '#8f8c76', [-.34 + i * .135, 1.95, .6], [.075, .018, .09], [.18, 0, 0], .006);
  w.section('head', [0, 2.9, 0]);
  w.sphere(black, [0, 3.06, -.035], [.43, .6, .37], [.03, 0, 0], 36);
  w.sphere('#060a0c', [0, 3.07, .29], [.36, .46, .14], [0, 0, 0], 32);
  w.sphere(skin, [0, 3.13, .405], [.275, .28, .055], [0, 0, 0], 32);
  w.sphere('#17191a', [0, 2.96, .46], [.295, .21, .055], [0, 0, 0], 32);
  awMark(w, [0, 2.94, .519], .32);
  for (const side of [-1, 1]) {
    w.sphere('#493c30', [side * .115, 3.185, .457], [.073, .017, .011]);
    w.sphere('#15191a', [side * .12, 3.185, .467], [.022, .017, .009]);
    w.tube('#232321', [[side * .049, 3.249, .435], [side * .19, 3.25, .418]], .015);
  }
  for (let i = 0; i < 9; i++) {
    const x = -.21 + i * .052;
    w.tube('#151918', [[x, 3.42, .32], [x + .01, 3.32, .423], [x - .015, 3.275 + .025 * Math.sin(i), .444]], .013);
  }
  w.tube(fold, [[-.32, 2.7, .26], [-.38, 3.05, .3], [-.27, 3.44, .28], [0, 3.6, .22], [.27, 3.44, .28], [.38, 3.05, .3], [.32, 2.7, .26]], .043);
  w.tube('#e0e1d5', [[-.26, 3.07, .42], [-.32, 2.87, .4], [-.2, 2.47, .35], [0, 2.1, .36], [.15, 1.82, .36]], .007);
  return w.finish();
}

export function makeKun() {
  const w = workshop(); const white = '#e4e4dc', feather = '#cdd0c9', pants = '#282c2f', beak = '#c9973c';
  for (const side of [-1, 1]) {
    w.rod(beak, [side * .25, .21, .03], [side * .28, .83, -.08], .052);
    w.rod('#c08d38', [side * .28, .83, -.08], [side * .27, 1.12, .1], .085);
    for (const toe of [-1, 0, 1]) w.tube(beak, [[side * .25, .17, .04], [side * .25 + toe * .1, .08, .3], [side * .25 + toe * .15, .06, .48 - Math.abs(toe) * .05]], .034);
    w.tube(beak, [[side * .25, .15, .04], [side * .25 + side * .06, .065, -.19]], .031);
  }
  w.sphere(pants, [0, 1.35, -.02], [.5, .66, .39], [0, 0, 0], 32);
  w.sphere(white, [0, 1.84, .0], [.43, .59, .32], [0, 0, 0], 32);
  w.box(pants, [0, 1.61, .3], [.6, .54, .08], [0, 0, 0], .06);
  for (const side of [-1, 1]) {
    w.tube('#d3d3c8', [[side * .26, 1.49, .36], [side * .28, 1.94, .3], [side * .3, 2.21, .02], [side * .27, 1.55, -.29]], .031);
    w.sphere('#a39266', [side * .26, 1.7, .397], [.045, .045, .018]);
    w.sphere(white, [side * .49, 1.81, -.01], [.19, .49, .2], [0, 0, side * .22]);
    for (let i = 0; i < 3; i++) w.sphere(i % 2 ? white : feather, [side * (.49 + i * .055), 1.55 - i * .08, .10 + i * .03], [.09, .29, .09], [0, 0, side * -.3]);
  }
  w.section('head', [0, 2.3, 0]);
  w.sphere(white, [0, 2.65, .04], [.425, .52, .36], [0, 0, 0], 36);
  for (const side of [-1, 1]) {
    w.sphere('#c6b780', [side * .22, 2.7, .36], [.1, .118, .044]);
    w.sphere('#352f20', [side * .22, 2.7, .4], [.05, .079, .02]);
    w.sphere('#e9e5d9', [side * .2, 2.73, .418], [.017, .023, .007]);
    w.tube('#52524d', [[side * .11, 2.85, .35], [side * .3, 2.84, .29]], .017);
  }
  const beakGeometry = new THREE.BufferGeometry();
  beakGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.22,2.49,.36, .22,2.49,.36, 0,2.46,.79,
    -.22,2.49,.36, 0,2.46,.79, -.15,2.62,.37,
    .22,2.49,.36, .15,2.62,.37, 0,2.46,.79,
    -.15,2.62,.37, 0,2.46,.79, .15,2.62,.37,
    -.22,2.49,.36, -.15,2.62,.37, .15,2.62,.37,
    -.22,2.49,.36, .15,2.62,.37, .22,2.49,.36
  ],3));
  beakGeometry.computeVertexNormals();w.add(beakGeometry,beak);
  w.sphere('#bc8b3b', [0,2.455,.45], [.15,.045,.23]);
  // Centre-parted, swept curtains rather than two round cartoon hair buns.
  for (const side of [-1, 1]) {
    w.sphere('#444744', [side * .22, 3.03, .01], [.28, .24, .39], [.18, 0, side * -.28], 32);
    for (let i = 0; i < 5; i++) {
      const x = side * (.05 + i * .048);
      w.tube(i % 2 ? '#62655f' : '#464a46', [[x * .6, 3.2, -.03], [x, 3.15, .24], [side * (.25 + i * .022), 2.98 - i * .025, .366]], .022);
    }
    w.sphere('#424644', [side * .39, 2.93, -.02], [.12, .24, .29], [0, 0, side * .26]);
  }
  w.section('ball', [.81, 1.38, .18]);
  const center = [.81, 1.38, .18], radius = .35;
  w.sphere('#bb632f', center, [radius, radius, radius], [0, 0, 0], 32);
  for (const axis of [0, 1, 2]) {
    const points = [];
    for (let i = 0; i <= 36; i++) {
      const a = i / 36 * Math.PI * 2, p = [0, 0, 0];
      p[(axis + 1) % 3] = Math.cos(a) * (radius + .003); p[(axis + 2) % 3] = Math.sin(a) * (radius + .003);
      points.push(p.map((v, j) => v + center[j]));
    }
    w.tube('#463628', points, .009, true);
  }
  return w.finish();
}
