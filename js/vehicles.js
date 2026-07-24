/* ===== LIBERTY DRIVE — vehicles ===== */
LD.vehicles = (function () {
  const U = LD.util;
  let scene = null;
  const cars = [];

  const TYPES = {
    sedan:  { w: 2.2, l: 4.4, h: 1.3, maxF: 34, maxR: 12, accel: 26, grip: 3.2, turn: 2.2 },
    sports: { w: 2.1, l: 4.2, h: 1.0, maxF: 46, maxR: 14, accel: 38, grip: 4.0, turn: 2.6 },
    truck:  { w: 2.6, l: 5.6, h: 2.1, maxF: 26, maxR: 9,  accel: 18, grip: 2.4, turn: 1.7 },
    police: { w: 2.3, l: 4.6, h: 1.4, maxF: 42, maxR: 13, accel: 34, grip: 3.6, turn: 2.4 },
  };

  function wheel(x, z, r) {
    const w = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.4, 12),
      new THREE.MeshLambertMaterial({ color: 0x111114 })
    );
    w.rotation.z = Math.PI / 2;
    w.position.set(x, r, z);
    return w;
  }

  function buildMesh(type, color) {
    const t = TYPES[type];
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(t.w, t.h, t.l),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = t.h / 2 + 0.35;
    g.add(body);

    // cabin
    const cabinH = type === 'truck' ? t.h * 0.7 : t.h * 0.75;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(t.w * 0.86, cabinH, t.l * (type === 'truck' ? 0.32 : 0.5)),
      new THREE.MeshLambertMaterial({ color: 0x10141c })
    );
    cabin.position.set(0, t.h + 0.35 + cabinH / 2 - 0.05, type === 'truck' ? t.l * 0.22 : 0);
    g.add(cabin);

    // headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2 });
    [-t.w * 0.32, t.w * 0.32].forEach((x) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), hlMat);
      hl.position.set(x, t.h * 0.6, -t.l / 2);
      g.add(hl);
    });
    // taillights
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff3320 });
    [-t.w * 0.32, t.w * 0.32].forEach((x) => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), tlMat);
      tl.position.set(x, t.h * 0.6, t.l / 2);
      g.add(tl);
    });

    // wheels
    const wr = type === 'truck' ? 0.62 : 0.52;
    const wx = t.w / 2 - 0.1, wz = t.l / 2 - 1.0;
    const fl = wheel(-wx, -wz, wr), fr = wheel(wx, -wz, wr);
    const rl = wheel(-wx, wz, wr), rr = wheel(wx, wz, wr);
    g.add(fl); g.add(fr); g.add(rl); g.add(rr);

    let lightbar = null;
    if (type === 'police') {
      body.material.color.setHex(0x1b2540);
      // white doors panel
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.02, 0.5, t.l * 0.5),
        new THREE.MeshLambertMaterial({ color: 0xdfe3ea }));
      stripe.position.set(0, t.h * 0.55, 0);
      g.add(stripe);
      lightbar = new THREE.Group();
      const rl2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x2a5aff }));
      rl2.position.x = -0.3; bl2.position.x = 0.3;
      lightbar.add(rl2); lightbar.add(bl2);
      lightbar.position.set(0, t.h + 0.35 + cabinH + 0.1, 0);
      lightbar.userData = { rl: rl2, bl: bl2 };
      g.add(lightbar);
    }

    return { group: g, wheels: { fl, fr, rl, rr }, lightbar, body };
  }

  function Car(type, color, x, z, heading) {
    const t = TYPES[type];
    const built = buildMesh(type, color);
    scene.add(built.group);

    const car = {
      type, spec: t, isCar: true,
      group: built.group, wheels: built.wheels, lightbar: built.lightbar, body: built.body,
      pos: new THREE.Vector3(x, 0, z),
      heading: heading || 0,
      speed: 0,
      driver: null,
      isPolice: type === 'police',
      health: 100,
      destroyed: false,
      control: { throttle: 0, steer: 0, handbrake: false },
      _wheelSpin: 0,
      _flash: 0,

      updatePhysics(dt) {
        if (this.destroyed) { this._explodeAnim(dt); return; }
        const c = this.control;
        const maxF = t.maxF, maxR = t.maxR;

        // throttle
        if (c.throttle > 0) {
          this.speed += t.accel * c.throttle * dt;
        } else if (c.throttle < 0) {
          // brake if moving forward, else reverse
          if (this.speed > 0.5) this.speed -= t.accel * 1.4 * dt;
          else this.speed += t.accel * 0.6 * c.throttle * dt;
        } else {
          // engine braking
          this.speed *= (1 - 1.6 * dt);
        }
        if (c.handbrake) this.speed *= (1 - 4 * dt);
        this.speed = U.clamp(this.speed, -maxR, maxF);
        if (Math.abs(this.speed) < 0.05) this.speed = 0;

        // steering (scaled by speed, reduced at high speed)
        const speed01 = Math.abs(this.speed) / maxF;
        const steerAuth = t.turn * (0.4 + 0.6 * (1 - speed01 * 0.5));
        this.heading += c.steer * steerAuth * dt * Math.sign(this.speed || 1) * Math.min(1, Math.abs(this.speed) / 4);

        // integrate
        const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        let nx = this.pos.x + fwd.x * this.speed * dt;
        let nz = this.pos.z + fwd.z * this.speed * dt;
        const res = LD.world.collide(nx, nz, Math.max(t.w, t.l) / 2 - 0.4);
        if (res.hit) {
          const impact = Math.abs(this.speed);
          if (impact > 8) { LD.audio.crash(U.clamp(impact / 40, .2, 1)); this.damage(impact * 0.4); }
          this.speed *= -0.18; // bounce back a bit
        }
        this.pos.x = res.x; this.pos.z = res.z;

        // apply transform
        this.group.position.set(this.pos.x, 0, this.pos.z);
        this.group.rotation.y = this.heading;

        // wheels
        this._wheelSpin += this.speed * dt * 2;
        for (const k in this.wheels) this.wheels[k].rotation.x = this._wheelSpin;
        this.wheels.fl.rotation.y = c.steer * 0.5;
        this.wheels.fr.rotation.y = c.steer * 0.5;

        // siren lights flash
        if (this.lightbar) {
          this._flash += dt * 8;
          const on = Math.sin(this._flash) > 0;
          this.lightbar.userData.rl.material.color.setHex(on ? 0xff2a2a : 0x400000);
          this.lightbar.userData.bl.material.color.setHex(on ? 0x2a5aff : 0x000040);
        }
      },

      damage(d) {
        if (this.destroyed) return;
        this.health -= d;
        if (this.health <= 0) this.destroy();
      },

      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.health = 0;
        this.speed = 0;
        LD.audio.crash(1);
        this.body.material.color.setHex(0x1a1a1a);
        this._boom = 1.0;
        LD.fx && LD.fx.explosion(this.pos.clone().setY(1.5));
        // eject driver
        if (this.driver && this.driver.exitCar) {
          const d = this.driver;
          d.exitCar();
          if (d.takeDamage) d.takeDamage(35);
        }
      },

      _explodeAnim(dt) {
        if (this._boom > 0) {
          this._boom -= dt;
          this.group.position.y = Math.sin(this._boom * 20) * 0.1;
        }
      },

      // chase camera when player drives
      updateCamera(camera, camYaw, camPitch, dt) {
        const dist = t.l * 2.2 + 4;
        const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
        const ox = Math.sin(camYaw) * cp * dist;
        const oz = Math.cos(camYaw) * cp * dist;
        const oy = 3.0 + sp * dist;
        const desired = new THREE.Vector3(this.pos.x + ox, this.pos.y + oy, this.pos.z + oz);
        camera.position.lerp(desired, 0.12);
        camera.lookAt(this.pos.x, this.pos.y + 1.5, this.pos.z);
      },

      get speedMph() { return Math.abs(this.speed) * 2.2; },
    };

    cars.push(car);
    return car;
  }

  function init(sc) { scene = sc; }

  // read keyboard into player's car
  function driveInput(car) {
    const c = car.control;
    c.throttle = 0; c.steer = 0;
    if (LD.input.isDown('KeyW') || LD.input.isDown('ArrowUp')) c.throttle += 1;
    if (LD.input.isDown('KeyS') || LD.input.isDown('ArrowDown')) c.throttle -= 1;
    if (LD.input.isDown('KeyA') || LD.input.isDown('ArrowLeft')) c.steer += 1;
    if (LD.input.isDown('KeyD') || LD.input.isDown('ArrowRight')) c.steer -= 1;
    c.handbrake = LD.input.isDown('Space');
  }

  // spawn parked cars in the city (beside sidewalks)
  function spawnParked(count) {
    const { HALF, GRID, ROAD } = LD.world.consts;
    let made = 0, tries = 0;
    while (made < count && tries < count * 8) {
      tries++;
      const rp = LD.world.randomRoadPoint();
      // nudge to curb
      const type = U.pick(['sedan', 'sedan', 'sports', 'truck']);
      const color = U.pick(U.CAR_COLORS);
      const heading = rp.axis === 'z' ? 0 : Math.PI / 2;
      const car = Car(type, color, rp.x, rp.z, heading);
      made++;
    }
    return made;
  }

  function reset() {
    for (const c of cars) scene.remove(c.group);
    cars.length = 0;
  }

  return { init, Car, driveInput, spawnParked, reset, get cars() { return cars; }, TYPES };
})();
