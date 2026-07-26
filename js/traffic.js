/* ===== LIBERTY DRIVE — AI traffic & pedestrians ===== */
LD.traffic = (function () {
  const U = LD.util;
  let scene = null;
  const peds = [];

  function init(sc) { scene = sc; }

  // ---------- AI traffic cars ----------
  function pickNextNode(from, avoid) {
    const nbs = LD.world.nodeNeighbors(from).filter(n => n !== avoid);
    return U.pick(nbs.length ? nbs : LD.world.nodeNeighbors(from));
  }

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const rp = LD.world.randomRoadPoint();
      const type = U.pick(['sedan', 'sedan', 'sports', 'truck']);
      const car = LD.vehicles.Car(type, U.pick(U.CAR_COLORS), rp.x, rp.z, U.rand(0, Math.PI * 2));
      const from = LD.world.nearestNode(rp.x, rp.z);
      car.ai = { from, target: pickNextNode(from, null), cruise: U.rand(12, 22) };
      car.isTraffic = true;
    }
  }

  function updateTrafficCar(car, dt, player) {
    if (car.destroyed) return;
    const a = car.ai;
    let tx = a.target.x, tz = a.target.z;
    // lane offset to the right of travel
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) {
      a.from = a.target;
      a.target = pickNextNode(a.from, a.prev);
      a.prev = a.from;
      return;
    }
    const desired = Math.atan2(-dx, -dz);
    const err = U.angleDiff(car.heading, desired);
    car.control.steer = U.clamp(err * 1.6, -1, 1);

    // slow for sharp turns
    let throttle = 0.55;
    if (Math.abs(err) > 0.6) throttle = 0.28;

    // simple avoidance: brake if a car or the player is close ahead
    const fwd = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
    for (const other of LD.vehicles.cars) {
      if (other === car) continue;
      const ox = other.pos.x - car.pos.x, oz = other.pos.z - car.pos.z;
      const ahead = ox * fwd.x + oz * fwd.z;
      const d2 = ox * ox + oz * oz;
      if (ahead > 0 && d2 < 64) { throttle = -0.3; break; }
    }
    // brake near player on foot
    if (player && !player.inCar && !player.dead) {
      const px = player.pos.x - car.pos.x, pz = player.pos.z - car.pos.z;
      const ahead = px * fwd.x + pz * fwd.z;
      if (ahead > 0 && (px * px + pz * pz) < 36) throttle = -0.6;
    }

    car.control.throttle = throttle;
    car.control.handbrake = false;
    // cap cruise speed
    if (car.speed > a.cruise) car.control.throttle = 0;
  }

  function updateTraffic(dt, player) {
    for (const car of LD.vehicles.cars) {
      if (car.isTraffic && car !== (player && player.inCar)) {
        if (!car.driver) updateTrafficCar(car, dt, player);
      }
    }
  }

  // ---------- pedestrians ----------
  function spawnPeds(n) {
    const { HALF } = LD.world.consts;
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do { x = U.rand(-HALF, HALF); z = U.rand(-HALF, HALF); tries++; }
      while (LD.world.isRoad(x, z) && tries < 10);
      const human = LD.makeHuman({});
      human.group.position.set(x, 0, z);
      scene.add(human.group);
      peds.push({
        human, pos: new THREE.Vector3(x, 0, z), yaw: U.rand(0, 6.28),
        target: new THREE.Vector3(x, 0, z), speed: U.rand(2.5, 4),
        flee: 0, dead: false, deadTimer: 0, wander: 0,
      });
    }
  }

  function newTarget(p) {
    const { HALF } = LD.world.consts;
    p.target.set(
      U.clamp(p.pos.x + U.rand(-24, 24), -HALF, HALF), 0,
      U.clamp(p.pos.z + U.rand(-24, 24), -HALF, HALF)
    );
  }

  function scare(pos, radius) {
    for (const p of peds) {
      if (p.dead) continue;
      if (p.pos.distanceTo(pos) < radius) {
        p.flee = U.rand(3, 6);
        // run away from the source
        const away = p.pos.clone().sub(pos).setY(0);
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        away.normalize().multiplyScalar(20);
        p.target.copy(p.pos).add(away);
      }
    }
  }

  function killPed(p) {
    if (p.dead) return;
    p.dead = true; p.deadTimer = 8;
    p.human.die();
    scare(p.pos, 22);
  }

  function updatePeds(dt, player) {
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      if (p.dead) {
        p.deadTimer -= dt;
        if (p.deadTimer <= 0) { scene.remove(p.human.group); peds.splice(i, 1); }
        continue;
      }
      if (p.flee > 0) p.flee -= dt;

      const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) { newTarget(p); continue; }

      const spd = p.flee > 0 ? p.speed * 2.4 : p.speed;
      const nx = p.pos.x + (dx / dist) * spd * dt;
      const nz = p.pos.z + (dz / dist) * spd * dt;
      const res = LD.world.collide(nx, nz, 0.6);
      if (res.hit) newTarget(p);
      p.pos.x = res.x; p.pos.z = res.z;
      p.yaw = Math.atan2(dx, dz);

      // squashed by cars
      for (const car of LD.vehicles.cars) {
        if (Math.abs(car.speed) > 6 && car.pos.distanceTo(p.pos) < 2.2) {
          killPed(p);
          if (car === (player && player.inCar)) LD.game && LD.game.onPlayerKill(p, 'car');
          break;
        }
      }

      p.human.group.position.copy(p.pos);
      p.human.group.rotation.y = p.yaw;
      p.human.animate(dt, spd);
    }

    // respawn to keep the city populated near the player
    if (peds.length < 34 && U.chance(0.3)) spawnPedsNear(player, 1);
  }

  function spawnPedsNear(player, n) {
    if (!player) return spawnPeds(n);
    const { HALF } = LD.world.consts;
    for (let i = 0; i < n; i++) {
      const ang = U.rand(0, 6.28), r = U.rand(60, 110);
      let x = U.clamp(player.pos.x + Math.cos(ang) * r, -HALF, HALF);
      let z = U.clamp(player.pos.z + Math.sin(ang) * r, -HALF, HALF);
      const human = LD.makeHuman({});
      human.group.position.set(x, 0, z);
      scene.add(human.group);
      peds.push({
        human, pos: new THREE.Vector3(x, 0, z), yaw: U.rand(0, 6.28),
        target: new THREE.Vector3(x, 0, z), speed: U.rand(2.5, 4),
        flee: 0, dead: false, deadTimer: 0, wander: 0,
      });
    }
  }

  function update(dt, player) {
    updateTraffic(dt, player);
    updatePeds(dt, player);
  }

  function reset() {
    for (const p of peds) scene.remove(p.human.group);
    peds.length = 0;
  }

  return { init, spawnTraffic, spawnPeds, update, scare, killPed, reset,
    get peds() { return peds; } };
})();
