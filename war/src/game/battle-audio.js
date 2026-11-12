// All cues are synthesized locally. No downloads or external audio service are needed.
let context, master, noise, enabled = true, volume = .45, played = 0;
const active = new Set(), lastCue = new Map();

function unlock() {
  if (!enabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    if (!context) {
      context = new AudioContext(); master = context.createGain(); master.gain.value = volume;
      const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
      master.connect(limiter); limiter.connect(context.destination);
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch { context = null; }
}

function voice({ frequency = 220, end = 80, duration = .12, strength = .16, type = 'triangle', noiseCutoff = 0, pan = 0, delay = 0 }) {
  if (!enabled || !context || context.state !== 'running' || active.size >= 32) return;
  const start = context.currentTime + delay;
  const source = noiseCutoff ? context.createBufferSource() : context.createOscillator();
  const envelope = context.createGain(), panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  let filter;
  if (noiseCutoff) {
    source.buffer = noise; filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = noiseCutoff;
    source.connect(filter); filter.connect(envelope);
  } else {
    source.type = type; source.frequency.setValueAtTime(frequency, start); source.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    source.connect(envelope);
  }
  envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(strength, start + .005);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  envelope.connect(panner); panner.connect(master); active.add(source);
  source.onended = () => { source.disconnect(); filter?.disconnect(); envelope.disconnect(); panner.disconnect(); active.delete(source); };
  source.start(start); source.stop(start + duration + .01); played++;
}

function play(event, camera) {
  if (!enabled || !context || context.state !== 'running') return;
  const kind = event.kind === 'hit' && event.shieldDamage > 0 ? 'shield' : event.kind;
  const now = context.currentTime;
  if (now - (lastCue.get(kind) ?? -100) < (kind === 'hit' ? .045 : .08)) return;
  lastCue.set(kind, now);
  const dx = camera && Number.isFinite(event.x) ? event.x - camera.target.x : 0;
  const dz = camera && Number.isFinite(event.z) ? event.z - camera.target.z : 0;
  const attenuation = camera ? 1 / (1 + Math.hypot(dx, dz) / Math.max(10, camera.distance * .4)) : 1;
  const pan = camera ? (dx * Math.cos(camera.azimuth) - dz * Math.sin(camera.azimuth)) / (camera.distance * .38) : 0;
  const cue = options => voice({ ...options, strength: (options.strength || .15) * attenuation, pan });
  switch (kind) {
    case 'click': cue({ frequency: 520, end: 290, duration: .07, strength: .07 }); break;
    case 'move': cue({ frequency: 380, end: 550, duration: .09, strength: .09 }); break;
    case 'hit': cue({ noiseCutoff: 1800, duration: .085, strength: .2 }); cue({ frequency: 160, end: 55, duration: .1, strength: .13 }); break;
    case 'shield': cue({ frequency: 850, end: 360, type: 'sine', duration: .2, strength: .17 }); break;
    case 'throw': cue({ noiseCutoff: 900, duration: .12, strength: .11 }); break;
    case 'impact': cue({ frequency: 140, end: 42, duration: .18, strength: .22 }); break;
    case 'stomp': cue({ frequency: 88, end: 28, duration: .38, strength: .3 }); cue({ noiseCutoff: 500, duration: .28, strength: .3 }); break;
    case 'wave': cue({ frequency: 180, end: 650, type: 'sine', duration: .28, strength: .15 }); break;
    case 'hiss': cue({ noiseCutoff: 6000, duration: .15, strength: .11 }); break;
    case 'inspire': cue({ frequency: 523, end: 659, duration: .22, strength: .11 }); cue({ frequency: 784, end: 880, duration: .28, delay: .08, strength: .09 }); break;
    case 'death': cue({ frequency: 135, end: 30, duration: .26, strength: .13 }); break;
    case 'start':
    case 'victory':
    case 'defeat':
      for (let i = 0; i < 3; i++) cue({ frequency: [262, 330, 392][i] * (kind === 'defeat' ? .6 : 1), end: kind === 'defeat' ? 80 : [330, 392, 523][i], duration: .3, delay: i * .12, strength: .13 });
      break;
  }
}

export const battleAudio = {
  unlock, play,
  setEnabled(value) { enabled = !!value; if (enabled) unlock(); if (master && context) master.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, .02); },
  setVolume(value) { volume = Math.max(0, Math.min(1, value)); if (master && context) master.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, .02); },
  inspect: () => ({ enabled, volume, state: context?.state || 'locked', activeVoices: active.size, played })
};
