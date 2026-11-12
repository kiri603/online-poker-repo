import { heightAt, forestAt, ROCKS } from './terrain.js';

export function sightRange(unit) {
  return (unit.vision || 13) + (heightAt(unit.x, unit.z) > 1.2 ? 3.5 : 0);
}

export function canObserve(observer, target) {
  if (observer.hp <= 0) return false;
  const distance = Math.hypot(target.x - observer.x, target.z - observer.z);
  if (distance > (observer.vision || 13) + 3.5) return false;
  let range = sightRange(observer);
  const forest = forestAt(target.x, target.z);
  if (forest) range = Math.min(range, forest === forestAt(observer.x, observer.z) ? 7 : 5.5);
  if (distance > range) return false;
  if (distance < 2) return true;
  const fromY = heightAt(observer.x, observer.z) + 1.1, toY = heightAt(target.x, target.z) + .9;
  const steps = Math.ceil(distance / .8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = observer.x + (target.x - observer.x) * t, z = observer.z + (target.z - observer.z) * t;
    const rayY = fromY + (toY - fromY) * t;
    if (heightAt(x, z) > rayY) return false;
    if (ROCKS.some(r => Math.hypot(x - r.x, z - r.z) < r.radius * .85 && heightAt(r.x, r.z) + r.radius * 1.15 > rayY)) return false;
  }
  return true;
}
