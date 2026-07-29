/* ===== LIBERTY DRIVE — on-foot player (rig lives in character.js) ===== */

LD.Player = function (scene) {
  const U = LD.util;

  const human = LD.makeHuman({ shirt: 0x2d6cdf, pants: 0x22262e, skin: 0xe0ac86, hair: 0x241a12 });
  scene.add(human.group);

  const self = {
    human,
    pos: new THREE.Vector3(0, 0, 8),
    vel: new THREE.Vector3(),
    yaw: 0,             // facing
    camYaw: 0, camPitch: 0.35,
    velY: 0, grounded: true,
    shake: 0, fov: 65, bob: 0, vaultCd: 0,
    curSpeed: 0,                 // actual speed, eased toward the target
    stamina: 100, boostT: 0, boostCd: 0, boosting: false,
    health: 100, maxHealth: 100, armor: 0,
    inCar: null,
    speed: 0,
    dead: false,
    hurtFlash: 0,

    respawn(x, z) {
      this.pos.set(x, 0, z);
      this.vel.set(0, 0, 0);
      this.health = this.maxHealth; this.armor = Math.max(this.armor, 0);
      this.dead = false; human.dead = false;
      human.group.rotation.set(0, 0, 0);
      human.group.visible = true;
      this.inCar = null;
    },

    takeDamage(d) {
      if (this.dead) return;
      if (this.armor > 0) {
        const a = Math.min(this.armor, d * 0.6);
        this.armor -= a; d -= a;
      }
      this.health -= d;
      this.hurtFlash = 0.35;
      LD.audio.hurt();
      if (this.health <= 0) { this.health = 0; this.die(); }
    },

    die() {
      if (this.dead) return;
      this.dead = true;
      if (this.inCar) { this.inCar.driver = null; this.inCar = null; }
      human.group.visible = true;
      human.die();
    },

    enterCar(car) {
      this.inCar = car; car.driver = self;
      human.group.visible = false;
      LD.audio.startEngine();
    },
    exitCar() {
      const car = this.inCar;
      if (!car) return;
      this.inCar = null; car.driver = null;
      LD.audio.stopEngine();
      // place beside the car
      const side = new THREE.Vector3(Math.cos(car.heading + Math.PI / 2), 0, Math.sin(car.heading + Math.PI / 2));
      this.pos.set(car.pos.x + side.x * 3, 0, car.pos.z + side.z * 3);
      this.yaw = car.heading;
      human.group.visible = true;
    },

    update(dt, camera) {
      // ---- look: mouse + keyboard, applied on foot AND while driving ----
      const m = LD._frameMouse;
      const sens = LD.settings.lookSensitivity;
      this.camYaw -= m.dx * sens;
      // Pushing the mouse DOWN must look DOWN. camPitch raises the camera and
      // tilts the view downward, so a downward delta has to ADD to it — the
      // old '-' here made the vertical axis inverted.
      const inv = LD.settings.invertY ? -1 : 1;
      this.camPitch = U.clamp(this.camPitch + m.dy * sens * inv, -0.35, 1.25);

      // arrow keys drive the camera too, so it is usable with no mouse at all
      const kYaw = 2.4 * dt, kPit = 1.6 * dt;
      if (LD.input.isDown('ArrowLeft'))  this.camYaw += kYaw;
      if (LD.input.isDown('ArrowRight')) this.camYaw -= kYaw;
      if (LD.input.isDown('ArrowUp'))    this.camPitch = U.clamp(this.camPitch - kPit, -0.35, 1.25);
      if (LD.input.isDown('ArrowDown'))  this.camPitch = U.clamp(this.camPitch + kPit, -0.35, 1.25);

      if (this.dead || this.inCar) {
        // camera still handled elsewhere / by car; but dead body cam:
        if (this.dead && !this.inCar) this._deadCam(camera);
        this.human.animate(dt, 0);
        return;
      }

      // ---- movement (camera relative) ----
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      let mv = new THREE.Vector3();
      if (LD.input.isDown('KeyW')) mv.add(fwd);
      if (LD.input.isDown('KeyS')) mv.sub(fwd);
      if (LD.input.isDown('KeyD')) mv.add(right);
      if (LD.input.isDown('KeyA')) mv.sub(right);

      const S = LD.settings;
      const running = LD.input.isDown('ShiftLeft') || LD.input.isDown('ShiftRight');
      let moving = mv.lengthSq() > 0.001;
      if (moving) { mv.normalize(); this.yaw = Math.atan2(mv.x, mv.z); }

      // ---- BOOST ----------------------------------------------------
      // Sprint + Space = surge forward (GTA-style). Space on its own is
      // still a jump, so the old control is untouched. E always boosts.
      this.boostCd -= dt;
      // wasPressed() CONSUMES the key edge, so read Space exactly once and
      // decide afterwards whether it was a boost or a jump — calling it
      // inside the boost condition swallowed the press and killed jumping.
      const spaceEdge = LD.input.wasPressed('Space');
      const wantBoost = LD.input.wasPressed('KeyE') || (spaceEdge && running && moving);
      let spaceUsedForBoost = false;
      if (wantBoost && moving && this.boostCd <= 0 && this.stamina >= S.staminaToBoost) {
        this.boostT = S.boostTime;
        this.boostCd = S.boostCooldown;
        spaceUsedForBoost = spaceEdge;
        LD.audio.whoosh && LD.audio.whoosh();
      }
      if (this.boostT > 0 && moving && this.stamina > 0) {
        this.boostT -= dt;
        this.stamina -= S.staminaBoostDrain * dt;
      } else {
        this.boostT = 0;
      }
      this.boosting = this.boostT > 0;

      // stamina: drains while sprinting, recovers otherwise
      if (!this.boosting) {
        if (running && moving) this.stamina -= S.staminaRunDrain * dt;
        else this.stamina += S.staminaRegen * dt;
      }
      this.stamina = U.clamp(this.stamina, 0, S.staminaMax);

      // ---- speed with real acceleration ------------------------------
      let target = 0;
      if (moving) {
        target = this.boosting ? S.boostSpeed : (running && this.stamina > 0 ? S.runSpeed : S.walkSpeed);
      }
      // step toward the target at a fixed rate — frame-rate independent
      if (target > this.curSpeed) this.curSpeed = Math.min(target, this.curSpeed + S.accel * dt);
      else this.curSpeed = Math.max(target, this.curSpeed - S.decel * dt);
      const spd = this.curSpeed;
      this.speed = spd;

      // integrate horizontal
      let nx = this.pos.x + mv.x * spd * dt;
      let nz = this.pos.z + mv.z * spd * dt;
      const res = LD.world.collide(nx, nz, 0.7);
      // Parkour vault: sprinting into something low while grounded hops you
      // over it instead of grinding to a stop against the wall.
      this.vaultCd -= dt;
      if (res.hit && (running || this.boosting) && moving && this.grounded && this.vaultCd <= 0) {
        this.velY = 10.5; this.grounded = false; this.vaultCd = 0.6;
        this.pos.x += mv.x * 0.8; this.pos.z += mv.z * 0.8;
        LD.audio.footstep && LD.audio.footstep(1);
      }
      this.pos.x = res.x; this.pos.z = res.z;

      // footsteps, timed off the stride
      if (moving && this.grounded && spd > 0.5) {
        this.bob += dt * (3.2 + spd * 0.42);          // cadence follows speed
        if (this.bob > Math.PI) {
          this.bob -= Math.PI;
          LD.audio.footstep && LD.audio.footstep(this.boosting ? 1 : (running ? 0.75 : 0.45));
        }
      }
      // running rattles the camera a little
      // camera rattle scales with how fast you're actually going
      const shakeTarget = moving ? U.clamp((spd - S.walkSpeed) / (S.boostSpeed - S.walkSpeed), 0, 1) : 0;
      this.shake = U.lerp(this.shake, this.boosting ? 1.6 : shakeTarget, dt * 6);

      // gravity + jump
      if (this.grounded && spaceEdge && !spaceUsedForBoost) { this.velY = 9.5; this.grounded = false; }
      this.velY -= 26 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.grounded = true; }

      // apply to mesh
      human.group.position.copy(this.pos);
      human.group.rotation.y = this.yaw;
      human.aiming = (LD.weapons && LD.weapons.currentIsGun());
      if (!this.grounded) human.airborne(this.velY > 0);
      else human.animate(dt, spd);

      this._followCam(camera);

      if (this.hurtFlash > 0) this.hurtFlash -= dt;
    },

    _followCam(camera) {
      const dist = 7.4, height = 4.0;
      const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
      const ox = Math.sin(this.camYaw) * cp * dist;
      const oz = Math.cos(this.camYaw) * cp * dist;
      const oy = height + sp * dist;
      // over-the-shoulder: push the rig to the right of the aim line
      const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
      const shoulder = LD.settings.shoulder;
      let camX = this.pos.x + ox + rx * shoulder;
      let camZ = this.pos.z + oz + rz * shoulder;
      let camY = this.pos.y + oy;
      const c = LD.world.collide(camX, camZ, 0.5);
      camX = c.x; camZ = c.z;

      // sprint shake — small, high frequency, never nauseating
      const t = performance.now() * 0.001;
      const amp = this.shake * 0.11;
      camX += Math.sin(t * 21) * amp;
      camY += Math.sin(t * 27 + 1.3) * amp * 1.3;

      camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.35);
      camera.lookAt(
        this.pos.x + rx * shoulder * 0.55,
        this.pos.y + 3.0 + Math.sin(t * 27) * amp * 0.6,
        this.pos.z + rz * shoulder * 0.55);

      // FOV opens up as you pick up speed — cheap but very effective
      const targetFov = 65 + this.shake * 9;   // boost pushes shake past 1
      this.fov = U.lerp(this.fov, targetFov, 0.08);
      if (Math.abs(camera.fov - this.fov) > 0.01) {
        camera.fov = this.fov; camera.updateProjectionMatrix();
      }
    },

    _deadCam(camera) {
      const target = new THREE.Vector3(this.pos.x, 8, this.pos.z + 6);
      camera.position.lerp(target, 0.05);
      camera.lookAt(this.pos.x, 1, this.pos.z);
    },

    // forward ray origin/dir for shooting (from camera)
    aimRay(camera) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3(this.pos.x, this.pos.y + 3.0, this.pos.z);
      return { origin, dir };
    }
  };

  return self;
};
