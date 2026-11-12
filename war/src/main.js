import { createWorld } from './scene.js';
import { createBattleController } from './game/battle-controller.js';
import { UNIT_ORDER, UNIT_TYPES } from './game/units.js';
import { battleAudio } from './game/battle-audio.js';
import { NetworkBattle } from './game/network-client.js';

const UNITS = UNIT_ORDER.map(kind => UNIT_TYPES[kind]);

const $ = id => document.getElementById(id);
let selected = 0, view = 'home', sound = true;
let world, battle;

function clickSound() {
  battleAudio.play({ kind: 'click' });
}

function setView(next, simulation) {
  if (view === 'battle' && next !== 'battle') battle.leave();
  view = next; $('app').dataset.view = next;
  for (const id of ['home', 'codex', 'battle']) $(id).hidden = id !== next;
  world.setView(next, selected);
  if (next === 'battle') {
    if (!battle) { battle = createBattleController(world, () => setView('home')); battle.setQuality($('quality').checked); battle.setMotion($('animation').checked); }
    battle.enter(simulation);
    if (simulation?.network) delete window.__game;
    else window.__game = { inspect: () => battle.inspect(), project: (...args) => battle.project(...args), prepareScaleCheck: () => battle.prepareScaleCheck() };
  }
  if (next === 'codex') updateUnit();
  const focusTarget = next === 'home' ? $('enter') : next === 'battle' ? $('battle-home') : document.querySelector(`#${next} [data-home]`);
  focusTarget.focus({ preventScroll: true });
}

function updateUnit() {
  const unit = UNITS[selected];
  $('unit-name').textContent = unit.name; $('unit-role').textContent = unit.role;
  $('unit-trait').textContent = unit.trait;
  $('unit-number').textContent = `${String(selected + 1).padStart(2, '0')} / 06`;
  $('unit-stats').replaceChildren(...[['生命', unit.hp], ['攻击', unit.attack], ['费用', unit.cost]].map(([name, value]) => {
    const pair = document.createElement('div'), label = document.createElement('dt'), amount = document.createElement('dd');
    label.textContent = name; amount.textContent = value; pair.append(label, amount); return pair;
  }));
  [...$('unit-tabs').children].forEach((tab, index) => tab.setAttribute('aria-current', String(index === selected)));
  world.setView('codex', selected);
}

for (const [index, unit] of UNITS.entries()) {
  const button = document.createElement('button'); button.setAttribute('aria-label', unit.name);
  button.addEventListener('click', () => { selected = index; updateUnit(); });
  $('unit-tabs').append(button);
}
$('enter').addEventListener('click', () => setView('battle'));
let joiningBattle = null;
$('open-pvp').addEventListener('click', () => { $('pvp-status').textContent = ''; $('pvp-lobby').showModal(); });
$('close-pvp').addEventListener('click', () => $('pvp-lobby').close());
$('pvp-lobby').addEventListener('close', () => { joiningBattle?.close(); joiningBattle = null; });
async function connectPvp(type) {
  if (joiningBattle) return;
  const network = new NetworkBattle(); joiningBattle = network;
  $('pvp-status').textContent = '正在连接对战服务器…'; $('create-pvp').disabled = $('join-pvp').disabled = true;
  try {
    await network.connect(type, $('pvp-code').value.trim().toUpperCase());
    if (joiningBattle !== network) return;
    joiningBattle = null; $('pvp-lobby').close(); setView('battle', network);
  } catch (error) {
    network.close(); if (joiningBattle === network) { joiningBattle = null; $('pvp-status').textContent = error.message; }
  } finally { $('create-pvp').disabled = $('join-pvp').disabled = false; }
}
$('create-pvp').addEventListener('click', () => connectPvp('create'));
$('join-pvp-form').addEventListener('submit', event => { event.preventDefault(); connectPvp('join'); });
$('copy-room').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('room-code').textContent); $('copy-room').textContent = '已复制'; }
  catch { $('copy-room').textContent = '请手动复制房间码'; }
  setTimeout(() => { $('copy-room').textContent = '复制房间码'; }, 1800);
});
$('open-codex').addEventListener('click', () => setView('codex'));
document.querySelectorAll('[data-home]').forEach(button => button.addEventListener('click', () => setView('home')));
$('previous-unit').addEventListener('click', () => { selected = (selected + 5) % 6; updateUnit(); });
$('next-unit').addEventListener('click', () => { selected = (selected + 1) % 6; updateUnit(); });
$('open-settings').addEventListener('click', () => $('settings').showModal());
$('settings').addEventListener('click', event => { if (event.target === $('settings')) { const rect = $('settings').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('settings').close(); } });
$('brightness').addEventListener('input', event => world.setBrightness(+event.target.value));
$('animation').checked = !matchMedia('(prefers-reduced-motion: reduce)').matches;
$('animation').addEventListener('change', event => { world.setAnimation(event.target.checked); battle?.setMotion(event.target.checked); });
$('quality').addEventListener('change', event => { world.setQuality(event.target.checked); battle?.setQuality(event.target.checked); });
function toggleSound() {
  sound = !sound; battleAudio.setEnabled(sound);
  $('sound-toggle').setAttribute('aria-pressed', String(sound)); $('sound-toggle').setAttribute('aria-label', sound ? '关闭声音' : '开启声音');
  $('battle-sound').setAttribute('aria-pressed', String(sound)); $('battle-sound').textContent = sound ? '音效 开' : '音效 关';
}
$('sound-toggle').addEventListener('click', toggleSound);
$('battle-sound').addEventListener('click', toggleSound);
$('sound-volume').addEventListener('input', event => battleAudio.setVolume(+event.target.value));
document.addEventListener('pointerdown', () => battleAudio.unlock(), { capture: true });
document.addEventListener('keydown', () => battleAudio.unlock(), { capture: true });
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('fullscreen').setAttribute('aria-label', '浏览器不支持全屏'); }
});
$('retry').addEventListener('click', () => location.reload());
document.addEventListener('click', event => { if (event.target.closest('button')) clickSound(); });
document.addEventListener('keydown', event => {
  if ($('settings').open) return;
  if (event.key === 'Escape' && view === 'codex') setView('home');
  if (view === 'codex' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    selected = (selected + (event.key === 'ArrowLeft' ? 5 : 1)) % 6; updateUnit();
  }
});

try {
  world = createWorld($('world'));
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, .05)); last = now;
    if (!document.hidden) { if (view === 'battle') battle.update(dt); else world.render(dt); }
    requestAnimationFrame(frame);
  }
  world.render(0);
  requestAnimationFrame(frame);
  $('loading').classList.add('ready');
  $('loading').addEventListener('transitionend', () => { $('loading').hidden = true; }, { once: true });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('loading').hidden = true;
  window.__demo = { inspect: () => world.inspect(), unitNames: UNITS.map(u => u.name) };
  if (new URLSearchParams(location.search).get('level') === '1') setView('battle');
} catch (error) {
  console.error(error); $('loading').hidden = true; $('error').hidden = false;
}
