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
      // ---- mouse look ----
      const m = LD._frameMouse;
      this.camYaw -= m.dx * 0.0025;
      this.camPitch = U.clamp(this.camPitch - m.dy * 0.0025, -0.15, 1.15);

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

      const running = LD.input.isDown('ShiftLeft') || LD.input.isDown('ShiftRight');
      const spd = running ? 12 : 6;
      let moving = mv.lengthSq() > 0.001;
      if (moving) {
        mv.normalize();
        this.yaw = Math.atan2(mv.x, mv.z);
        this.speed = spd;
      } else {
        this.speed = 0;
      }

      // integrate horizontal
      let nx = this.pos.x + mv.x * spd * dt;
      let nz = this.pos.z + mv.z * spd * dt;
      const res = LD.world.collide(nx, nz, 0.7);
      this.pos.x = res.x; this.pos.z = res.z;

      // gravity + jump
      if (this.grounded && LD.input.wasPressed('Space')) { this.velY = 9; this.grounded = false; }
      this.velY -= 26 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.grounded = true; }

      // apply to mesh
      human.group.position.copy(this.pos);
      human.group.rotation.y = this.yaw;
      human.aiming = (LD.weapons && LD.weapons.currentIsGun());
      if (!this.grounded) human.airborne(this.velY > 0);
      else human.animate(dt, moving ? spd : 0);

      this._followCam(camera);

      if (this.hurtFlash > 0) this.hurtFlash -= dt;
    },

    _followCam(camera) {
      const dist = 8, height = 4.2;
      const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
      const ox = Math.sin(this.camYaw) * cp * dist;
      const oz = Math.cos(this.camYaw) * cp * dist;
      const oy = height + sp * dist;
      let camX = this.pos.x + ox, camZ = this.pos.z + oz, camY = this.pos.y + oy;
      // keep camera out of buildings (simple)
      const c = LD.world.collide(camX, camZ, 0.5);
      camX = c.x; camZ = c.z;
      camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.35);
      camera.lookAt(this.pos.x, this.pos.y + 3.2, this.pos.z);
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
