/* ===== LIBERTY DRIVE — wanted level & police ===== */
LD.police = (function () {
  const U = LD.util;
  let scene = null;

  const cops = [];          // foot officers (targetable)
  let heat = 0;             // 0..5 float
  let stars = 0;
  let timeSinceCrime = 999;
  let footCd = 0, carCd = 0;
  let bustTimer = 0;
  let sirenOn = false;

  function init(sc) { scene = sc; }

  function addWanted(a) {
    heat = U.clamp(heat + a, 0, 5);
    stars = Math.min(5, Math.ceil(heat - 0.001));
    timeSinceCrime = 0;
  }
  function setStars(n) { heat = n; stars = n; }
  function clear() { heat = 0; stars = 0; }

  function makeCop() {
    const h = LD.makeHuman({ shirt: 0x1b3a7a, pants: 0x14203a, skin: U.pick(U.SKIN), hair: 0x101018 });
    return h;
  }

  function spawnFootCop(player) {
    const { HALF } = LD.world.consts;
    const ang = U.rand(0, 6.28), r = U.rand(42, 78);
    let x = U.clamp(player.pos.x + Math.cos(ang) * r, -HALF, HALF);
    let z = U.clamp(player.pos.z + Math.sin(ang) * r, -HALF, HALF);
    const human = makeCop();
    human.group.position.set(x, 0, z);
    scene.add(human.group);
    cops.push({
      human, pos: new THREE.Vector3(x, 0, z), yaw: 0,
      health: 100, dead: false, deadTimer: 0, shootCd: U.rand(0.5, 1.5), speed: 7.5,
    });
  }

  function spawnCopCar(player) {
    const { HALF } = LD.world.consts;
    const rp = LD.world.randomRoadPoint();
    // spawn a bit away from player
    if (Math.hypot(rp.x - player.pos.x, rp.z - player.pos.z) < 40) return;
    const car = LD.vehicles.Car('police', 0x1b2540, rp.x, rp.z, U.rand(0, 6.28));
    car.isTraffic = false;
    car.copCar = { shootCd: 2 };
    car.driver = { isCop: true }; // prevents traffic AI from steering it
  }

  function killCop(cop) {
    if (cop.dead) return;
    cop.dead = true; cop.deadTimer = 8;
    cop.human.die();
    LD.fx.blood(cop.pos.clone().setY(2));
  }

  function updateFootCop(cop, dt, player, camera) {
    if (cop.dead) { cop.deadTimer -= dt; if (cop.deadTimer <= 0) { scene.remove(cop.human.group); return false; } return true; }
    if (player.dead) return true;

    const to = new THREE.Vector3().subVectors(player.pos, cop.pos); to.y = 0;
    const dist = to.length();
    to.normalize();

    // move toward player unless very close
    if (dist > 3) {
      const nx = cop.pos.x + to.x * cop.speed * dt;
      const nz = cop.pos.z + to.z * cop.speed * dt;
      const res = LD.world.collide(nx, nz, 0.6);
      cop.pos.x = res.x; cop.pos.z = res.z;
    }
    cop.yaw = Math.atan2(to.x, to.z);
    cop.human.group.position.copy(cop.pos);
    cop.human.group.rotation.y = cop.yaw;
    cop.human.aiming = dist < 34;
    cop.human.animate(dt, dist > 3 ? cop.speed : 0);

    // shoot at player (stars >= 2 shoot more; stars 1 mostly chase/bust)
    cop.shootCd -= dt;
    if (dist < 34 && cop.shootCd <= 0 && (stars >= 2 || dist > 6)) {
      cop.shootCd = U.rand(0.9, 1.8);
      LD.audio.gunshot();
      LD.fx.muzzle(cop.pos.clone().setY(3).add(to.clone().multiplyScalar(1.2)));
      LD.fx.tracer(cop.pos.clone().setY(3), player.pos.clone().setY(2.6));
      const acc = U.clamp(1 - dist / 40, 0.2, 0.85);
      if (Math.random() < acc && !player.inCar) player.takeDamage(U.rand(5, 11));
      else if (Math.random() < acc * 0.4 && player.inCar) player.inCar.damage(6);
    }

    // bust: low wanted, player on foot, cornered
    if (!player.inCar && dist < 2.4 && stars <= 2 && player.speed < 3) {
      bustTimer += dt;
      if (bustTimer > 0.8) LD.game.onBusted();
    }
    return true;
  }

  function updateCopCar(car, dt, player) {
    if (car.destroyed) {
      if (!car._copEjected) { car._copEjected = true; }
      return;
    }
    const targetPos = player.inCar ? player.inCar.pos : player.pos;
    const dx = targetPos.x - car.pos.x, dz = targetPos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(-dx, -dz);
    const err = U.angleDiff(car.heading, desired);
    car.control.steer = U.clamp(err * 1.8, -1, 1);
    car.control.throttle = dist > 10 ? 1 : (dist > 5 ? 0.4 : -0.2);
    car.control.handbrake = false;

    // cop in car shoots at high wanted
    car.copCar.shootCd -= dt;
    if (stars >= 3 && dist < 30 && car.copCar.shootCd <= 0) {
      car.copCar.shootCd = U.rand(1.2, 2.2);
      LD.audio.gunshot();
      LD.fx.tracer(car.pos.clone().setY(1.5), (player.inCar ? player.inCar.pos : player.pos).clone().setY(2));
      if (Math.random() < 0.5) {
        if (player.inCar) player.inCar.damage(7); else player.takeDamage(U.rand(4, 9));
      }
    }
    // ram damage
    if (dist < 3.2 && Math.abs(car.speed) > 10 && !player.inCar && !player.dead) player.takeDamage(U.rand(6, 12));
  }

  function update(dt, player, camera) {
    // wanted decay
    timeSinceCrime += dt;
    if (timeSinceCrime > 8 && heat > 0) {
      heat = Math.max(0, heat - dt * 0.09);
      stars = Math.min(5, Math.ceil(heat - 0.001));
    }
    if (bustTimer > 0 && (!cops.some(c => !c.dead && c.pos.distanceTo(player.pos) < 2.6))) bustTimer = 0;

    // spawn logic
    footCd -= dt; carCd -= dt;
    const wantFoot = stars >= 1 ? Math.min(8, stars * 2) : 0;
    const aliveFoot = cops.filter(c => !c.dead).length;
    if (stars >= 1 && aliveFoot < wantFoot && footCd <= 0) { spawnFootCop(player); footCd = 1.2; }

    const wantCars = Math.max(0, stars - 1);
    const aliveCars = LD.vehicles.cars.filter(c => c.isPolice && !c.destroyed).length;
    if (stars >= 2 && aliveCars < wantCars && carCd <= 0) { spawnCopCar(player); carCd = 3; }

    // update foot cops
    for (let i = cops.length - 1; i >= 0; i--) {
      const keep = updateFootCop(cops[i], dt, player, camera);
      if (!keep) cops.splice(i, 1);
    }
    // update cop cars
    for (const car of LD.vehicles.cars) {
      if (car.isPolice && car.copCar && !car.destroyed) updateCopCar(car, dt, player);
      if (car.isPolice && car.destroyed && !car._copReward) { car._copReward = true; }
    }

    // siren ambience
    const anyChase = stars >= 1 && (cops.some(c => !c.dead) || LD.vehicles.cars.some(c => c.isPolice && !c.destroyed));
    if (anyChase && !sirenOn) { LD.audio.startSiren(); sirenOn = true; }
    else if (!anyChase && sirenOn) { LD.audio.stopSiren(); sirenOn = false; }
  }

  function reset() {
    for (const c of cops) scene.remove(c.human.group);
    cops.length = 0;
    heat = 0; stars = 0; timeSinceCrime = 999; bustTimer = 0;
    if (sirenOn) { LD.audio.stopSiren(); sirenOn = false; }
  }

  return {
    init, addWanted, setStars, clear, update, killCop, reset,
    get stars() { return stars; }, get cops() { return cops; },
    get sirenOn() { return sirenOn; },
  };
})();
