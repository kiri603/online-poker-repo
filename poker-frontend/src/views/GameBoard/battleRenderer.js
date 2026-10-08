import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { createTroopActor, getCavalryMotion } from "./battleTroops.js";

const COLORS = { gold: 0xffd184, jade: 0xa6f2dc, crimson: 0xff764f, muted: 0xd4c6ac };
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const ease = (n) => 1 - (1 - clamp(n)) ** 3;
const alpha = (progress) => clamp(progress * 7) * clamp((1 - progress) * 4);
const random = (min, max) => min + Math.random() * (max - min);

function texture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  return Texture.from(canvas);
}

function createTextures() {
  const smoke = texture(128, 128, (ctx) => {
    // Overlapping soft lobes keep dust and blast smoke irregular rather than a uniform glow.
    for (let i = 0; i < 22; i++) {
      const x = random(29, 99), y = random(29, 99), r = random(14, 29);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(255,255,255,.15)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const bomb = texture(240, 280, (ctx) => {
    ctx.strokeStyle = "#b79d69"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(144, 76); ctx.bezierCurveTo(128, 32, 204, 65, 200, 24); ctx.stroke();
    ctx.strokeStyle = "#4b3521"; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(145 + i * 7, 47); ctx.lineTo(148 + i * 7, 55); ctx.stroke(); }
    ctx.fillStyle = "#7f5b35"; ctx.fillRect(107, 70, 39, 20);
    const metal = ctx.createRadialGradient(81, 120, 4, 131, 163, 102);
    metal.addColorStop(0, "#84908e"); metal.addColorStop(.24, "#494d49"); metal.addColorStop(.65, "#242823"); metal.addColorStop(1, "#080b0a");
    ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(120, 172, 90, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#a99162"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "#b7aa8550"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(120, 172, 77, Math.PI * 1.05, Math.PI * 1.8); ctx.stroke();
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; ctx.fillStyle = "#bc9c63"; ctx.beginPath(); ctx.arc(120 + Math.cos(angle) * 84, 172 + Math.sin(angle) * 84, 2.4, 0, Math.PI * 2); ctx.fill(); }
  });
  const shard = texture(40, 24, (ctx) => {
    ctx.fillStyle = "#c3ab85"; ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(29, 3); ctx.lineTo(38, 14); ctx.lineTo(15, 21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#41403c"; ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(38, 14); ctx.lineTo(15, 21); ctx.closePath(); ctx.fill();
  });
  const glow = texture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,.55)");
    gradient.addColorStop(0.5, "rgba(255,255,255,.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
  const arrow = texture(220, 26, (ctx) => {
    const trail = ctx.createLinearGradient(0, 0, 200, 0);
    trail.addColorStop(0, "rgba(255,210,130,0)");
    trail.addColorStop(1, "rgba(255,210,130,.6)");
    ctx.fillStyle = trail;
    ctx.fillRect(0, 11, 200, 3);
    ctx.strokeStyle = "#be924f";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(110, 13); ctx.lineTo(209, 13); ctx.stroke();
    ctx.fillStyle = "#f4e7cf";
    ctx.beginPath(); ctx.moveTo(220, 13); ctx.lineTo(203, 7); ctx.lineTo(207, 13); ctx.lineTo(203, 19); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b37943";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(123 + i * 5, 13); ctx.lineTo(111 + i * 5, 5); ctx.lineTo(116 + i * 5, 13); ctx.lineTo(111 + i * 5, 21); ctx.closePath(); ctx.fill();
    }
  });
  const shield = texture(240, 280, (ctx) => {
    const fill = ctx.createLinearGradient(0, 0, 220, 220);
    fill.addColorStop(0, "#fddea0"); fill.addColorStop(0.35, "#956332"); fill.addColorStop(0.6, "#382819"); fill.addColorStop(1, "#dbac65");
    const path = () => { ctx.beginPath(); ctx.moveTo(120, 8); ctx.lineTo(224, 46); ctx.lineTo(207, 160); ctx.quadraticCurveTo(190, 220, 120, 270); ctx.quadraticCurveTo(50, 220, 33, 160); ctx.lineTo(16, 46); ctx.closePath(); };
    path(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#ffe4a7"; ctx.stroke();
    ctx.save(); ctx.translate(120, 140); ctx.scale(.78, .78); ctx.translate(-120, -140); path(); ctx.fillStyle = "#36291f"; ctx.fill(); ctx.strokeStyle = "#d9ad6a"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.strokeStyle = "#e5bc78"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(120, 65); ctx.lineTo(155, 115); ctx.lineTo(120, 174); ctx.lineTo(85, 115); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(120, 77); ctx.lineTo(120, 214); ctx.moveTo(65, 108); ctx.lineTo(175, 108); ctx.stroke();
    for (const [x, y] of [[40, 59], [200, 59], [63, 173], [177, 173]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = "#ffe4a7"; ctx.fill(); }
  });
  const sword = texture(320, 80, (ctx) => {
    ctx.fillStyle = "#e4c387"; ctx.fillRect(12, 34, 64, 12);
    ctx.strokeStyle = "#503a27"; ctx.lineWidth = 3;
    for (let x = 20; x < 70; x += 7) { ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x - 4, 46); ctx.stroke(); }
    ctx.fillStyle = "#d5a155"; ctx.fillRect(75, 13, 9, 54);
    const steel = ctx.createLinearGradient(0, 24, 0, 57);
    steel.addColorStop(0, "#dce9ec"); steel.addColorStop(.48, "#768f9b"); steel.addColorStop(.5, "#f7efcf"); steel.addColorStop(1, "#869da1");
    ctx.fillStyle = steel; ctx.beginPath(); ctx.moveTo(84, 25); ctx.lineTo(277, 29); ctx.lineTo(315, 40); ctx.lineTo(277, 53); ctx.lineTo(84, 55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#fff0c2"; ctx.lineWidth = 1; ctx.stroke();
  });
  const grain = texture(24, 44, (ctx) => {
    ctx.strokeStyle = "#edc777"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, 42); ctx.lineTo(12, 4); ctx.stroke();
    ctx.fillStyle = "#ffe4a4";
    for (let y = 9; y < 35; y += 7) for (const sign of [-1, 1]) { ctx.beginPath(); ctx.ellipse(12 + sign * 4, y, 3, 6, sign * .55, 0, Math.PI * 2); ctx.fill(); }
  });
  return { glow, arrow, shield, sword, grain, smoke, bomb, shard };
}

export async function createBattleRenderer(host, getScene, getQuality, getOrigin) {
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, autoStart: false, preference: "webgl", resolution: Math.min(window.devicePixelRatio || 1, 1.5), autoDensity: true });
  host.appendChild(app.canvas);
  const textures = createTextures();
  const performances = new Map();
  const artwork = {};
  let destroyed = false;
  let lastTime = performance.now();
  let averageFrame = 16;
  let slowFrames = 0;
  let adaptiveLite = false;

  await Promise.all(Object.entries({ airplane: "/effects/airplane.webp", explosion: "/effects/explosion.webp", jokerSmall: "/images/JokerSmall.png", jokerBig: "/images/JokerBig.png" }).map(async ([kind, file]) => {
    try { artwork[kind] = await Assets.load(file); }
    catch (error) { console.warn(`Battle artwork unavailable: ${file}`, error); }
  }));

  function addSprite(container, source, { x = 0, y = 0, width = 20, height = width, tint = 0xffffff, opacity = 1, additive = true, rotation = 0 } = {}) {
    const sprite = new Sprite(source);
    sprite.anchor.set(.5);
    sprite.position.set(x, y);
    sprite.width = width;
    sprite.height = height;
    sprite.tint = tint;
    sprite.alpha = opacity;
    sprite.rotation = rotation;
    if (additive) sprite.blendMode = "add";
    container.addChild(sprite);
    return sprite;
  }

  function build(effect) {
    const container = new Container();
    app.stage.addChild(container);
    const scene = getScene();
    const { x, y, width: w, height: h } = scene;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const color = COLORS[effect.tone] || COLORS.gold;
    const lite = getQuality() !== "full" || adaptiveLite;
    const updates = [];
    const addUpdate = (fn) => updates.push(fn);
    const burst = (count, radius, duration = 1, origin = { x: cx, y: cy }) => {
      for (let i = 0; i < count; i++) {
        const angle = random(0, Math.PI * 2);
        const distance = random(radius * .2, radius);
        const size = random(3, 12);
        const particle = addSprite(container, textures.glow, { width: size, tint: color });
        addUpdate((p) => {
          const t = clamp(p / duration);
          particle.position.set(origin.x + Math.cos(angle) * distance * ease(t), origin.y + Math.sin(angle) * distance * ease(t) * .65);
          particle.alpha = (1 - t) ** 2 * .9;
          particle.scale.set(size / 128 * (1 - t * .5));
        });
      }
    };
    const ring = (radius, delay = 0, elliptical = .5) => {
      const graphic = new Graphics();
      graphic.ellipse(0, 0, radius, radius * elliptical).stroke({ color, width: 2, alpha: .85 });
      graphic.blendMode = "add";
      graphic.position.set(cx, cy);
      container.addChild(graphic);
      addUpdate((p) => { const t = clamp((p - delay) / (1 - delay)); graphic.scale.set(.12 + ease(t) * 1.05); graphic.alpha = p < delay ? 0 : (1 - t) * .7; });
    };

    if (effect.kind === "cavalry") {
      const ink = 0xffdfb3;
      const veil = new Graphics().rect(x, y, w, h).fill({ color: 0x16120f, alpha: .17 });
      container.addChild(veil);
      const formation = [
        { id: 2, slot: -.32, lane: -.09, depth: .66 }, { id: 3, slot: -.12, lane: -.09, depth: .66 }, { id: 6, slot: .04, lane: -.09, depth: .66 },
        { id: 5, slot: -.23, lane: .1, depth: .84 }, { id: 7, slot: 0, lane: .1, depth: .84 }, { id: 1, slot: .2, lane: .04, depth: .78 },
        { id: 4, slot: -.15, lane: .28, depth: 1 }, { id: 0, slot: .1, lane: .30, depth: 1.28 },
      ];
      for (let i = 0; i < (lite ? 6 : 12); i++) {
        const lane = random(-.03, .42), length = random(w * .08, w * .2), offset = random(0, 1);
        const streak = new Graphics().moveTo(-length, 0).lineTo(0, 0).stroke({ color: ink, width: 1.2, alpha: .28 });
        container.addChild(streak);
        addUpdate((p) => {
          const motion = getCavalryMotion(p);
          streak.position.set(x + ((offset - motion.charge * 2 - motion.travel * 2 + 6) % 1) * w, cy + lane * h);
          streak.scale.x = .6 + motion.charge * 1.6;
          streak.alpha = alpha(p) * clamp(motion.charge * 10) * .65;
        });
      }
      const baseScale = Math.min(w / 780, h / 440, 1.2);
      const actors = lite ? formation.filter(({ id }) => [0, 1, 2, 4, 5].includes(id)) : formation;
      actors.forEach(({ slot, lane, depth, id }) => {
        const actor = createTroopActor("horse", id);
        container.addChild(actor.container);
        actor.container.scale.set(baseScale * depth);
        actor.container.alpha = depth < .7 ? .42 : depth < 1 ? .72 : .96;
        addUpdate((p, elapsed) => {
          const motion = getCavalryMotion(p, id);
          const commandOffset = id === 0 ? Math.min(w * .06, Math.max(0, w - 560) * .1) : 0;
          actor.container.position.set(cx + (slot - .1 + motion.travel) * w + commandOffset, cy + lane * h);
          actor.animate(elapsed, p);
        });
      });
      for (let i = 0; i < (lite ? 4 : 8); i++) {
        const offset = random(-.4, .3), lane = random(.32, .45);
        const dust = new Graphics().moveTo(-25, 2).quadraticCurveTo(-24, -11, -11, -6).quadraticCurveTo(-6, -23, 9, -7).quadraticCurveTo(21, -12, 28, 1).stroke({ color: ink, width: 1.5, alpha: .3 });
        container.addChild(dust);
        addUpdate((p) => {
          const motion = getCavalryMotion(p, i);
          dust.position.set(cx + (offset - .1 + motion.travel) * w, cy + lane * h);
          dust.scale.set(.6 + motion.charge);
          dust.alpha = alpha(p) * clamp(motion.charge * 12) * .7;
        });
      }
    } else if (effect.kind === "invasion") {
      const ink = 0xffdfb3;
      const veil = new Graphics().rect(x, y, w, h).fill({ color: 0x1a120d, alpha: .22 });
      container.addChild(veil);
      const size = Math.min(w * .88 / 500, h * .70 / 355, 1.5);
      const elephant = createTroopActor("elephant");
      const elephantX = cx - size * 35;
      const elephantY = cy + h * (.18 + clamp((350 - h) / 100) * .1) + (h > 350 ? 28 : 0);
      const floor = elephantY + size * 100;
      elephant.container.position.set(elephantX, elephantY);
      elephant.container.scale.set(size);
      container.addChild(elephant.container);
      addUpdate((p, elapsed) => { elephant.container.alpha = clamp(p * 6) * .94; elephant.animate(elapsed, p); });
      for (let i = 0; i < 2; i++) {
        const warrior = createTroopActor("barbarian", i);
        const warriorSize = size * .70;
        warrior.container.position.set(elephantX + size * (i === 0 ? 20 : 133), floor - warriorSize * (i === 0 ? 30 : 44));
        warrior.container.scale.set(warriorSize);
        warrior.container.alpha = .9;
        container.addChild(warrior.container);
        addUpdate((p, elapsed) => warrior.animate(elapsed, p));
      }
      // Only the table overlay shakes; controls and cards remain stationary.
      addUpdate((p, elapsed) => { const t = (p - .555) / .18; const force = t > 0 && t < 1 ? (1 - t) ** 2 * 4 : 0; container.position.set(Math.sin(elapsed / 21) * force, Math.cos(elapsed / 17) * force * .65); });
      for (let i = 0; i < (lite ? 6 : 12); i++) {
        const direction = i % 2 ? 1 : -1;
        const reach = random(w * .09, w * .31);
        const dust = new Graphics().moveTo(-22, 1).quadraticCurveTo(-20, -15, -7, -8).quadraticCurveTo(1, -28, 18, -5).quadraticCurveTo(30, -8, 34, 4).stroke({ color: ink, width: 2, alpha: .65 });
        container.addChild(dust);
        addUpdate((p) => { const t = clamp((p - .555) / .28); dust.position.set(elephantX + size * 90 + direction * reach * ease(t), floor + Math.sin(i * 2.4) * size * 15 - t * 18); dust.scale.set(size * (.2 + t)); dust.alpha = p > .555 ? (1 - t) * .68 : 0; });
      }
      const wave = new Graphics().moveTo(-100, 0).bezierCurveTo(-63, 26, 68, 28, 105, -2).moveTo(-137, 4).bezierCurveTo(-89, 41, 85, 42, 144, 2).stroke({ color: ink, width: 2.5, alpha: .7 });
      wave.position.set(elephantX + size * 90, floor);
      container.addChild(wave);
      addUpdate((p) => { const t = (p - .555) / .2; wave.scale.set(size * (.3 + ease(t) * 1.1)); wave.alpha = t > 0 && t < 1 ? (1 - t) * .8 : 0; });
    } else if (effect.kind === "arrows") {
      for (let i = 0; i < (lite ? 36 : 100); i++) {
        const delay = random(0, .44);
        const startX = x + random(-w * .35, w * .9);
        const startY = y - random(30, h * .45);
        const distance = random(h * .6, h * 1.4);
        const length = random(65, 150);
        const arrow = addSprite(container, textures.arrow, { width: length, height: length * 26 / 220, rotation: .85, additive: false });
        const impact = addSprite(container, textures.glow, { width: random(20, 46), tint: color });
        addUpdate((p) => {
          const t = (p - delay) / .35;
          arrow.position.set(startX + distance * t * .8, startY + distance * t);
          arrow.visible = t > 0 && t < 1;
          arrow.alpha = Math.min(1, t * 7) * .72;
          impact.position.set(startX + distance * .8, startY + distance);
          impact.alpha = t >= 1 && t < 1.5 ? (1.5 - t) * .85 : 0;
        });
      }
      ring(w * .32, .3);
    } else if (effect.kind === "shield") {
      const count = 1;
      for (let i = 0; i < count; i++) {
        const size = Math.min(w * (count === 1 ? .23 : .12), count === 1 ? 168 : 94);
        const targetX = cx + (i - (count - 1) / 2) * size * .82;
        const shield = addSprite(container, textures.shield, { width: size, height: size * 280 / 240, additive: false });
        addUpdate((p) => {
          shield.position.set(targetX, cy + (1 - ease(p * 3)) * 95 + (i % 2) * 12);
          shield.alpha = alpha(p) * .72;
          shield.rotation = Math.sin(p * Math.PI * 2) * .025;
        });
        if (count > 1) {
          const spear = addSprite(container, textures.arrow, { width: size * 2.2, height: size * .12, additive: false, rotation: -Math.PI / 2 });
          addUpdate((p) => { spear.position.set(targetX + size * .3, cy - size * .65 + (1 - ease(p * 3)) * 95); spear.alpha = alpha(p) * .7; });
        }
      }
      for (let i = 0; i < 3; i++) ring(Math.min(w * .38, 240), i * .14);
      burst(lite ? 20 : 58, w * .42);
    } else if (["stars", "unity", "balance", "harvest"].includes(effect.kind)) {
      for (let i = 0; i < (effect.kind === "stars" ? lite ? 12 : 24 : lite ? 26 : 64); i++) {
        const angle = i * 2.399;
        const radius = random(w * .06, Math.min(w * .43, 270));
        const size = random(4, 15);
        const particle = addSprite(container, effect.kind === "harvest" && i % 3 === 0 ? textures.grain : textures.glow, { width: size, height: effect.kind === "harvest" && i % 3 === 0 ? size * 1.8 : size, tint: color });
        addUpdate((p) => {
          const r = radius * (effect.kind === "unity" ? 1.2 - ease(p) : .3 + ease(p));
          const orbit = angle + p * (effect.kind === "stars" ? 2 : 1);
          particle.position.set(cx + Math.cos(orbit) * r, cy + Math.sin(orbit) * r * .5 - p * 35);
          particle.alpha = alpha(p) * (.55 + Math.sin(p * 24 + i) * .3);
          particle.rotation = p * 2;
        });
      }
      const geometry = new Graphics();
      const radius = Math.min(w * .28, 180);
      if (effect.kind !== "stars") geometry.ellipse(0, 0, radius, radius * .55).stroke({ color, width: 1, alpha: .6 });
      if (effect.kind === "stars") {
        // Trace the user's reference: Alkaid, Mizar, Alioth, Megrez, Phecda, Merak, Dubhe.
        // One uniform scale preserves its bent handle and open bowl, with six connecting edges.
        const size = Math.min(w * .58 / 309, h * .49 / 197);
        const points = [[95, 67], [175, 81], [223, 126], [274, 170], [269, 228], [370, 264], [404, 201]].map(([px, py]) => ({ x: (px - 249.5) * size, y: (py - 165.5) * size }));
        const constellation = new Container();
        const lines = new Graphics();
        for (let i = 1; i < points.length; i++) lines.moveTo(points[i - 1].x, points[i - 1].y).lineTo(points[i].x, points[i].y);
        lines.stroke({ color: 0xc6f1ff, width: 2, alpha: .85 });
        constellation.addChild(lines);
        points.forEach((point, i) => {
          addSprite(constellation, textures.glow, { ...point, width: i === 6 ? 34 : 28, tint: i === 6 ? 0xffdac8 : 0xdaf7ff });
          const star = new Graphics().circle(point.x, point.y, i === 6 ? 3.1 : 2.6).fill(0xf3fcff);
          constellation.addChild(star);
        });
        container.addChild(constellation);
        addUpdate((p) => { constellation.position.set(cx, cy + h * .06); constellation.scale.set(.88 + ease(p * 1.6) * .12); constellation.alpha = alpha(p); });
      }
      geometry.position.set(cx, cy);
      geometry.blendMode = "add";
      container.addChild(geometry);
      addUpdate((p) => { geometry.scale.set(.8 + ease(p) * .35); geometry.alpha = alpha(p) * .7; });
      if (effect.kind === "balance") {
        for (const sign of [-1, 1]) {
          const card = new Graphics().roundRect(-25, -36, 50, 72, 5).fill({ color: 0x192a26, alpha: .65 }).stroke({ color, width: 2 });
          container.addChild(card);
          addUpdate((p) => { const angle = p * Math.PI * 2 + (sign === 1 ? Math.PI : 0); card.position.set(cx + Math.cos(angle) * 75, cy + Math.sin(angle) * 26); card.rotation = Math.sin(angle) * .25; card.alpha = alpha(p) * .8; });
        }
      }
    } else if (effect.kind === "bomb" || effect.kind === "rocket") {
      const royal = effect.kind === "rocket";
      const impactAt = royal ? .42 : .35;
      const bombSize = Math.min(w * (royal ? .19 : .26), royal ? 150 : 190);
      const veil = new Graphics().rect(x, y, w, h).fill({ color: 0x0d0805, alpha: .3 });
      container.addChild(veil);
      for (let i = 0; i < (royal ? 2 : 1); i++) {
        const sign = i === 0 ? -1 : 1;
        const source = royal ? artwork[i === 0 ? "jokerSmall" : "jokerBig"] || textures.bomb : textures.bomb;
        const bomb = addSprite(container, source, { width: bombSize, height: bombSize * source.height / source.width, additive: false });
        const spark = addSprite(container, textures.glow, { width: 36, tint: 0xffda8d });
        addUpdate((p, elapsed) => {
          const t = clamp(p / impactAt);
          const travel = ease(t);
          bomb.position.set(cx + (royal ? sign * (1 - travel) * w * .4 + sign * bombSize * .2 : 0), cy - h * .5 * (1 - travel) - Math.sin(t * Math.PI) * 25);
          bomb.rotation = royal ? sign * (1 - travel) * 1.1 : (1 - travel) * -.65;
          bomb.scale.set(bombSize / source.width * (.65 + travel * .45));
          bomb.visible = p < impactAt;
          spark.position.set(bomb.x + bombSize * .34, bomb.y - bombSize * .5);
          spark.alpha = !royal && p < impactAt ? .6 + Math.sin(elapsed / 19) * .35 : 0;
        });
      }
      const blast = (delay, offset, intensity) => {
        const origin = { x: cx + offset, y: cy };
        if (artwork.explosion) {
          const art = artwork.explosion;
          const fireball = addSprite(container, art, { x: origin.x, y: origin.y, additive: false });
          addUpdate((p) => {
            const t = clamp((p - delay) / .43);
            const size = Math.min(w * (royal ? .7 : .6), h * 1.55, royal ? 610 : 520) * (.38 + ease(t * 2.2) * .74) * Math.sqrt(intensity);
            fireball.width = size;
            fireball.height = size * art.height / art.width;
            fireball.y = origin.y - t * h * .15;
            fireball.rotation = (royal ? offset < 0 ? -.13 : .15 : -.04) * t;
            fireball.alpha = p <= delay ? 0 : clamp(t * 15) * clamp((1 - t) * 2) * .78;
          });
        }
        const core = addSprite(container, textures.glow, { ...origin, width: 45, tint: 0xfff0c3 });
        addUpdate((p) => {
          const t = (p - delay) / .32;
          core.width = Math.min(w * .65, 480) * clamp(t * 8);
          core.height = core.width * .72;
          core.alpha = t > 0 ? (1 - clamp(t * 2.3)) * intensity : 0;
        });
        for (let i = 0; i < (lite ? 16 : 32); i++) {
          const angle = random(0, Math.PI * 2), reach = random(.2, 1);
          const cloud = addSprite(container, textures.smoke, { width: 80, tint: i % 3 ? 0xfa7428 : 0x251e1a, additive: i % 3 !== 0 });
          addUpdate((p) => {
            const t = clamp((p - delay) / .58);
            cloud.position.set(origin.x + Math.cos(angle) * reach * w * .34 * ease(t), origin.y + Math.sin(angle) * reach * h * .4 * ease(t) - t * h * .16);
            cloud.width = (45 + ease(t) * (royal ? 180 : 130)) * reach;
            cloud.height = cloud.width;
            cloud.tint = t > .35 ? (i % 3 ? 0x80674f : 0x251e1a) : 0xff842d;
            cloud.blendMode = t > .35 ? "normal" : "add";
            cloud.alpha = p < delay ? 0 : Math.sin(t * Math.PI) * .68;
          });
        }
        for (let i = 0; i < (lite ? 16 : 40); i++) {
          const angle = random(0, Math.PI * 2), speed = random(.18, .6);
          const debris = addSprite(container, i % 4 ? textures.glow : textures.shard, { width: random(4, 12), height: 4, tint: i % 4 ? 0xffc469 : 0xffffff, additive: i % 4 !== 0 });
          addUpdate((p) => {
            const t = (p - delay) / .5;
            debris.position.set(origin.x + Math.cos(angle) * speed * w * t, origin.y + Math.sin(angle) * speed * h * t + t * t * h * .32);
            debris.rotation = angle + t * 8;
            debris.alpha = t > 0 && t < 1 ? (1 - t) * .9 : 0;
          });
        }
        // A brief thick pressure wave fades before the fire and debris settle.
        const shock = new Graphics().ellipse(0, 0, Math.min(w * .48, 440), Math.min(h * .48, 150)).stroke({ color: 0xffd6a1, width: 6, alpha: .75 });
        shock.position.set(origin.x, origin.y);
        shock.blendMode = "add";
        container.addChild(shock);
        addUpdate((p) => { const t = (p - delay) / .23; shock.scale.set(.18 + ease(t) * 1.18); shock.alpha = t > 0 && t < 1 ? (1 - t) ** 2 * .7 : 0; });
      };
      blast(impactAt, royal ? -bombSize * .18 : 0, 1);
      if (royal) blast(impactAt + .14, bombSize * .22, 1.2);
      addUpdate((p, elapsed) => {
        const t = (p - impactAt) / .28;
        const shake = t > 0 && t < 1 ? (1 - t) * (royal ? 8 : 5) : 0;
        container.position.set(Math.sin(elapsed / 17) * shake, Math.cos(elapsed / 23) * shake * .6);
      });
    } else if (["blood", "awakening"].includes(effect.kind)) {
      const flash = addSprite(container, textures.glow, { x: cx, y: cy, width: w * .7, height: h * .9, tint: color });
      addUpdate((p) => { flash.alpha = (1 - clamp(p * 3)) * .65; });
      for (let i = 0; i < (effect.kind === "blood" ? 2 : 4); i++) ring(Math.min(w * .46, 330), i * .1);
      burst(lite ? 32 : 100, w * .6);
      if (effect.kind === "awakening" || effect.kind === "rocket") {
        for (let i = 0; i < (lite ? 10 : 24); i++) {
          const column = addSprite(container, textures.glow, { width: random(6, 16), height: random(h * .4, h * 1.2), tint: i % 2 ? color : COLORS.gold });
          const offset = random(-w * .32, w * .32);
          addUpdate((p) => { column.position.set(cx + offset * (1 - p * .35), y + h * .9 - p * h * .7); column.alpha = alpha(p) * .4; });
        }
      }
    } else if (effect.kind === "airplane") {
      const art = artwork.airplane;
      if (art) for (let i = 0; i < 3; i++) {
        const wingman = i > 0;
        const size = Math.min(w * (wingman ? .2 : .26), wingman ? 170 : 220);
        const plane = addSprite(container, art, { width: size, height: size * art.height / art.width, additive: false });
        const offsetX = wingman ? (i === 1 ? -1 : 1) * size * .55 - size * .5 : 0;
        const offsetY = wingman ? size * .64 + (i === 1 ? -1 : 1) * size * .25 : 0;
        const trails = Array.from({ length: 8 }, (_, n) => addSprite(container, textures.glow, { width: size * (.45 + n * .1), height: 3, tint: 0xc9d2cc, rotation: -.35 }));
        addUpdate((p) => {
          plane.position.set(x - size + p * (w + size * 2) + offsetX, y + h * .85 - p * h * .68 + offsetY);
          plane.alpha = alpha(p) * .86;
          trails.forEach((trail, n) => { trail.position.set(plane.x - size * (.35 + n * .14), plane.y + size * (.1 + n * .04)); trail.alpha = alpha(p) * (.2 - n * .02); });
        });
      }
    } else if (effect.kind === "sword") {
      const origin = getOrigin(effect.userId) || { x: x - 100, y: cy };
      const count = 2;
      for (let i = 0; i < count; i++) {
        const sprite = addSprite(container, textures.sword, { width: Math.min(w * .42, 300), height: 60, additive: false });
        addUpdate((p) => {
          const t = ease(p * 1.8);
          sprite.position.set(origin.x + (cx - origin.x) * t + (p > .55 ? (p - .55) * w : 0), origin.y + (cy - origin.y) * t + (i - 1) * 48);
          sprite.rotation = i === 0 ? -.55 : .55;
          sprite.alpha = alpha(p) * .8;
        });
      }
      burst(lite ? 20 : 48, w * .35, .8);
      ring(w * .24, .2);
    } else if (["straight", "straight-pair"].includes(effect.kind)) {
      for (let i = 0; i < (effect.kind === "straight-pair" ? 12 : 7); i++) {
        const trail = addSprite(container, textures.glow, { width: w * .25, height: 4, tint: color });
        addUpdate((p) => { trail.position.set(x + p * w * 1.4 - i * 24, cy + (i % 2 ? 12 : -12)); trail.alpha = alpha(p) * .6; });
      }
      burst(lite ? 10 : 26, w * .32);
    } else if (effect.kind === "card") {
      const origin = getOrigin(effect.userId) || { x: cx, y: y + h };
      for (let i = 0; i < 8; i++) {
        const particle = addSprite(container, textures.glow, { width: 8, tint: color });
        addUpdate((p) => { const t = ease(p + i * .035); particle.position.set(origin.x + (cx - origin.x) * t, origin.y + (cy - origin.y) * t); particle.alpha = (1 - p) * .5; });
      }
    } else if (effect.kind === "judgement") ring(80);
    return { container, update: (p, elapsed) => { container.alpha = alpha(p); updates.forEach((fn) => fn(p, elapsed)); }, destroy: () => { container.destroy({ children: true }); } };
  }

  function render(effects) {
    if (destroyed) return;
    const now = Date.now();
    const time = performance.now();
    averageFrame = averageFrame * .92 + Math.min(100, time - lastTime) * .08;
    if (averageFrame > 29) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 35) adaptiveLite = true;
    lastTime = time;
    const ids = new Set(effects.map((effect) => effect.id));
    for (const [id, entry] of performances) {
      if (!ids.has(id)) { entry.destroy(); performances.delete(id); }
    }
    for (const effect of effects) {
      const elapsed = now - effect.startedAt;
      if (elapsed >= effect.duration) continue;
      if (!performances.has(effect.id)) performances.set(effect.id, build(effect));
      const frozen = import.meta.env.DEV && Number.isFinite(effect.previewProgress);
      const progress = frozen ? effect.previewProgress : clamp(elapsed / effect.duration);
      performances.get(effect.id).update(progress, frozen ? effect.previewDuration * progress : elapsed);
    }
    app.render();
  }
  return {
    render,
    clear: () => { for (const entry of performances.values()) entry.destroy(); performances.clear(); app.render(); },
    destroy: () => {
      destroyed = true;
      for (const entry of performances.values()) entry.destroy();
      performances.clear();
      app.destroy(true, { children: true });
      Object.values(textures).forEach((value) => value.destroy(true));
    },
  };
}
