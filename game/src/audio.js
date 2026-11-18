// WebAudio synth sound for Solmaris — everything is generated, no audio files.
// FIX (audible sound): the context is created lazily on the first user gesture,
// resumed on EVERY keydown / pointerdown, the master gain is a real non-zero
// value (0.5), and the engine voice is always connected while driving —
// earlier builds left the graph silent because the context stayed suspended
// and the engine gain sat at zero. Mute toggles the master gain 0.5 <-> 0.
import { MUTE_KEY } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let ambientGain = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Shared noise buffer for gunshots, waves and skids.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // Engine: two detuned saws through a lowpass, gain follows speed.
    engineOsc1 = ctx.createOscillator(); engineOsc1.type = 'sawtooth'; engineOsc1.frequency.value = 55;
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 28;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc1.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc1.start(); engineOsc2.start();

    // Siren: triangle two-tone via LFO on frequency.
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 720;
    sirenLfo = ctx.createOscillator(); sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();

    // Ambient sea: looped filtered noise, quiet but present.
    const amb = ctx.createBufferSource(); amb.buffer = noiseBuf; amb.loop = true;
    const ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 320;
    ambientGain = ctx.createGain(); ambientGain.gain.value = 0.045;
    amb.connect(ambFilter); ambFilter.connect(ambientGain); ambientGain.connect(master);
    amb.start();
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }
  window.addEventListener('keydown', resume);
  window.addEventListener('pointerdown', resume);
  window.addEventListener('pointermove', resume, { once: true });

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  return {
    get muted() { return muted; },
    unlock() { resume(); },
    setMuted(m) {
      muted = m;
      try { window.localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    // Called every frame: speed in m/s, inCar, wanted level.
    updateEngine(speed, inCar, wanted) {
      if (!ctx) return;
      resume();
      const s = Math.min(1, Math.abs(speed) / 38);
      const target = inCar ? 0.05 + s * 0.16 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      engineOsc1.frequency.setTargetAtTime(52 + s * 165, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(26 + s * 82, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(380 + s * 1400, ctx.currentTime, 0.1);
      sirenGain.gain.setTargetAtTime(muted ? 0 : (wanted >= 2 ? 0.055 : 0), ctx.currentTime, 0.3);
    },
    gunshot() { noiseBurst(0.16, 0.5, 2600); blip(110, 0.12, 'square', 0.3); },
    punch() { noiseBurst(0.09, 0.3, 900); },
    pickup() { blip(880, 0.09, 'sine', 0.28); blip(1320, 0.14, 'sine', 0.24, 0.08); },
    coin() { blip(1046, 0.1, 'triangle', 0.3); blip(1568, 0.16, 'triangle', 0.26, 0.07); },
    missionDone() {
      blip(523, 0.14, 'triangle', 0.32); blip(659, 0.14, 'triangle', 0.32, 0.12);
      blip(784, 0.2, 'triangle', 0.34, 0.24); blip(1046, 0.3, 'triangle', 0.3, 0.36);
    },
    busted() { blip(220, 0.4, 'sawtooth', 0.3); blip(165, 0.6, 'sawtooth', 0.3, 0.3); },
    wasted() { blip(196, 0.5, 'sawtooth', 0.3); blip(147, 0.8, 'sawtooth', 0.3, 0.4); },
    click() { blip(660, 0.05, 'square', 0.15); },
    skid() { noiseBurst(0.25, 0.12, 700); },
    step() { noiseBurst(0.04, 0.06, 500); },
  };
}
