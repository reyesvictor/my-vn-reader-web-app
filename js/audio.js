// Typing sounds with Web Audio (the owner's test showed it does not pause Poweramp in Firefox — #6).
// Several sound types (#5) + volume (#23). New .ogg files: drop them in sfx/type/ and add them to FILES.
const FILES = { blip: 'sfx/blip_high.ogg' };

let ctx = null, master = null;
const buffers = {};

export function unlock() {                     // call from a user gesture; never await (resume can stay pending)
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    for (const [k, url] of Object.entries(FILES)) {
      fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[k] = buf; }).catch(() => {});
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setVolume(pct) { if (master) master.gain.value = Math.max(0, Math.min(1, pct / 100)); }

function tone(type, freq, dur, gain) {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.01);
}
function noise(dur, gain, freq) {
  const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = gain;
  src.buffer = buf; src.connect(f).connect(g).connect(master); src.start();
}

export function blip(kind) {
  if (!ctx || ctx.state !== 'running' || kind === 'off') return;
  switch (kind) {
    case 'blip': if (buffers.blip) { const s = ctx.createBufferSource(); s.buffer = buffers.blip; s.connect(master); s.start(); } break;
    case 'soft': tone('sine', 620 + Math.random() * 40, 0.05, 0.25); break;
    case 'square': tone('square', 880 + Math.random() * 60, 0.045, 0.08); break;
    case 'typewriter': noise(0.03, 0.9, 2500 + Math.random() * 800); break;
  }
}
export function next(kind) {
  if (!ctx || ctx.state !== 'running' || kind === 'off') return;
  tone('triangle', 520, 0.06, 0.18); setTimeout(() => tone('triangle', 780, 0.08, 0.14), 55);
}
