/* ===== LIBERTY DRIVE — synthesized audio (WebAudio, no asset files) ===== */
LD.audio = (function () {
  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let enabled = true;

  function ensure() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    } catch (e) { enabled = false; }
  }
  function resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function noiseBuffer(dur) {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, gain) {
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function gunshot() {
    if (!enabled || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    blip(120, 0.08, 'sawtooth', 0.25);
  }

  function punch() {
    if (!enabled || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.09);
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 600;
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function crash(intensity) {
    if (!enabled || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.3);
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400 + 400 * (intensity || .5);
    g.gain.setValueAtTime(0.4 * (intensity || .5), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function cash() { blip(880, 0.08, 'triangle', 0.2); setTimeout(() => blip(1320, 0.1, 'triangle', 0.2), 70); }
  function pickup() { blip(660, 0.07, 'square', 0.18); setTimeout(() => blip(990, 0.09, 'square', 0.18), 60); }
  function hurt() { blip(180, 0.14, 'sawtooth', 0.25); }

  // ---- Engine loop (car) ----
  function startEngine() {
    ensure(); if (!enabled || !ctx || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineFilter = ctx.createBiquadFilter();
    engineOsc.type = 'sawtooth';
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 700;
    engineGain.gain.value = 0.0;
    engineOsc.frequency.value = 60;
    engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  function updateEngine(speed01, throttle) {
    if (!engineOsc) return;
    const base = 55 + speed01 * 210;
    engineOsc.frequency.setTargetAtTime(base, ctx.currentTime, 0.05);
    engineFilter.frequency.setTargetAtTime(500 + speed01 * 2200, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + throttle * 0.08 + speed01 * 0.05, ctx.currentTime, 0.1);
  }
  function stopEngine() {
    if (!engineOsc) return;
    try { engineOsc.stop(); } catch (e) {}
    engineOsc.disconnect(); engineGain.disconnect(); engineFilter.disconnect();
    engineOsc = null; engineGain = null; engineFilter = null;
  }

  // ---- Siren ----
  function startSiren() {
    ensure(); if (!enabled || !ctx || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();
    sirenLfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 760;
    sirenLfo.frequency.value = 1.4;
    lfoGain.gain.value = 240;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();
    sirenGain.gain.setTargetAtTime(0.10, ctx.currentTime, 0.2);
  }
  function stopSiren() {
    if (!sirenOsc) return;
    try { sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch(e){}
    const o = sirenOsc, l = sirenLfo, g = sirenGain;
    sirenOsc = null; sirenLfo = null; sirenGain = null;
    setTimeout(() => { try { o.stop(); l.stop(); o.disconnect(); l.disconnect(); g.disconnect(); } catch(e){} }, 300);
  }

  return {
    resume, gunshot, punch, crash, cash, pickup, hurt,
    startEngine, updateEngine, stopEngine, startSiren, stopSiren,
    get on() { return enabled; }
  };
})();
