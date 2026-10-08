import { Container, Graphics } from "pixi.js";

const INK = 0xffdfb3;
const clamp = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => { const t = clamp(n); return t * t * (3 - 2 * t); };

// All troop artwork is unfilled linework. Parts are drawn once and animated at their joints.
function line(parent, draw, width = 2.4, opacity = 1) {
  const graphic = new Graphics();
  draw(graphic);
  graphic.stroke({ color: INK, width, alpha: opacity, cap: "round", join: "round" });
  parent.addChild(graphic);
  return graphic;
}
function group(parent, x = 0, y = 0) {
  const part = new Container();
  part.position.set(x, y);
  parent.addChild(part);
  return part;
}

// A coherent equipment roster, rather than random accessories on copies of one soldier.
const RIDERS = [
  { helm: "crest", weapon: "halberd", cape: 78, saddle: "diamond", mane: 0, general: true, delay: 0 },
  { helm: "wing", weapon: "sabre", cape: 35, saddle: "bands", mane: 1, delay: .06 },
  { helm: "wrap", weapon: "bow", cape: 0, saddle: "diamond", mane: 2, delay: .035 },
  { helm: "cone", weapon: "banner", cape: 42, saddle: "bands", mane: 3, delay: .05 },
  { helm: "guard", weapon: "shield", cape: 0, saddle: "scales", mane: 4, delay: .012 },
  { helm: "brush", weapon: "halberd", cape: 50, saddle: "scales", mane: 5, delay: .025 },
  { helm: "round", weapon: "sabre", cape: 28, saddle: "bands", mane: 6, delay: .045 },
  { helm: "split", weapon: "spear", cape: 38, saddle: "diamond", mane: 7, delay: .015 },
];

