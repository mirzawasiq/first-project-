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
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.42, 18),
      new THREE.MeshStandardMaterial({ color: 0x0e0f13, roughness: 0.95 })
    );
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    g.add(tyre);
    // chrome rim, inset on both faces
    const rimM = new THREE.MeshStandardMaterial({ color: 0xc9ced8, roughness: 0.28, metalness: 0.9 });
    [-1, 1].forEach((sd) => {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.06, 12), rimM);
      rim.rotation.z = Math.PI / 2;
      rim.position.x = sd * 0.21;
      g.add(rim);
    });
    g.position.set(x, r, z);
    return g;
  }

  function buildMesh(type, color) {
    const t = TYPES[type];
    const g = new THREE.Group();

    // automotive paint: smooth, semi-metallic, so it catches highlights
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.65 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.l), paint);
    body.position.y = t.h / 2 + 0.35;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // lower skirt + bumpers break up the slab silhouette
    const trimM = new THREE.MeshStandardMaterial({ color: 0x191b21, roughness: 0.8 });
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.06, 0.26, t.l * 0.96), trimM);
    skirt.position.y = 0.42; skirt.castShadow = true; g.add(skirt);
    [-1, 1].forEach((sd) => {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.98, 0.3, 0.24), trimM);
      bump.position.set(0, t.h * 0.42 + 0.35, sd * (t.l / 2));
      g.add(bump);
    });
    // hood/boot creases
    [-1, 1].forEach((sd) => {
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(t.w * 0.9, 0.1, t.l * 0.2), paint);
      deck.position.set(0, t.h + 0.36, sd * t.l * 0.32);
      g.add(deck);
    });

    // cabin
    const cabinH = type === 'truck' ? t.h * 0.7 : t.h * 0.75;
    // greenhouse: tapered toward the roof so it reads like a windscreen rake
    const cabGeo = new THREE.BoxGeometry(t.w * 0.88, cabinH, t.l * (type === 'truck' ? 0.32 : 0.52));
    const cp = cabGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      if (cp.getY(i) > 0) { cp.setX(i, cp.getX(i) * 0.86); cp.setZ(i, cp.getZ(i) * 0.78); }
    }
    cp.needsUpdate = true; cabGeo.computeVertexNormals();
    const cabin = new THREE.Mesh(cabGeo, new THREE.MeshStandardMaterial({
      color: 0x0c1018, roughness: 0.12, metalness: 0.5,
    }));
    cabin.castShadow = true;
    cabin.position.set(0, t.h + 0.35 + cabinH / 2 - 0.05, type === 'truck' ? t.l * 0.22 : 0);
    g.add(cabin);
    // roof panel in body colour
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(t.w * 0.74, 0.08, t.l * (type === 'truck' ? 0.26 : 0.4)), paint);
    roof.position.set(0, t.h + 0.35 + cabinH - 0.04, cabin.position.z);
    roof.castShadow = true;
    g.add(roof);

    // headlights
    const hlMat = new THREE.MeshStandardMaterial({
      color: 0xfff4c2, emissive: 0xfff0c0, emissiveIntensity: 1.6, roughness: 0.2 });
    [-t.w * 0.32, t.w * 0.32].forEach((x) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), hlMat);
      hl.position.set(x, t.h * 0.6, -t.l / 2);
      g.add(hl);
    });
    // taillights
    const tlMat = new THREE.MeshStandardMaterial({
      color: 0xff3320, emissive: 0xff2a12, emissiveIntensity: 1.3, roughness: 0.3 });
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
        new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.45, metalness: 0.1 }));
      stripe.position.set(0, t.h * 0.55, 0);
      g.add(stripe);
      lightbar = new THREE.Group();
      const rl2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2.2 }));
      const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a5aff, emissive: 0x2a5aff, emissiveIntensity: 2.2 }));
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
          this.lightbar.userData.rl.material.emissiveIntensity = on ? 3.2 : 0.05;
          this.lightbar.userData.bl.material.emissiveIntensity = on ? 0.05 : 3.2;
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
    // NOTE: arrow keys are deliberately NOT bound here — they rotate the
    // camera instead, on foot and in a vehicle alike.
    if (LD.input.isDown('KeyW')) c.throttle += 1;
    if (LD.input.isDown('KeyS')) c.throttle -= 1;
    if (LD.input.isDown('KeyA')) c.steer += 1;
    if (LD.input.isDown('KeyD')) c.steer -= 1;
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
