/* ===========================================================
   LIBERTY DRIVE — dynamic weather, sky and atmosphere
   -----------------------------------------------------------
   States: clear -> cloudy -> overcast -> rain -> storm -> fog,
   each with its own cloud cover, fog density, light tint, road
   wetness and wind. Transitions are eased, never snapped.

   Rain is a recycled GPU point cloud that follows the player,
   so a few thousand drops cover the whole city for free.
   =========================================================== */
LD.weather = (function () {
  const U = LD.util;

  const STATES = {
    clear:    { cloud: 0.05, fog: 0.00, wet: 0.00, rain: 0,    wind: 0.25, light: 1.00, name: 'Clear' },
    cloudy:   { cloud: 0.45, fog: 0.12, wet: 0.00, rain: 0,    wind: 0.55, light: 0.82, name: 'Cloudy' },
    overcast: { cloud: 0.85, fog: 0.28, wet: 0.15, rain: 0,    wind: 0.70, light: 0.58, name: 'Overcast' },
    rain:     { cloud: 0.95, fog: 0.42, wet: 0.90, rain: 0.65, wind: 0.95, light: 0.44, name: 'Rain' },
    storm:    { cloud: 1.00, fog: 0.52, wet: 1.00, rain: 1.00, wind: 1.40, light: 0.32, name: 'Thunderstorm' },
    fog:      { cloud: 0.55, fog: 1.00, wet: 0.35, rain: 0,    wind: 0.15, light: 0.62, name: 'Fog' },
  };
  // plausible transitions, so it never jumps from clear to thunderstorm
  const NEXT = {
    clear:    ['clear', 'cloudy', 'cloudy', 'fog'],
    cloudy:   ['clear', 'overcast', 'cloudy', 'fog'],
    overcast: ['cloudy', 'rain', 'rain', 'overcast'],
    rain:     ['overcast', 'storm', 'rain'],
    storm:    ['rain', 'rain', 'overcast'],
    fog:      ['clear', 'cloudy'],
  };

  let scene = null, camera = null;
  let state = 'clear', timer = 45;
  // eased, currently-applied values
  const cur = { cloud: 0.05, fog: 0, wet: 0, rain: 0, wind: 0.25, light: 1 };

  let rainPts = null, rainVel = null, rainCount = 0, rainBudget = 2600;
  let clouds = null, stars = null, moon = null;
  let flash = 0, nextBolt = 12;
  let splashGroup = null;

  // ---------- assets ----------
  function makeCloudTexture() {
    const S = 512;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    // stacked soft blobs make a passable cumulus sheet
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = 18 + Math.random() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.05 + Math.random() * 0.16;
      grd.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  }

  function buildClouds() {
    const geo = new THREE.PlaneGeometry(2400, 2400);
    const mat = new THREE.MeshBasicMaterial({
      map: makeCloudTexture(), transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    });
    clouds = new THREE.Mesh(geo, mat);
    clouds.rotation.x = Math.PI / 2;      // face down at the player
    clouds.position.y = 260;
    clouds.renderOrder = -1;
    scene.add(clouds);
  }

  function buildStars() {
    const n = 1200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // upper hemisphere only
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.85 + 0.05;
      const r = 700;
      pos[i * 3]     = Math.cos(u) * Math.sqrt(1 - v * v) * r;
      pos[i * 3 + 1] = v * r;
      pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.6, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    scene.add(stars);

    moon = new THREE.Mesh(
      new THREE.SphereGeometry(16, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f2, transparent: true, opacity: 0, fog: false })
    );
    scene.add(moon);
  }

  function buildRain(count) {
    rainCount = count;
    const pos = new Float32Array(count * 3);
    rainVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = U.rand(-90, 90);
      pos[i * 3 + 1] = U.rand(0, 120);
      pos[i * 3 + 2] = U.rand(-90, 90);
      rainVel[i] = U.rand(65, 105);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainPts = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xaecbe6, size: 0.5, transparent: true, opacity: 0,
      depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    rainPts.frustumCulled = false;
    scene.add(rainPts);
  }

  // ---------- lifecycle ----------
  function init(sc, cam) {
    scene = sc; camera = cam;
    buildClouds();
    buildStars();
    buildRain(2600);
    splashGroup = new THREE.Group();
    scene.add(splashGroup);
    set('clear', true);
  }

  function set(name, instant) {
    if (!STATES[name]) return;
    state = name;
    timer = U.rand(50, 130);
    if (instant) Object.assign(cur, STATES[name]);
    LD.hud && LD.hud.toast && !instant && LD.hud.toast('Weather: ' + STATES[name].name);
  }

  function roll() { set(U.pick(NEXT[state] || ['clear'])); }

  // ---------- per-frame ----------
  function update(dt, playerPos) {
    timer -= dt;
    if (timer <= 0) roll();

    // ease every channel toward the target state
    const t = STATES[state];
    const k = Math.min(1, dt * 0.32);
    for (const key in cur) cur[key] = U.lerp(cur[key], t[key], k);

    const night = LD.world.nightFactor;
    const p = playerPos || new THREE.Vector3();

    // ---- clouds drift with the wind ----
    if (clouds) {
      clouds.position.x = p.x; clouds.position.z = p.z;
      clouds.material.map.offset.x += dt * 0.004 * (0.4 + cur.wind);
      clouds.material.map.offset.y += dt * 0.0016 * (0.4 + cur.wind);
      clouds.material.opacity = cur.cloud * 0.72;
      // clouds pick up the sky's colour so they don't glow at night
      const c = clouds.material.color;
      const lum = U.lerp(0.16, 1.0, 1 - night);
      c.setRGB(lum, lum * 0.99, lum * 0.97);
    }

    // ---- stars + moon, hidden by cloud cover ----
    if (stars) {
      stars.material.opacity = night * (1 - cur.cloud) * 0.95;
      stars.position.set(p.x, 0, p.z);
      stars.rotation.y += dt * 0.004;
    }
    if (moon) {
      const ang = LD.world.time / 24 * Math.PI * 2 + Math.PI;
      moon.position.set(p.x + Math.cos(ang) * 420, Math.sin(ang) * 380, p.z + 120);
      moon.material.opacity = night * (1 - cur.cloud * 0.85);
      moon.visible = moon.position.y > 0;
    }

    // ---- rain ----
    if (rainPts) {
      const on = cur.rain > 0.02;
      rainPts.visible = on;
      rainPts.material.opacity = cur.rain * 0.55;
      if (on) {
        const arr = rainPts.geometry.attributes.position.array;
        const drift = cur.wind * 9;
        const active = Math.min(rainCount, rainBudget);
        rainPts.geometry.setDrawRange(0, active);
        for (let i = 0; i < active; i++) {
          const j = i * 3;
          arr[j + 1] -= rainVel[i] * dt * (0.5 + cur.rain);
          arr[j] += drift * dt;
          if (arr[j + 1] < -2) {           // recycle above the player
            arr[j]     = p.x + U.rand(-80, 80);
            arr[j + 1] = U.rand(70, 130);
            arr[j + 2] = p.z + U.rand(-80, 80);
          }
        }
        rainPts.geometry.attributes.position.needsUpdate = true;
      }
    }

    // ---- lightning ----
    if (state === 'storm') {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = U.rand(3.5, 11);
        flash = 1;
        LD.audio.thunder && LD.audio.thunder(U.rand(0.6, 2.2));
      }
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 3.4);

    // ---- hand the eased values to the world ----
    LD.world.applyWeather(cur, flash);

    // ---- ambience ----
    LD.audio.setRain && LD.audio.setRain(cur.rain);
  }

  function setRainBudget(n) { rainBudget = Math.max(120, n | 0); }

  function reset() { set('clear', true); }

  return {
    init, update, set, reset, setRainBudget,
    get state() { return state; },
    get label() { return STATES[state].name; },
    get wetness() { return cur.wet; },
    get windLevel() { return cur.wind; },
    get rainLevel() { return cur.rain; },
    get lightScale() { return cur.light; },
    get flash() { return flash; },
    get names() { return Object.keys(STATES); },
  };
})();
