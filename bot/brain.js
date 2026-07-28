/* ===========================================================
   LIBERTY DRIVE — Autoplay Bot "brain"
   -----------------------------------------------------------
   Injected into the running game page. It reads public game
   state (LD.game.player, LD.missions, LD.police, ...) and then
   plays through the SAME input path a human uses: it dispatches
   real KeyboardEvent / MouseEvent objects on window.

   The only state it writes directly is the look direction
   (player.camYaw / camPitch), because mouse-look is gated behind
   Pointer Lock, which headless browsers won't grant.

   Run phases:
     commute -> drive to mission markers, complete deliveries
     chaos   -> on foot, pistol out, draw a wanted level
     escape  -> steal a car and outrun the police
   =========================================================== */
(function () {
  const held = new Set();

  function down(code) {
    if (held.has(code)) return;
    held.add(code);
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  }
  function up(code) {
    if (!held.has(code)) return;
    held.delete(code);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }
  function set(code, want) { want ? down(code) : up(code); }
  function tap(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), 60);
  }
  function releaseAll() { for (const c of Array.from(held)) up(c); }
  // attacks must originate on the canvas — the game ignores UI clicks
  const canvas = () => document.getElementById('scene');
  function click() {
    const c = canvas();
    c.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    setTimeout(() => c.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 40);
  }

  // face a world direction: player movement & car aiming both use
  // fwd = (-sin(yaw), -cos(yaw)), so yaw = atan2(-dx, -dz)
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  const angDiff = (a, b) => ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;

  const stats = {
    startMoney: 0, money: 0, missions: 0, kills: 0, shots: 0,
    maxMph: 0, peakStars: 0, distance: 0, carsStolen: 0,
    deaths: 0, busts: 0, phase: '', log: [],
  };
  let lastPos = null, tick = 0, started = 0, total = 75;
  let carTarget = null, sprayCd = 0;

  function note(msg) {
    const t = ((performance.now() - started) / 1000).toFixed(1);
    stats.log.push('[' + t + 's] ' + msg);
  }

  // ---- instrument the game so we can count events ----
  function instrument() {
    const G = LD.game;
    const kill = G.onPlayerKill;
    G.onPlayerKill = function (t, cause) { stats.kills++; return kill.apply(this, arguments); };
    const bust = G.onBusted;
    G.onBusted = function () { stats.busts++; note('BUSTED by police'); return bust.apply(this, arguments); };
  }

  // closest car, but bias toward something quick — a truck tops out at
  // 26 u/s and turns like a barge, which wrecks delivery timers
  function nearestCar(p, maxD, fast) {
    let best = null, bs = Infinity;
    for (const c of LD.vehicles.cars) {
      if (c.destroyed) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d > maxD) continue;
      // heavily prefer a PARKED car: chasing a moving one across town
      // burns the whole session. Mild bonus for a quicker top speed.
      const moving = Math.abs(c.speed) * 6;
      const slowCar = fast ? (88 - c.spec.maxF) * 0.4 : 0;
      const score = d + moving + slowCar;
      if (score < bs) { bs = score; best = c; }
    }
    return best;
  }
  function nearestPed(p, maxD) {
    let best = null, bd = maxD;
    for (const q of LD.traffic.peds) {
      if (q.dead) continue;
      const d = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function copCentroid() {
    let x = 0, z = 0, n = 0;
    for (const c of LD.police.cops) if (!c.dead) { x += c.pos.x; z += c.pos.z; n++; }
    for (const c of LD.vehicles.cars) if (c.isPolice && !c.destroyed) { x += c.pos.x; z += c.pos.z; n++; }
    return n ? { x: x / n, z: z / n, n } : null;
  }

  /* ---- stuck detection -------------------------------------------------
     The city is full of solid boxes and a naive "point at the target and
     hold W" agent wedges itself against walls. Both movement helpers below
     watch for lack of progress and steer around whatever is blocking. */
  const stuck = { foot: null, car: null };
  function progress(kind, x, z, now) {
    let s = stuck[kind];
    if (!s) s = stuck[kind] = { x, z, t: now, esc: 0, dir: 1 };
    if (s.esc > 0) { s.esc -= 1; return true; }        // mid-escape
    if (now - s.t > 1100) {                             // ms

      const moved = Math.hypot(x - s.x, z - s.z);
      s.x = x; s.z = z; s.t = now;
      if (moved < 2.0) {                                // barely moved -> wedged
        s.esc = kind === 'foot' ? 45 : 55;              // frames of escape
        s.dir *= -1;
        s.n = (s.n || 0) + 1;
        return true;
      }
    }
    return false;
  }
  const escaping = (kind) => stuck[kind] && stuck[kind].esc > 0;
  const escapeDir = (kind) => (stuck[kind] ? stuck[kind].dir : 1);
  const escapeN = (kind) => (stuck[kind] ? stuck[kind].n || 0 : 0);

  // steer a car toward (tx,tz)
  function driveToward(car, tx, tz, now) {
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const dist = Math.hypot(dx, dz);
    let err = angDiff(car.heading, yawTo(dx, dz));

    progress('car', car.pos.x, car.pos.z, now);
    if (escaping('car')) {
      // alternate backing out and bulling forward, wheel cranked the other
      // way each time, so we can't ping-pong in the same corner forever
      const back = escapeN('car') % 2 === 1;
      set('KeyW', !back); set('KeyS', back); set('Space', false);
      set('KeyA', escapeDir('car') > 0); set('KeyD', escapeDir('car') < 0);
      return dist;
    }

    // Final approach: a car circling at 20+ u/s has a turn radius wider than
    // the ~3 unit marker and will orbit it forever. Ease down to a crawl,
    // where the turn radius drops under the pickup radius, and spiral in.
    if (dist < 10) {
      set('KeyA', err > 0.03);
      set('KeyD', err < -0.03);
      set('KeyW', car.speed < 8);
      set('KeyS', car.speed > 12);
      set('Space', false);
      return dist;
    }

    set('KeyA', err > 0.05);
    set('KeyD', err < -0.05);
    // CRITICAL: steering authority scales with speed, so a stopped car can
    // only turn once it is rolling. Always accelerate when slow, otherwise
    // a misaligned car deadlocks (brake -> no speed -> no steering).
    const slow = Math.abs(car.speed) < 14;
    const tight = Math.abs(err) > 1.15;
    const overrunning = dist < 20 && car.speed > 32;   // ease into the marker
    set('KeyW', !overrunning && (slow || (!tight && dist > 4)));
    set('KeyS', !slow && (overrunning || (tight && car.speed > 36)));
    set('Space', false);
    return dist;
  }

  function walkToward(p, tx, tz, sprint, now) {
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    let yaw = yawTo(dx, dz);
    progress('foot', p.pos.x, p.pos.z, now);
    if (escaping('foot')) yaw += escapeDir('foot') * 1.25;   // sidestep the wall
    p.camYaw = yaw;
    p.camPitch = 0.25;
    set('KeyW', true);
    set('ShiftLeft', !!sprint);
    return Math.hypot(dx, dz);
  }


  /* ---- road-grid navigation -------------------------------------------
     Driving straight at a marker just rams the bot into building after
     building. The world exposes an intersection graph (world.nearestNode /
     nodeNeighbors), so plan a BFS route over it and follow the road like
     the traffic AI does, only cutting cross-country on the last leg. */
  function planRoute(from, to) {
    const W = LD.world;
    const start = W.nearestNode(from.x, from.z);
    const goal = W.nearestNode(to.x, to.z);
    const out = [];
    if (start !== goal) {
      const prev = new Map(), seen = new Set([start]);
      const q = [start];
      let found = false;
      while (q.length) {
        const n = q.shift();
        if (n === goal) { found = true; break; }
        for (const nb of W.nodeNeighbors(n)) {
          if (seen.has(nb)) continue;
          seen.add(nb); prev.set(nb, n); q.push(nb);
        }
      }
      if (found) {
        let cur = goal;
        while (cur && cur !== start) { out.push({ x: cur.x, z: cur.z }); cur = prev.get(cur); }
        out.reverse();
      }
    }
    out.push({ x: to.x, z: to.z });        // final hop off the grid
    return out;
  }

  let route = null, routeKey = null, replanAt = 0;
  function driveRoute(car, tx, tz, now) {
    const key = Math.round(tx) + ',' + Math.round(tz);
    if (!route || routeKey !== key || !route.length || now > replanAt) {
      route = planRoute(car.pos, { x: tx, z: tz });
      routeKey = key;
      replanAt = now + 5000;               // re-plan if we drift off course
    }
    let wp = route[0];
    const near = route.length > 1 ? 11 : 3;
    if (Math.hypot(wp.x - car.pos.x, wp.z - car.pos.z) < near) {
      route.shift();
      if (!route.length) route = [{ x: tx, z: tz }];
      wp = route[0];
    }
    return driveToward(car, wp.x, wp.z, now);
  }

  // farthest intersection from the heat, for running away
  function fleeNode(p, cc) {
    let best = null, bs = -Infinity;
    for (const n of LD.world.nodes) {
      const away = Math.hypot(n.x - cc.x, n.z - cc.z);
      const reach = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
      const score = away - reach * 0.35;
      if (score > bs) { bs = score; best = n; }
    }
    return best;
  }

  function update(dt) {
    const p = LD.game.player;
    if (!p) return;
    tick++;

    // --- stats ---
    stats.money = LD.game.money;
    stats.peakStars = Math.max(stats.peakStars, LD.police.stars);
    if (p.inCar) stats.maxMph = Math.max(stats.maxMph, p.inCar.speedMph);
    if (lastPos) {
      const d = Math.hypot(p.pos.x - lastPos.x, p.pos.z - lastPos.z);
      if (d < 30) stats.distance += d;               // ignore respawn teleports
    }
    lastPos = { x: p.pos.x, z: p.pos.z };

    if (p.dead) {
      if (!p._botWasDead) { p._botWasDead = true; stats.deaths++; note('WASTED'); }
      releaseAll();
      return;
    }
    p._botWasDead = false;

    const now = performance.now();
    const elapsed = (now - started) / 1000;
    const f = elapsed / total;                        // 0..1 through the run
    const phase = f < 0.62 ? 'commute' : (f < 0.82 ? 'chaos' : 'escape');
    if (phase !== stats.phase) {
      releaseAll();
      stats.phase = phase;
      note('PHASE -> ' + phase.toUpperCase());
      if (phase === 'chaos') { tap('Digit2'); note('drew the pistol'); }
      if (phase === 'escape') { tap('Digit1'); }
    }

    // ---------------- CHAOS: on foot, start trouble ----------------
    if (phase === 'chaos') {
      if (p.inCar) { tap('KeyF'); releaseAll(); note('stepped out of the car'); return; }
      const victim = nearestPed(p, 1e9);               // hunt the closest one anywhere
      sprayCd -= dt;
      if (!victim) { walkToward(p, 0, 0, true, now); return; }
      const dx = victim.pos.x - p.pos.x, dz = victim.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 20) { walkToward(p, victim.pos.x, victim.pos.z, true, now); return; }
      // in range: flatten the aim ray (the default camera pitch angles the
      // shot into the ground within ~6 units) and open fire
      p.camYaw = yawTo(dx, dz);
      p.camPitch = -0.1;
      set('KeyW', d > 9); set('ShiftLeft', false);
      if (sprayCd <= 0) { click(); stats.shots++; sprayCd = 0.3; }
      return;
    }

    // ---------------- ESCAPE: get a car, outrun the heat ----------------
    if (phase === 'escape') {
      if (!p.inCar) {
        const car = nearestCar(p, 90);
        if (car) {
          const d = walkToward(p, car.pos.x, car.pos.z, true, now);
          if (d < 4.2) {
            tap('KeyF'); stats.carsStolen++;
            note('jacked a ' + car.type + ' to escape');
          }
        } else walkToward(p, 0, 0, true, now);
        return;
      }
      // flee directly away from the police
      const cc = copCentroid();
      const { HALF } = LD.world.consts;
      let tx, tz;
      if (cc) {
        const ax = p.pos.x - cc.x, az = p.pos.z - cc.z;
        const len = Math.hypot(ax, az) || 1;
        tx = p.pos.x + (ax / len) * 200;
        tz = p.pos.z + (az / len) * 200;
      } else { tx = -p.pos.x; tz = -p.pos.z; }
      if (cc) { const fn = fleeNode(p, cc); if (fn) { tx = fn.x; tz = fn.z; } }
      tx = Math.max(-HALF, Math.min(HALF, tx));
      tz = Math.max(-HALF, Math.min(HALF, tz));
      driveRoute(p.inCar, tx, tz, now);
      return;
    }

    // ---------------- COMMUTE: work the delivery jobs ----------------
    const hasJob = LD.missions.markerActive();
    const t = hasJob ? LD.missions.getTarget() : null;

    if (!p.inCar) {
      // grab the closest car, then drive the job
      if (!carTarget || carTarget.destroyed) carTarget = nearestCar(p, 120, true);
      if (carTarget) {
        const d = walkToward(p, carTarget.pos.x, carTarget.pos.z, true, now);
        if (d < 4.2) {
          tap('KeyF'); stats.carsStolen++;
          note('took a ' + carTarget.type);
          carTarget = null;
        }
      } else if (t) {
        walkToward(p, t.x, t.z, true, now);
      }
      return;
    }

    if (!t) { set('KeyW', true); return; }            // no job yet — just cruise
    // player.pos mirrors the car while driving, so markers can be
    // collected without ever leaving the vehicle
    const before = LD.game.money;
    driveRoute(p.inCar, t.x, t.z, now);
    if (LD.game.money > before) stats.missions++;
  }

  // count completed deliveries by watching for payouts
  let lastMoney = null;
  function watchMoney() {
    if (lastMoney !== null && LD.game.money > lastMoney) {
      stats.missions++;
      note('DELIVERY PAID +$' + (LD.game.money - lastMoney));
    }
    lastMoney = LD.game.money;
  }

  let raf = null, prev = 0;
  function frame(ts) {
    const dt = prev ? Math.min((ts - prev) / 1000, 0.1) : 0.016;
    prev = ts;
    try { update(dt); watchMoney(); } catch (e) { note('ERR ' + e.message); }
    raf = requestAnimationFrame(frame);
  }

  return (window.__LDBOT = {
    start(seconds) {
      total = seconds || 75;
      started = performance.now();
      stats.startMoney = LD.game.money;
      lastMoney = LD.game.money;
      instrument();
      note('bot online');
      raf = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(raf); releaseAll(); },
    stats() {
      const p = LD.game.player;
      return Object.assign({}, stats, {
        finalMoney: LD.game.money,
        earned: LD.game.money - stats.startMoney,
        stars: LD.police.stars,
        health: p ? Math.round(p.health) : 0,
        inCar: !!(p && p.inCar),
        alive: !!(p && !p.dead),
      });
    },
  });
})();
