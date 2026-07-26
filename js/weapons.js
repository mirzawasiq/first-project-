/* ===== LIBERTY DRIVE — effects + weapons/combat ===== */

/* Lightweight particle / tracer effects. */
LD.fx = (function () {
  let scene = null;
  const live = [];

  function init(sc) { scene = sc; }

  function spawn(mesh, life, updater) {
    mesh.userData._life = life; mesh.userData._age = 0; mesh.userData._upd = updater;
    scene.add(mesh); live.push(mesh);
  }

  function tracer(from, to) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const m = new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(g, m);
    spawn(line, 0.06, (o, t) => { o.material.opacity = 0.9 * (1 - t); });
  }

  function muzzle(pos) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true })
    );
    s.position.copy(pos);
    spawn(s, 0.06, (o, t) => { o.scale.setScalar(1 + t * 2); o.material.opacity = 1 - t; });
  }

  function blood(pos) {
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xaa1414 })
      );
      p.position.copy(pos);
      const v = new THREE.Vector3(LD.util.rand(-3, 3), LD.util.rand(2, 5), LD.util.rand(-3, 3));
      spawn(p, 0.5, (o, t, dt) => {
        v.y -= 18 * dt; o.position.addScaledVector(v, dt); o.material.opacity = 1 - t;
        o.material.transparent = true;
      });
    }
  }

  function sparks(pos) {
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffcc55 })
      );
      p.position.copy(pos);
      const v = new THREE.Vector3(LD.util.rand(-4, 4), LD.util.rand(1, 4), LD.util.rand(-4, 4));
      spawn(p, 0.35, (o, t, dt) => { v.y -= 16 * dt; o.position.addScaledVector(v, dt); });
    }
  }

  function explosion(pos) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true })
    );
    ball.position.copy(pos);
    spawn(ball, 0.6, (o, t) => { o.scale.setScalar(1 + t * 8); o.material.opacity = 1 - t; });
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 5, 5),
        new THREE.MeshBasicMaterial({ color: LD.util.pick([0xff5a2a, 0xffcc33, 0x333333]) })
      );
      p.position.copy(pos);
      const v = new THREE.Vector3(LD.util.rand(-9, 9), LD.util.rand(4, 12), LD.util.rand(-9, 9));
      spawn(p, 0.9, (o, tt, dt) => { v.y -= 16 * dt; o.position.addScaledVector(v, dt); });
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const o = live[i];
      o.userData._age += dt;
      const t = o.userData._age / o.userData._life;
      if (o.userData._upd) o.userData._upd(o, t, dt);
      if (t >= 1) { scene.remove(o); if (o.geometry) o.geometry.dispose(); live.splice(i, 1); }
    }
  }

  function reset() { for (const o of live) scene.remove(o); live.length = 0; }

  return { init, tracer, muzzle, blood, sparks, explosion, update, reset };
})();