// The drawing and table movement share the same order, stance and charge timing.
export function getCavalryMotion(progress, index = 0) {
  const start = .43 + RIDERS[index % RIDERS.length].delay;
  const swing = smooth((progress - .17) / .20);
  const charge = clamp((progress - start) / (1 - start));
  const lean = smooth((progress - start + .035) / .08);
  return { swing, charge, lean, travel: charge ** 1.65 * 1.75, start };
}
function helmet(parent, style) {
  line(parent, (g) => g.moveTo(-10, -79).quadraticCurveTo(-12, -96, 5, -97).quadraticCurveTo(20, -96, 20, -82).lineTo(10, -81).lineTo(5, -74).lineTo(-9, -75).closePath(), 2);
  if (style === "wrap") {
    line(parent, (g) => g.moveTo(-10, -85).lineTo(18, -88).moveTo(-10, -82).lineTo(-29, -80).lineTo(-39, -86).moveTo(-10, -80).lineTo(-32, -73), 1.8);
  } else if (style === "wing") {
    line(parent, (g) => g.moveTo(-9, -89).lineTo(-24, -104).lineTo(-22, -88).lineTo(-10, -80).moveTo(-19, -95).lineTo(-12, -84), 2);
  } else if (style === "cone") {
    line(parent, (g) => g.moveTo(-10, -93).lineTo(4, -114).lineTo(18, -93).moveTo(4, -111).lineTo(4, -98), 2);
  } else if (style === "guard") {
    line(parent, (g) => g.moveTo(-8, -78).lineTo(-8, -62).lineTo(1, -66).lineTo(5, -75).moveTo(14, -83).lineTo(18, -69), 2);
  } else if (style === "brush" || style === "crest") {
    line(parent, (g) => g.moveTo(1, -97).quadraticCurveTo(-4, -117, -28, -113).quadraticCurveTo(-25, -100, -42, -101).quadraticCurveTo(-17, -91, 2, -97), 2);
    if (style === "brush") line(parent, (g) => g.moveTo(-3, -106).lineTo(-28, -108).moveTo(-7, -102).lineTo(-35, -102), 1.2);
  } else if (style === "split") {
    line(parent, (g) => g.moveTo(-4, -96).quadraticCurveTo(-16, -115, -12, -127).quadraticCurveTo(4, -116, 3, -97).moveTo(3, -98).quadraticCurveTo(6, -119, 17, -120).lineTo(10, -97), 1.8);
  } else {
    line(parent, (g) => g.moveTo(-7, -91).quadraticCurveTo(7, -101, 15, -90).moveTo(-10, -82).lineTo(-15, -70), 1.7);
  }
}
function cavalryWeapon(parent, kind) {
  const weapon = group(parent, 43, -49);
  let flag;
  if (kind === "spear" || kind === "halberd") {
    line(weapon, (g) => g.moveTo(-17, 5).lineTo(132, -31).moveTo(130, -30).lineTo(145, -40).lineTo(154, -37).lineTo(135, -25).closePath(), 2.3);
    if (kind === "halberd") line(weapon, (g) => g.moveTo(112, -28).quadraticCurveTo(107, -50, 129, -55).lineTo(133, -46).quadraticCurveTo(116, -45, 120, -29), 2.1);
  } else if (kind === "banner") {
    line(weapon, (g) => g.moveTo(-4, 18).lineTo(29, -111).lineTo(33, -122).lineTo(37, -110).lineTo(31, -108), 2.2);
    flag = group(weapon, 26, -105);
    line(flag, (g) => g.moveTo(0, 0).bezierCurveTo(-21, -4, -34, 11, -62, 3).lineTo(-52, 18).lineTo(-61, 31).bezierCurveTo(-34, 36, -16, 17, -5, 23), 2);
    line(flag, (g) => g.moveTo(-27, 9).lineTo(-21, 17).lineTo(-29, 25).lineTo(-36, 17).closePath(), 1.4);
  } else if (kind === "bow") {
    line(weapon, (g) => g.moveTo(15, -42).quadraticCurveTo(51, -17, 32, 26).moveTo(15, -42).lineTo(2, -3).lineTo(32, 26).moveTo(2, -3).lineTo(87, -15).lineTo(79, -20).moveTo(87, -15).lineTo(80, -10), 2.2);
  } else {
    line(weapon, (g) => g.moveTo(-4, 5).lineTo(9, -5).moveTo(3, 0).quadraticCurveTo(25, -47, 64, -67).quadraticCurveTo(56, -32, 13, 3).closePath().moveTo(16, -8).quadraticCurveTo(36, -38, 58, -55), 2.3);
  }
  return { part: weapon, flag };
}
function horseLeg(parent, x, y, far) {
  const upper = group(parent, x, y);
  upper.alpha = far ? .46 : 1;
  line(upper, (g) => g.moveTo(-6, 0).quadraticCurveTo(-2, 18, -4, 27).lineTo(5, 28).quadraticCurveTo(10, 11, 7, 0), 2);
  const knee = group(upper, 1, 26);
  line(knee, (g) => g.moveTo(-4, 1).lineTo(-5, 29).lineTo(-9, 35).lineTo(8, 36).lineTo(12, 30).lineTo(3, 26).lineTo(4, 1), 2);
  return { upper, knee };
}
function horse(index) {
  const actor = new Container();
  const profile = RIDERS[index % RIDERS.length];
  const tail = group(actor, -65, -7);
  line(tail, (g) => g.moveTo(0, 0).quadraticCurveTo(-20, 16, -42, 5).quadraticCurveTo(-20, 36, 4, 13).moveTo(-5, 7).quadraticCurveTo(-20, 23, -32, 13), 2);
  const legs = [horseLeg(actor, -48, 13, true), horseLeg(actor, 36, 13, true)];
  line(actor, (g) => g.moveTo(48, 17).bezierCurveTo(18, 26, -6, 16, -33, 17).bezierCurveTo(-63, 31, -84, -5, -58, -22).bezierCurveTo(-34, -33, 4, -21, 24, -22).bezierCurveTo(35, -39, 39, -62, 58, -71).lineTo(70, -52).bezierCurveTo(53, -32, 59, 4, 48, 17).closePath(), 2.7);
  line(actor, (g) => g.moveTo(-55, -16).quadraticCurveTo(-35, -12, -41, 6).moveTo(36, -17).quadraticCurveTo(31, 1, 44, 10), 1.4, .65);
  const head = group(actor, 60, -64);
  line(head, (g) => g.moveTo(-5, -5).lineTo(-3, -20).lineTo(4, -13).lineTo(10, -23).lineTo(14, -8).quadraticCurveTo(28, -1, 30, 8).lineTo(43, 15).quadraticCurveTo(46, 26, 34, 24).lineTo(18, 12).lineTo(3, 11).lineTo(-5, -5), 2.5);
  line(head, (g) => g.moveTo(11, 3).lineTo(16, 2).moveTo(36, 17).lineTo(39, 18).moveTo(27, 8).lineTo(22, 18).moveTo(4, 11).lineTo(33, 19), 1.5);
  line(actor, (g) => {
    const teeth = 4 + profile.mane % 3;
    g.moveTo(54, -70);
    for (let n = 0; n < teeth; n++) g.lineTo(40 - n * 2, -63 + n * 7).lineTo(47 - n * 2, -58 + n * 7);
  }, 1.6);
  legs.push(horseLeg(actor, -57, 14, false), horseLeg(actor, 33, 14, false));
  line(actor, (g) => g.moveTo(-27, -22).lineTo(12, -21).lineTo(22, 6).lineTo(-8, 14).lineTo(-34, 4).closePath().moveTo(-18, -25).lineTo(8, -25).lineTo(11, -18).lineTo(-21, -17).closePath(), 2);
  if (profile.saddle === "diamond") line(actor, (g) => g.poly([-9, -9, -2, -2, -8, 5, -15, -1], true), 1.4);
  else if (profile.saddle === "bands") line(actor, (g) => g.moveTo(-24, -8).lineTo(12, -8).moveTo(-20, 0).lineTo(14, 0), 1.4);
  else line(actor, (g) => g.moveTo(-24, -10).lineTo(-18, -2).lineTo(-12, -10).lineTo(-6, -2).lineTo(0, -10).lineTo(6, -2), 1.4);
  const rider = group(actor, -6, -17);
  const cape = group(rider, -14, -58);
  if (profile.cape) line(cape, (g) => g.moveTo(0, 0).quadraticCurveTo(-19, 2, -profile.cape, -9).lineTo(-profile.cape + 9, 7).lineTo(-profile.cape - 4, 16).quadraticCurveTo(-24, 23, 0, 10).moveTo(-5, 7).lineTo(-profile.cape + 13, 9), 2);
  line(rider, (g) => g.moveTo(-11, -65).lineTo(14, -64).lineTo(26, -31).lineTo(9, -23).lineTo(-14, -29).lineTo(-19, -52).closePath().moveTo(-12, -27).lineTo(10, -23).lineTo(16, 15).lineTo(28, 21).lineTo(27, 27).lineTo(7, 24).lineTo(0, -9).lineTo(-16, -1), 2.3);
  line(rider, (g) => g.moveTo(-12, -50).lineTo(20, -47).moveTo(-10, -41).lineTo(22, -38).moveTo(-11, -31).lineTo(10, -29).moveTo(-17, -59).lineTo(-3, -67).lineTo(3, -55).lineTo(-12, -50), 1.4);
  line(rider, (g) => g.moveTo(-7, -77).lineTo(11, -80).lineTo(19, -71).lineTo(15, -65).lineTo(3, -64).lineTo(-5, -70).moveTo(9, -72).lineTo(14, -73), 1.9);
  helmet(rider, profile.helm);
  if (profile.general) {
    line(rider, (g) => g.moveTo(-22, -57).lineTo(-19, -73).lineTo(-4, -77).lineTo(9, -66).lineTo(5, -55).lineTo(-8, -54).closePath().moveTo(-18, -67).lineTo(-5, -68).lineTo(3, -62), 2.3);
  }
  const arm = group(rider, 17, -57);
  line(arm, (g) => g.moveTo(0, 0).lineTo(16, 15).lineTo(26, 8).moveTo(-5, 4).lineTo(11, 22).lineTo(27, 14), 2.2);
  const weapon = cavalryWeapon(arm, profile.weapon);
  weapon.part.position.set(26, 8);
  if (profile.general) weapon.part.scale.set(.85);
  const commandArc = profile.general ? line(rider, (g) => g.moveTo(48, -235).bezierCurveTo(159, -251, 233, -148, 225, -62).moveTo(62, -226).bezierCurveTo(156, -234, 218, -139, 214, -75), 2) : null;
  if (profile.weapon === "shield") line(rider, (g) => g.moveTo(-15, -56).lineTo(6, -54).lineTo(4, -28).lineTo(-5, -17).lineTo(-20, -27).closePath().moveTo(-8, -47).lineTo(-7, -29).moveTo(-16, -38).lineTo(0, -36), 2.3);
  line(actor, (g) => g.moveTo(22, -67).quadraticCurveTo(48, -32, 75, -50), 1.3, .7);
  return { container: actor, animate(ms, progress) {
    const motion = getCavalryMotion(progress, index);
    const strideStrength = smooth((progress - motion.start) / .055);
    const runTime = progress > 0 ? ms * Math.max(0, progress - motion.start) / progress : 0;
    const t = runTime / (96 + index * 2) + motion.charge ** 2 * 10 + index * 1.73;
    legs.forEach(({ upper, knee }, n) => {
      const stride = t + [0, 2.3, 3.2, 5.1][n];
      upper.rotation = Math.sin(stride) * .94 * strideStrength + (n % 2 ? -.1 : .1);
      knee.rotation = Math.max(0, Math.sin(stride + 1.1)) * 1.35 * strideStrength - .12;
    });
    rider.position.set(-6 + motion.lean * 8, -17 + motion.lean * 13 + Math.sin(t * 2) * 2 * strideStrength);
    rider.rotation = .04 + motion.lean * .5 + Math.sin(t) * .024 * strideStrength;
    arm.rotation = profile.general ? -1.24 + motion.swing * 1.38 - motion.lean * .64 : -motion.lean * .48;
    cape.rotation = -rider.rotation * .6 + Math.sin(t * .8) * .1 * strideStrength;
    cape.scale.x = 1 + motion.lean * .15;
    head.rotation = motion.lean * .16 + Math.sin(t * 2) * .04 * strideStrength;
    tail.rotation = -.18 - motion.lean * .24 + Math.sin(t) * .1 * strideStrength;
    weapon.part.rotation = -.03 + Math.sin(t) * .035 * strideStrength;
    if (weapon.flag) weapon.flag.scale.y = .9 + Math.sin(t * 1.2) * .1 * strideStrength;
    if (commandArc) commandArc.alpha = progress > .17 && progress < .41 ? Math.sin(clamp((progress - .17) / .24) * Math.PI) * .55 : 0;
    actor.pivot.y = Math.cos(t * 2) * 2.5 * strideStrength;
  } };
}

