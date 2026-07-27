/* ===========================================================
   LIBERTY DRIVE — graphics quality & adaptive performance
   -----------------------------------------------------------
   Four presets. "auto" watches the real frame rate and steps
   down when the machine can't keep up (and back up when it
   comfortably can), so the game aims at a playable 60 rather
   than looking pretty at 6.

   Press G in game to cycle presets.
   =========================================================== */
LD.quality = (function () {
  const U = LD.util;

  const PRESETS = {
    low: {
      label: 'Low', pixelRatio: 0.7, shadows: false, shadowMap: 512,
      bloom: false, fxaa: false, rain: 500, fogFar: 300, anisotropy: 1,
    },
    medium: {
      label: 'Medium', pixelRatio: 1.0, shadows: true, shadowMap: 1024,
      bloom: true, fxaa: false, rain: 1400, fogFar: 400, anisotropy: 2,
    },
    high: {
      label: 'High', pixelRatio: 1.25, shadows: true, shadowMap: 2048,
      bloom: true, fxaa: true, rain: 2600, fogFar: 460, anisotropy: 4,
    },
    ultra: {
      label: 'Ultra', pixelRatio: 1.5, shadows: true, shadowMap: 4096,
      bloom: true, fxaa: true, rain: 4200, fogFar: 560, anisotropy: 8,
    },
  };
  const ORDER = ['low', 'medium', 'high', 'ultra'];

  let renderer = null, ctx = null;      // ctx = { bloom, fxaa, sun, composer }
  let current = 'high';
  let auto = true;
  let frames = 0, acc = 0, fps = 60, settleFor = 0;

  function preset() { return PRESETS[current]; }

  function apply(name) {
    if (!PRESETS[name] || !renderer) return;
    current = name;
    const q = PRESETS[name];

    // setPixelRatio on its own does NOT resize the drawing buffer — three
    // only recomputes it inside setSize, so resolution scaling silently did
    // nothing without this second call.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = q.shadows;

    if (ctx.sun) {
      ctx.sun.castShadow = q.shadows;
      if (q.shadows && ctx.sun.shadow.mapSize.width !== q.shadowMap) {
        ctx.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
        if (ctx.sun.shadow.map) { ctx.sun.shadow.map.dispose(); ctx.sun.shadow.map = null; }
      }
    }
    if (ctx.bloom) ctx.bloom.enabled = q.bloom;
    if (ctx.fxaa) ctx.fxaa.enabled = q.fxaa;
    if (ctx.composer) ctx.composer.setSize(window.innerWidth, window.innerHeight);
    LD.weather && LD.weather.setRainBudget && LD.weather.setRainBudget(q.rain);

    settleFor = 2.5;                 // ignore the FPS spike right after a switch
    LD.hud && LD.hud.setQuality && LD.hud.setQuality(q.label + (auto ? ' (auto)' : ''));
  }

  function init(rnd, context) {
    renderer = rnd; ctx = context || {};
    // first guess from the hardware: mobile and low-core machines start lower
    const cores = navigator.hardwareConcurrency || 4;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    current = mobile ? 'low' : (cores <= 4 ? 'medium' : 'high');
    apply(current);
  }

  function cycle() {
    auto = false;
    const i = ORDER.indexOf(current);
    apply(ORDER[(i + 1) % ORDER.length]);
    LD.hud && LD.hud.toast('Graphics: ' + preset().label);
  }

  function setAuto(v) { auto = v; }

  /* called once per rendered frame */
  function tick(dt) {
    frames++; acc += dt;
    if (settleFor > 0) { settleFor -= dt; }
    if (acc < 1.2) return;
    fps = frames / acc;
    frames = 0; acc = 0;
    if (!auto || settleFor > 0) return;

    const i = ORDER.indexOf(current);
    if (fps < 26 && i > 0) {
      apply(ORDER[i - 1]);
      LD.hud && LD.hud.toast('Lowered graphics to ' + preset().label + ' (' + Math.round(fps) + ' fps)');
    } else if (fps > 58 && i < ORDER.length - 1) {
      apply(ORDER[i + 1]);
    }
  }

  return {
    init, apply, cycle, tick, setAuto, preset,
    get fps() { return fps; },
    get name() { return current; },
    get label() { return PRESETS[current].label; },
    get isAuto() { return auto; },
  };
})();