LD.weapons = (function () {
  const U = LD.util;

  const LIST = [
    { name: 'Fists', gun: false, range: 3.2, dmg: 20, rate: 0.35 },
    { name: 'Pistol', gun: true, range: 140, dmg: 45, rate: 0.22, ammo: 68, maxAmmo: 300 },
  ];
  let current = 0;
  let cooldown = 0;

  function currentIsGun() { return LIST[current].gun; }
  function currentName() { return LIST[current].name; }
  function ammoText() {
    const w = LIST[current];
    return w.gun ? String(w.ammo) : '∞';
  }
  function select(i) { if (i >= 0 && i < LIST.length) current = i; }
  function addAmmo(n) { LIST[1].ammo = Math.min(LIST[1].maxAmmo, LIST[1].ammo + n); }
  function resetAmmo() { LIST[1].ammo = 68; current = 0; }

  function raySphere(o, d, c, r) {
    const oc = new THREE.Vector3().subVectors(o, c);
    const b = oc.dot(d);
    const cc = oc.dot(oc) - r * r;
    const disc = b * b - cc;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t;
  }

  // returns hit target descriptor or null
  function shootRay(player, camera) {
    const { origin, dir } = player.aimRay(camera);
    dir.normalize();
    let best = null, bestT = LIST[current].range;

    // pedestrians
    for (const p of LD.traffic.peds) {
      if (p.dead) continue;
      const c = p.pos.clone().setY(2.2);
      const t = raySphere(origin, dir, c, 1.3);
      if (t > 0.5 && t < bestT) { bestT = t; best = { kind: 'ped', ref: p, point: origin.clone().addScaledVector(dir, t) }; }
    }
    // cops
    for (const cop of LD.police.cops) {
      if (cop.dead) continue;
      const c = cop.pos.clone().setY(2.2);
      const t = raySphere(origin, dir, c, 1.4);
      if (t > 0.5 && t < bestT) { bestT = t; best = { kind: 'cop', ref: cop, point: origin.clone().addScaledVector(dir, t) }; }
    }
    // cars
    for (const car of LD.vehicles.cars) {
      if (car === player.inCar || car.destroyed) continue;
      const c = car.pos.clone().setY(1);
      const t = raySphere(origin, dir, c, Math.max(car.spec.w, car.spec.l) / 2);
      if (t > 0.5 && t < bestT) { bestT = t; best = { kind: 'car', ref: car, point: origin.clone().addScaledVector(dir, t) }; }
    }
    // building/ground fallback endpoint
    const endPoint = best ? best.point : origin.clone().addScaledVector(dir, LIST[current].range * 0.5);
    return { best, endPoint, origin, dir };
  }

  function muzzlePos(player, camera) {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    return new THREE.Vector3(player.pos.x, player.pos.y + 3.0, player.pos.z).addScaledVector(dir, 1.2);
  }

  function attack(player, camera) {
    const w = LIST[current];
    if (cooldown > 0) return;
    if (w.gun) {
      if (w.ammo <= 0) return;
      w.ammo--;
      cooldown = w.rate;
      LD.audio.gunshot();
      const mp = muzzlePos(player, camera);
      LD.fx.muzzle(mp);
      const { best, endPoint } = shootRay(player, camera);
      LD.fx.tracer(mp, endPoint);
      LD.traffic.scare(player.pos, 26);
      LD.game.onPlayerAttack(false);
      if (best) applyHit(best, w.dmg, player);
      else LD.fx.sparks(endPoint);
    } else {
      // melee
      cooldown = w.rate;
      LD.audio.punch();
      player.human.armR.rotation.x = -1.6;
      const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      let hit = null, bestD = w.range;
      const check = (arr, kind) => {
        for (const e of arr) {
          if (e.dead) continue;
          const to = e.pos.clone().sub(player.pos); to.y = 0;
          const d = to.length();
          if (d < bestD && to.normalize().dot(fwd) > 0.4) { bestD = d; hit = { kind, ref: e, point: e.pos.clone().setY(2) }; }
        }
      };
      check(LD.traffic.peds, 'ped');
      check(LD.police.cops, 'cop');
      LD.game.onPlayerAttack(true);
      if (hit) applyHit(hit, w.dmg, player);
    }
  }

  function applyHit(hit, dmg, player) {
    if (hit.kind === 'ped') {
      LD.fx.blood(hit.point);
      LD.traffic.killPed(hit.ref);
      LD.game.onPlayerKill(hit.ref, 'shot');
    } else if (hit.kind === 'cop') {
      LD.fx.blood(hit.point);
      hit.ref.health -= dmg;
      if (hit.ref.health <= 0) { LD.police.killCop(hit.ref); LD.game.onCopKilled(); }
      else LD.game.onPlayerAttack(false);
    } else if (hit.kind === 'car') {
      LD.fx.sparks(hit.point);
      hit.ref.damage(dmg * 0.8);
    }
  }

  function update(dt, player) {
    if (cooldown > 0) cooldown -= dt;
    if (LD.input.wasPressed('Digit1')) select(0);
    if (LD.input.wasPressed('Digit2')) select(1);
    // relax melee arm
    if (player && !player.dead && !currentIsGun() && player.human.armR.rotation.x < -0.5) {
      player.human.armR.rotation.x += dt * 6;
    }
  }

  return { attack, update, currentIsGun, currentName, ammoText, select, addAmmo, resetAmmo,
    get index() { return current; } };
})();
