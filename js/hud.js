/* ===== LIBERTY DRIVE — HUD & minimap ===== */
LD.hud = (function () {
  const U = LD.util;
  let el = {};
  let mapCtx = null;
  let missionTimer = 0;

  function init() {
    el.hud = document.getElementById('hud');
    el.wanted = document.getElementById('wanted');
    el.money = document.getElementById('money');
    el.clock = document.getElementById('clock');
    el.hp = document.getElementById('hpbar');
    el.ar = document.getElementById('arbar');
    el.weaponName = document.getElementById('weaponName');
    el.ammo = document.getElementById('ammo');
    el.mission = document.getElementById('mission');
    el.prompt = document.getElementById('prompt');
    el.toasts = document.getElementById('toasts');
    el.speedo = document.getElementById('speedo');
    el.speedval = document.getElementById('speedval');
    el.bigflash = document.getElementById('bigflash');
    el.minimap = document.getElementById('minimap');
    el.perf = document.getElementById('perf');
    mapCtx = el.minimap.getContext('2d');
  }

  function show() { el.hud.classList.remove('hidden'); }
  function hide() { el.hud.classList.add('hidden'); }

  function setMoney(n) { el.money.textContent = U.money(n); }
  function setClock(s) { el.clock.textContent = s; }
  function setQuality(q) { if (el.perf) el.perf.dataset.q = q; }
  function setPerf(fps, q) {
    if (el.perf) el.perf.textContent = Math.round(fps) + ' fps · ' + q;
  }
  function setHealth(hp, armor) {
    el.hp.style.width = U.clamp(hp, 0, 100) + '%';
    el.ar.style.width = U.clamp(armor, 0, 100) + '%';
  }
  function setWanted(stars) {
    let s = '';
    for (let i = 0; i < 5; i++) s += '<span class="star' + (i < stars ? '' : ' off') + '">★</span>';
    el.wanted.innerHTML = s;
  }
  function setWeapon(name, ammo) {
    el.weaponName.textContent = name;
    el.ammo.textContent = ammo;
  }
  function mission(txt) {
    el.mission.innerHTML = txt;
    el.mission.classList.add('show');
  }
  function prompt(txt) {
    if (txt) { el.prompt.innerHTML = txt; el.prompt.classList.remove('hidden'); }
    else el.prompt.classList.add('hidden');
  }
  function speedo(show, mph) {
    if (show) { el.speedo.classList.remove('hidden'); el.speedval.textContent = Math.round(mph); }
    else el.speedo.classList.add('hidden');
  }
  function toast(msg, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }
  function bigFlash(txt, cls) {
    el.bigflash.textContent = txt;
    el.bigflash.className = 'bigflash ' + cls;
  }
  function clearFlash() { el.bigflash.className = 'bigflash hidden'; }

  // ---------- minimap ----------
  function drawMinimap(player) {
    if (!mapCtx) return;
    const size = 220, R = size / 2;
    const worldR = 150;                  // world units shown from center to edge
    const scale = R / worldR;
    const cx = player.pos.x, cz = player.pos.z;
    const g = mapCtx;
    const { GRID, HALF, N } = LD.world.consts;

    g.save();
    // circular clip
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();

    // background = asphalt
    g.fillStyle = '#20232a'; g.fillRect(0, 0, size, size);

    const toMap = (x, z) => [R + (x - cx) * scale, R + (z - cz) * scale];

    // grass outside city
    // block squares (sidewalk/park)
    g.fillStyle = '#3c414c';
    for (let bi = 0; bi < N - 1; bi++) {
      for (let bj = 0; bj < N - 1; bj++) {
        const bx = (bi + 0.5) * GRID - HALF;
        const bz = (bj + 0.5) * GRID - HALF;
        if (Math.abs(bx - cx) > worldR + GRID || Math.abs(bz - cz) > worldR + GRID) continue;
        const [mx, my] = toMap(bx, bz);
        const s = (GRID - 16) * scale;
        g.fillRect(mx - s / 2, my - s / 2, s, s);
      }
    }

    // mission marker
    if (LD.missions.markerActive()) {
      const t = LD.missions.getTarget();
      let [mx, my] = toMap(t.x, t.z);
      const dx = mx - R, dy = my - R, dd = Math.hypot(dx, dy);
      if (dd > R - 8) { mx = R + dx / dd * (R - 8); my = R + dy / dd * (R - 8); }
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(mx, my, 5, 0, Math.PI * 2); g.fill();
    }

    // cars
    for (const car of LD.vehicles.cars) {
      if (car.destroyed) continue;
      if (Math.abs(car.pos.x - cx) > worldR || Math.abs(car.pos.z - cz) > worldR) continue;
      const [mx, my] = toMap(car.pos.x, car.pos.z);
      g.fillStyle = car.isPolice ? '#4aa8ff' : '#c9ced8';
      g.fillRect(mx - 1.6, my - 1.6, 3.2, 3.2);
    }
    // foot cops
    for (const cop of LD.police.cops) {
      if (cop.dead) continue;
      const [mx, my] = toMap(cop.pos.x, cop.pos.z);
      g.fillStyle = '#ff4141';
      g.beginPath(); g.arc(mx, my, 2.4, 0, Math.PI * 2); g.fill();
    }

    // player arrow
    const heading = player.inCar ? player.inCar.heading : player.yaw;
    g.translate(R, R);
    g.rotate(-heading);
    g.fillStyle = '#38d16b';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.restore();

    // north tick
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(R - 1, 3, 2, 6);
  }

  return {
    init, show, hide, setMoney, setHealth, setWanted, setWeapon, setClock,
    mission, prompt, speedo, toast, bigFlash, clearFlash, drawMinimap, setQuality, setPerf,
  };
})();