function stompLeg(parent, x, y, far = false) {
  const upper = group(parent, x, y);
  upper.alpha = far ? .58 : 1;
  line(upper, (g) => g.moveTo(-16, -5).quadraticCurveTo(-18, 21, -12, 41).lineTo(13, 41).quadraticCurveTo(21, 18, 16, -4), 3.4);
  const knee = group(upper, 0, 39);
  line(knee, (g) => g.moveTo(-12, 0).lineTo(-15, 42).quadraticCurveTo(-23, 55, -14, 61).lineTo(23, 61).quadraticCurveTo(31, 55, 19, 45).lineTo(13, 0), 3.4);
  line(knee, (g) => g.moveTo(-12, 49).lineTo(18, 49).moveTo(-9, 52).lineTo(-9, 60).moveTo(1, 52).lineTo(1, 61).moveTo(11, 52).lineTo(11, 61), 1.7);
  return { upper, knee };
}
function elephant() {
  const actor = new Container();
  const mass = group(actor);
  const mounted = barbarian(0, true);
  mounted.container.position.set(-62, -42);
  mounted.container.scale.set(.82);
  mass.addChild(mounted.container);
  const backFar = stompLeg(mass, -99, -6, true);
  const far = stompLeg(mass, 55, -6, true);
  // Exposed back and belly contours stop at the ear and leg seams.
  line(mass, (g) => g.moveTo(-164, -60).quadraticCurveTo(-92, -77, -7, -66).moveTo(-164, -60).bezierCurveTo(-197, -47, -188, 5, -166, 26).moveTo(-113, 31).quadraticCurveTo(-39, 46, 35, 23), 4);
  line(mass, (g) => g.moveTo(-181, -42).quadraticCurveTo(-201, -28, -199, -7).lineTo(-193, 1).moveTo(-133, -49).quadraticCurveTo(-128, -31, -138, -17), 2, .7);
  const back = stompLeg(mass, -141, -3);
  const near = stompLeg(mass, 91, -3);
  const face = group(mass, 94, -84);
  const ear = group(face, -8, 1);
  line(ear, (g) => g.moveTo(-15, -16).bezierCurveTo(-70, -52, -87, -5, -72, 36).quadraticCurveTo(-49, 73, -18, 48).quadraticCurveTo(9, 27, -15, -16), 4);
  line(ear, (g) => g.moveTo(-23, -7).quadraticCurveTo(-61, -29, -63, 14).quadraticCurveTo(-59, 42, -33, 38), 1.9, .7);
  line(face, (g) => g.moveTo(-9, -45).quadraticCurveTo(34, -72, 64, -40).quadraticCurveTo(82, -20, 72, 7).lineTo(63, 15).moveTo(59, 22).quadraticCurveTo(46, 44, 18, 43), 4);
  line(face, (g) => g.moveTo(39, -28).lineTo(58, -23).lineTo(47, -18).moveTo(10, -41).quadraticCurveTo(25, -49, 37, -43), 2.3);
  const trunk = group(mass, 154, -66);
  line(trunk, (g) => g.moveTo(0, 0).quadraticCurveTo(30, 8, 24, 44).quadraticCurveTo(20, 87, 59, 66).quadraticCurveTo(80, 49, 75, 25).quadraticCurveTo(105, 34, 87, 76).quadraticCurveTo(55, 127, 18, 97).quadraticCurveTo(-7, 81, -7, 33), 3.8);
  line(trunk, (g) => g.moveTo(1, 25).lineTo(16, 28).moveTo(0, 39).lineTo(16, 43).moveTo(2, 54).lineTo(19, 57).moveTo(6, 69).lineTo(25, 70), 1.8, .7);
  line(mass, (g) => g.moveTo(137, -34).quadraticCurveTo(169, -13, 207, -25).quadraticCurveTo(194, 5, 136, -15), 2.5, .6);
  line(mass, (g) => g.moveTo(145, -51).quadraticCurveTo(192, -28, 244, -51).quadraticCurveTo(228, -7, 143, -31), 3.6);
  return { container: actor, animate(ms, p) {
    const lift = p < .44 ? smooth((p - .09) / .25) : 1 - smooth((p - .44) / .115);
    const impact = p > .555 ? Math.exp(-(p - .555) * 22) : 0;
    near.upper.rotation = -lift * 1.2;
    near.knee.rotation = -lift * .45;
    far.upper.rotation = -lift * .94;
    far.knee.rotation = -lift * .34;
    back.upper.rotation = lift * .13;
    backFar.upper.rotation = lift * .08;
    mass.rotation = -lift * .055;
    mass.y = -lift * 8 + Math.sin((p - .555) * 80) * impact * 5;
    trunk.rotation = -.12 * lift + Math.sin(ms / 160) * .035 + impact * .09;
    ear.rotation = lift * .08 - impact * .03;
    mounted.animate(ms, p);
  } };
}
function barbarian(index, mounted = false) {
  const actor = new Container();
  const torso = group(actor);
  const arm = group(torso, 24, -99);
  // The blade follows shoulder and elbow rotation, rather than moving independently of the hand.
  line(arm, (g) => g.moveTo(-8, -4).quadraticCurveTo(-13, 18, -6, 34).lineTo(8, 34).quadraticCurveTo(15, 16, 8, -4), 2.8);
  const elbow = group(arm, 1, 32);
  line(elbow, (g) => g.moveTo(-6, 0).lineTo(-7, 27).quadraticCurveTo(-12, 34, -4, 39).lineTo(8, 37).lineTo(7, 0), 2.6);
  const blade = group(elbow, 0, 32);
  blade.label = "cutlass";
  // The clockwise downstroke leads on local -X; the curved cutting edge faces that side.
  blade.scale.x = -1;
  line(blade, (g) => g.moveTo(-4, 0).lineTo(-4, 18).lineTo(5, 18).lineTo(5, 0).moveTo(-14, 18).lineTo(16, 18).moveTo(-5, 20).lineTo(-7, 111).lineTo(11, 132).bezierCurveTo(40, 102, 49, 52, 12, 21).closePath().moveTo(11, 31).quadraticCurveTo(31, 78, 9, 117), 3);
  line(torso, (g) => g.moveTo(-30, -91).quadraticCurveTo(-21, -110, -7, -107).lineTo(9, -106).quadraticCurveTo(22, -111, 31, -95).moveTo(-29, -92).lineTo(-23, -54).lineTo(-18, -39).lineTo(20, -39).lineTo(28, -87).moveTo(-21, -84).lineTo(-5, -80).lineTo(2, -84).lineTo(21, -79).moveTo(1, -76).lineTo(1, -50), 2.9);
  line(torso, (g) => g.moveTo(-28, -91).lineTo(-45, -60).lineTo(-30, -47).lineTo(-21, -60).moveTo(-20, -98).lineTo(18, -49).moveTo(-18, -47).lineTo(22, -48).lineTo(22, -36).lineTo(-21, -36).closePath(), 2.3);
  if (mounted) line(torso, (g) => g.moveTo(-18, -34).lineTo(-32, -6).lineTo(-16, 15).lineTo(-3, 17).lineTo(0, 24).lineTo(-20, 25).lineTo(-45, -3).lineTo(-30, -31).moveTo(15, -34).lineTo(34, -13).lineTo(25, 16).lineTo(35, 22).lineTo(34, 28).lineTo(12, 26).lineTo(18, -8).lineTo(3, -21), 2.7);
  else line(torso, (g) => g.moveTo(-18, -34).lineTo(-27, -7).lineTo(-43, 26).lineTo(-50, 29).lineTo(-51, 36).lineTo(-30, 36).lineTo(-5, -2).lineTo(3, -7).lineTo(15, 27).lineTo(29, 34).lineTo(31, 40).lineTo(12, 40).lineTo(-3, 24).lineTo(-8, 7).moveTo(-23, -29).lineTo(-12, -20).lineTo(-2, -28).lineTo(7, -20).lineTo(21, -28), 2.7);
  line(torso, (g) => g.moveTo(-11, -119).lineTo(-13, -139).quadraticCurveTo(4, -153, 19, -137).lineTo(20, -126).lineTo(26, -122).lineTo(20, -116).lineTo(8, -114).lineTo(-11, -119).moveTo(9, -130).lineTo(16, -129).moveTo(10, -122).lineTo(17, -121), 2.4);
  if (index === 0) {
    line(torso, (g) => g.moveTo(-14, -136).lineTo(19, -139).moveTo(-12, -136).quadraticCurveTo(-34, -139, -43, -128).moveTo(-9, -141).lineTo(-3, -159).lineTo(6, -150).lineTo(14, -155).lineTo(20, -140).moveTo(9, -127).lineTo(6, -119), 2.1);
  } else {
    line(torso, (g) => g.moveTo(-11, -140).lineTo(-23, -145).lineTo(-14, -154).lineTo(1, -150).lineTo(10, -157).lineTo(22, -143).moveTo(-10, -119).lineTo(-3, -105).lineTo(8, -110).lineTo(16, -104).lineTo(20, -118).moveTo(-27, -101).lineTo(-40, -105).lineTo(-35, -88).lineTo(-44, -90).lineTo(-28, -74), 2.1);
  }
  const slash = line(actor, (g) => g.moveTo(63, -242).bezierCurveTo(169, -199, 190, -58, 92, 8).moveTo(78, -231).bezierCurveTo(151, -180, 159, -76, 85, -12), 2.8);
  return { container: actor, animate(ms, p) {
    const lift = smooth((p - .08) / .28);
    const strike = smooth((p - .435 - index * .022) / .12);
    arm.rotation = -.8 - lift * 2.15 + strike * 2.48;
    elbow.rotation = .22 - strike * .4;
    torso.rotation = -.09 * lift + strike * .22;
    torso.y = -lift * 3 + strike * 6;
    slash.alpha = p > .445 + index * .022 && p < .62 + index * .022 ? Math.sin(clamp((p - .445 - index * .022) / .175) * Math.PI) * .65 : 0;
    actor.pivot.y = Math.sin(ms / 180) * (1 - strike) * 1.2;
  } };
}

export function createTroopActor(kind, index = 0) {
  if (kind === "elephant") return elephant();
  if (kind === "barbarian") return barbarian(index);
  return horse(index);
}
