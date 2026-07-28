/* ===========================================================
   LIBERTY DRIVE — vehicles
   -----------------------------------------------------------
   PROPORTIONS. The world is ~2.22 units per metre (a 1.8 m
   character is 4.0 units tall). The old cars were 4.4 units
   long — barely 2 m — so a person towered over them and they
   read as toy blocks. Real dimensions at this scale:

       sedan   4.7 x 1.83 x 1.45 m  ->  10.4 x 4.07 x 3.22
       height/length ratio 0.31 (the old cars were 0.60)

   So bodies are now longer, wider and much LOWER, which is
   what actually makes a car look like a car.

   Speeds are in units/sec and, at this scale, 1 unit/s is
   almost exactly 1 mph — so maxF doubles as the top speed.
   =========================================================== */
LD.vehicles = (function () {
  const U = LD.util;
  let scene = null;
  const cars = [];

  // w = width, l = length, h = body (sill->beltline), roof = greenhouse
  // wheelR = tyre radius, track = wheel inset from the body side
  const TYPES = {
    sedan: {
      w: 4.05, l: 10.4, h: 1.55, roof: 1.22, wheelR: 0.80,
      maxF: 62, maxR: 20, accel: 42, grip: 3.2, turn: 2.0, mass: 1,
    },
    sports: {
      w: 4.15, l: 9.8, h: 1.35, roof: 1.06, wheelR: 0.78,
      maxF: 88, maxR: 24, accel: 64, grip: 4.0, turn: 2.35, mass: 0.85,
    },
    truck: {
      w: 4.5, l: 12.6, h: 2.30, roof: 1.36, wheelR: 1.02,
      maxF: 48, maxR: 16, accel: 28, grip: 2.4, turn: 1.55, mass: 1.6,
    },
    police: {
      w: 4.12, l: 10.7, h: 1.60, roof: 1.24, wheelR: 0.82,
      maxF: 80, maxR: 22, accel: 56, grip: 3.6, turn: 2.2, mass: 1.05,
    },
  };

  // ---------- geometry helpers ----------
  /* Box whose top face is pulled in — the single cheapest way to stop a
     box reading as a box. Real bodywork tumblehome does exactly this. */
  function taperedBox(w, h, d, sx, sz, frontZ) {
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * sx);
        // pull the top-front in further to rake a windscreen
        const z = p.getZ(i);
        p.setZ(i, z * (z < 0 && frontZ ? frontZ : sz));
      }
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  function wheel(t, x, z) {
    const r = t.wheelR;
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, r * 0.72, 20),
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.96 })
    );
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    g.add(tyre);
    // dished alloy face on the outboard side only
    const rimM = new THREE.MeshStandardMaterial({ color: 0xb9c0cb, roughness: 0.3, metalness: 0.92 });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.08, 14), rimM);
    face.rotation.z = Math.PI / 2;
    face.position.x = Math.sign(x) * (r * 0.37);
    g.add(face);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.14, 10), rimM);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = Math.sign(x) * (r * 0.4);
    g.add(hub);
    g.position.set(x, r, z);
    return g;
  }

  function buildMesh(type, color) {
    const t = TYPES[type];
    const g = new THREE.Group();
    const clear = t.wheelR * 0.55;                 // ride height
    const beltY = clear + t.h;                     // top of the lower body
    const roofY = beltY + t.roof;

    // Car paint is a DIELECTRIC with a glossy clearcoat, not a metal. At
    // metalness 0.55 the sky reflection swamped the albedo and every car
    // rendered as pale ghost-white — the same trap as the wet-road bug.
    const paint = new THREE.MeshStandardMaterial({
      color, roughness: 0.30, metalness: 0.05, envMapIntensity: 0.55,
    });
    const trim = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x0a141e, roughness: 0.08, metalness: 0.0,
      envMapIntensity: 0.9, transparent: true, opacity: 0.85,
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc8cdd6, roughness: 0.22, metalness: 0.95 });

    // ---- lower body, tapered at the top and pinched at both ends ----
    const bodyGeo = taperedBox(t.w, t.h, t.l, 0.93, 0.96);
    const body = new THREE.Mesh(bodyGeo, paint);
    body.position.y = clear + t.h / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // rocker panel / sill, darker, so the car visually sits down on its wheels
    const sill = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.99, clear * 0.9, t.l * 0.86), trim);
    sill.position.y = clear * 0.55;
    g.add(sill);

    // ---- greenhouse: short, low, raked at the front ----
    const cabLen = t.l * (type === 'truck' ? 0.32 : 0.50);
    const cabGeo = taperedBox(t.w * 0.9, t.roof, cabLen, 0.82, 0.72, 0.45);
    const cabin = new THREE.Mesh(cabGeo, paint);
    cabin.position.set(0, beltY + t.roof / 2, type === 'truck' ? t.l * 0.20 : t.l * 0.04);
    cabin.castShadow = true;
    g.add(cabin);

    // glass sits just inside the greenhouse shell
    const winGeo = taperedBox(t.w * 0.905, t.roof * 0.74, cabLen * 0.94, 0.83, 0.73, 0.46);
    const windows = new THREE.Mesh(winGeo, glass);
    windows.position.set(0, beltY + t.roof * 0.40, cabin.position.z);
    g.add(windows);

    // roof panel in body colour
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(t.w * 0.70, 0.07, cabLen * 0.62), paint);
    roof.position.set(0, roofY - 0.03, cabin.position.z + cabLen * 0.06);
    roof.castShadow = true;
    g.add(roof);

    // ---- bonnet and boot: long, low, and clearly separate volumes ----
    const noseZ = -t.l / 2, tailZ = t.l / 2;
    const hood = new THREE.Mesh(
      taperedBox(t.w * 0.94, 0.16, t.l * 0.30, 0.9, 0.86), paint);
    hood.position.set(0, beltY + 0.02, noseZ + t.l * 0.18);
    g.add(hood);
    const boot = new THREE.Mesh(
      taperedBox(t.w * 0.94, 0.16, t.l * 0.18, 0.9, 0.88), paint);
    boot.position.set(0, beltY + 0.02, tailZ - t.l * 0.10);
    g.add(boot);

    // ---- wheel arches ----
    const axleF = noseZ + t.l * 0.21, axleR = tailZ - t.l * 0.19;
    [axleF, axleR].forEach((az) => {
      [-1, 1].forEach((sd) => {
        const arch = new THREE.Mesh(
          new THREE.TorusGeometry(t.wheelR * 1.16, 0.13, 6, 12, Math.PI),
          trim
        );
        arch.rotation.y = Math.PI / 2;
        arch.position.set(sd * (t.w / 2 - 0.04), t.wheelR, az);
        g.add(arch);
      });
    });

    // ---- bumpers, grille, lights ----
    [[noseZ, 1], [tailZ, -1]].forEach(([bz, dir]) => {
      const bump = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.97, 0.34, 0.3), trim);
      bump.position.set(0, clear + 0.28, bz - dir * 0.06);
      g.add(bump);
    });
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(t.w * 0.46, t.h * 0.34, 0.12), trim);
    grille.position.set(0, clear + t.h * 0.62, noseZ - 0.02);
    g.add(grille);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.5, 0.06, 0.06), chrome);
    badge.position.set(0, clear + t.h * 0.62, noseZ - 0.06);
    g.add(badge);

    const hlMat = new THREE.MeshStandardMaterial({
      color: 0xfff6dc, emissive: 0xfff0c0, emissiveIntensity: 1.4, roughness: 0.15 });
    const tlMat = new THREE.MeshStandardMaterial({
      color: 0xff3320, emissive: 0xff2a12, emissiveIntensity: 1.1, roughness: 0.3 });
    [-1, 1].forEach((sd) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.26, 0.22, 0.1), hlMat);
      hl.position.set(sd * t.w * 0.31, clear + t.h * 0.78, noseZ - 0.03);
      g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.24, 0.2, 0.1), tlMat);
      tl.position.set(sd * t.w * 0.32, clear + t.h * 0.80, tailZ + 0.03);
      g.add(tl);
    });

    // ---- door mirrors ----
    [-1, 1].forEach((sd) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.09), trim);
      arm.position.set(sd * (t.w / 2 + 0.1), beltY + t.roof * 0.30, cabin.position.z - cabLen * 0.38);
      g.add(arm);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.26), paint);
      cap.position.set(sd * (t.w / 2 + 0.24), beltY + t.roof * 0.30, cabin.position.z - cabLen * 0.38);
      g.add(cap);
    });

    // ---- wheels ----
    const wx = t.w / 2 - t.wheelR * 0.42;
    const fl = wheel(t, -wx, axleF), fr = wheel(t, wx, axleF);
    const rl = wheel(t, -wx, axleR), rr = wheel(t, wx, axleR);
    g.add(fl); g.add(fr); g.add(rl); g.add(rr);

    let lightbar = null;
    if (type === 'police') {
      paint.color.setHex(0x1b2540);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(t.w + 0.03, t.h * 0.42, t.l * 0.4),
        new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.45 }));
      stripe.position.set(0, clear + t.h * 0.5, 0);
      g.add(stripe);
      lightbar = new THREE.Group();
      const rl2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.34),
        new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2.2 }));
      const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x2a5aff, emissive: 0x2a5aff, emissiveIntensity: 2.2 }));
      rl2.position.x = -0.36; bl2.position.x = 0.36;
      lightbar.add(rl2); lightbar.add(bl2);
      lightbar.position.set(0, roofY + 0.1, cabin.position.z);
      lightbar.userData = { rl: rl2, bl: bl2 };
      g.add(lightbar);
    }

    return { group: g, wheels: { fl, fr, rl, rr }, lightbar, body, paint,
             dims: { clear, beltY, roofY, axleF, axleR } };
  }

  function Car(type, color, x, z, heading) {
    const t = TYPES[type];
    const built = buildMesh(type, color);
    scene.add(built.group);
    // roll must be applied in the car's own frame, so yaw first
    built.group.rotation.order = 'YXZ';

    const car = {
      type, spec: t, isCar: true,
      group: built.group, wheels: built.wheels, lightbar: built.lightbar,
      body: built.body, paint: built.paint, dims: built.dims,
      pos: new THREE.Vector3(x, 0, z),
      heading: heading || 0,
      speed: 0,
      driver: null,
      isPolice: type === 'police',
      health: 100,
      destroyed: false,
      control: { throttle: 0, steer: 0, handbrake: false },
      _wheelSpin: 0, _flash: 0, _steerVis: 0,
      _roll: 0, _pitch: 0, _bounce: 0, _lastSpeed: 0,

      updatePhysics(dt) {
        if (this.destroyed) { this._explodeAnim(dt); return; }
        const c = this.control;

        if (c.throttle > 0) {
          this.speed += t.accel * c.throttle * dt;
        } else if (c.throttle < 0) {
          if (this.speed > 0.5) this.speed -= t.accel * 1.5 * dt;
          else this.speed += t.accel * 0.5 * c.throttle * dt;
        } else {
          this.speed *= (1 - 1.5 * dt);
        }
        if (c.handbrake) this.speed *= (1 - 3.4 * dt);
        this.speed = U.clamp(this.speed, -t.maxR, t.maxF);
        if (Math.abs(this.speed) < 0.06) this.speed = 0;

        const speed01 = Math.abs(this.speed) / t.maxF;
        const steerAuth = t.turn * (0.4 + 0.6 * (1 - speed01 * 0.5));
        const steerRate = c.steer * steerAuth * dt *
          Math.sign(this.speed || 1) * Math.min(1, Math.abs(this.speed) / 6);
        this.heading += steerRate;

        // ---- integrate, colliding at BOTH axles ----
        // A single circle around a 10-unit car is far too fat and snags on
        // everything; two circles at the axles track the real footprint.
        const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        let nx = this.pos.x + fwd.x * this.speed * dt;
        let nz = this.pos.z + fwd.z * this.speed * dt;
        const r = t.w * 0.52;
        const half = t.l * 0.30;
        let hit = false;
        for (const s of [half, -half]) {
          const px = nx + fwd.x * s, pz = nz + fwd.z * s;
          const res = LD.world.collide(px, pz, r);
          if (res.hit) {
            hit = true;
            nx += res.x - px; nz += res.z - pz;
          }
        }
        if (hit) {
          const impact = Math.abs(this.speed);
          if (impact > 10) { LD.audio.crash(U.clamp(impact / 60, .2, 1)); this.damage(impact * 0.35); }
          this.speed *= -0.15;
        }
        this.pos.x = nx; this.pos.z = nz;

        // ---- body dynamics: roll into corners, squat and dive ----
        const accelSig = (this.speed - this._lastSpeed) / Math.max(dt, 0.0001);
        this._lastSpeed = this.speed;
        const rollTarget = -c.steer * speed01 * 0.16 / t.mass;
        const pitchTarget = U.clamp(-accelSig * 0.0016 / t.mass, -0.07, 0.07);
        this._roll = U.lerp(this._roll, rollTarget, Math.min(1, dt * 7));
        this._pitch = U.lerp(this._pitch, pitchTarget, Math.min(1, dt * 6));
        // light suspension float over speed
        this._bounce = Math.sin(performance.now() * 0.008) * 0.012 * speed01;

        this.group.position.set(this.pos.x, this._bounce, this.pos.z);
        this.group.rotation.set(this._pitch, this.heading, this._roll);

        // ---- wheels ----
        this._wheelSpin += (this.speed / t.wheelR) * dt;
        for (const k in this.wheels) this.wheels[k].rotation.x = this._wheelSpin;
        this._steerVis = U.lerp(this._steerVis, c.steer * 0.46, Math.min(1, dt * 9));
        this.wheels.fl.rotation.y = this._steerVis;
        this.wheels.fr.rotation.y = this._steerVis;

        if (this.lightbar) {
          this._flash += dt * 8;
          const on = Math.sin(this._flash) > 0;
          this.lightbar.userData.rl.material.emissiveIntensity = on ? 3.2 : 0.05;
          this.lightbar.userData.bl.material.emissiveIntensity = on ? 0.05 : 3.2;
        }
      },

      damage(d) {
        if (this.destroyed) return;
        this.health -= d;
        // paint scuffs and dulls as it takes hits
        const w = U.clamp(1 - this.health / 100, 0, 1);
        this.paint.roughness = U.lerp(0.30, 0.88, w);
        this.paint.envMapIntensity = U.lerp(0.55, 0.10, w);
        if (this.health <= 0) this.destroy();
      },

      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.health = 0; this.speed = 0;
        LD.audio.crash(1);
        this.paint.color.setHex(0x1a1a1a);
        this._boom = 1.0;
        LD.fx && LD.fx.explosion(this.pos.clone().setY(1.5));
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

      updateCamera(camera, camYaw, camPitch, dt) {
        const dist = t.l * 1.15 + 4;
        const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
        const ox = Math.sin(camYaw) * cp * dist;
        const oz = Math.cos(camYaw) * cp * dist;
        const oy = this.dims.roofY + 1.2 + sp * dist;
        const desired = new THREE.Vector3(this.pos.x + ox, oy, this.pos.z + oz);
        camera.position.lerp(desired, 0.12);
        camera.lookAt(this.pos.x, this.dims.beltY, this.pos.z);
      },

      // at ~2.22 units per metre, 1 unit/s is almost exactly 1 mph
      get speedMph() { return Math.abs(this.speed) * 1.007; },
    };

    cars.push(car);
    return car;
  }

  function init(sc) { scene = sc; }

  function driveInput(car) {
    const c = car.control;
    c.throttle = 0; c.steer = 0;
    // NOTE: arrow keys are deliberately NOT bound here — they rotate the
    // camera instead, on foot and in a vehicle alike.
    if (LD.input.isDown('KeyW')) c.throttle += 1;
    if (LD.input.isDown('KeyS')) c.throttle -= 1;
    if (LD.input.isDown('KeyA')) c.steer += 1;
    if (LD.input.isDown('KeyD')) c.steer -= 1;
    c.handbrake = LD.input.isDown('Space');
  }

  function spawnParked(count) {
    let made = 0, tries = 0;
    while (made < count && tries < count * 8) {
      tries++;
      const rp = LD.world.randomRoadPoint();
      const type = U.pick(['sedan', 'sedan', 'sports', 'truck']);
      const heading = rp.axis === 'z' ? 0 : Math.PI / 2;
      Car(type, U.pick(U.CAR_COLORS), rp.x, rp.z, heading);
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
