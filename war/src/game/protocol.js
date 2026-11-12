export const PROTOCOL_VERSION = 'battle-pvp-1';
export const VISION_WIDTH = 64, VISION_HEIGHT = 42;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 64 && Math.abs(p.z) <= 42;
const ids = value => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(id => Number.isSafeInteger(id) && id > 0) && new Set(value).size === value.length;
const formation = value => ['grid', 'line', 'wedge'].includes(value);

export function validCommand(message) {
  if (!message || message.type !== 'command' || !Number.isSafeInteger(message.seq) || message.seq < 1) return false;
  const p = message.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  switch (message.action) {
    case 'deploy': return ['mao', 'jiahao', 'mengqi', 'kun', 'nailong', 'naiwa'].includes(p.kind) && point(p.center) && [1, 5, 10].includes(p.count) && formation(p.formation) && Number.isFinite(p.angle) && Math.abs(p.angle) <= Math.PI * 100;
    case 'move': return ids(p.ids) && point(p.center) && formation(p.formation);
    case 'attack': return ids(p.ids) && Number.isSafeInteger(p.targetId) && p.targetId > 0;
    case 'mode': return ids(p.ids) && ['hold', 'auto'].includes(p.mode);
    case 'remove': return ids(p.ids);
    case 'frontline': return ids(p.ids) && Array.isArray(p.line) && p.line.length >= 2 && p.line.length <= 256 && p.line.every(point);
    case 'offensive': return Number.isSafeInteger(p.planId) && p.planId > 0 && point(p.point);
    case 'ready': return typeof p.value === 'boolean';
    case 'quickDeploy': case 'undo': case 'execute': case 'stopPlans': case 'surrender': return Object.keys(p).length === 0;
    default: return false;
  }
}
