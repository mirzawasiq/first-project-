/* ===== LIBERTY DRIVE — main game orchestrator ===== */
LD.game = (function () {
  const U = LD.util;

  let renderer, scene, camera, clock, composer = null, bloom = null, fxaa = null;
  let player;
  let playing = false, paused = false, dying = false;
  const headlights = [];
  let money = 500;
  let last = 0;

  LD._frameMouse = { dx: 0, dy: 0, downEdge: false };

  // ---------- setup ----------
  function init() {
    const canvas = document.getElementById('scene');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // sRGB + filmic tone mapping is most of the "why does this suddenly look
    // like a real game" difference: lighting stops clipping to flat colour
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.86;
    renderer.physicallyCorrectLights = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(0, 12, 24);
    clock = new THREE.Clock();

    // ---- post-processing: bloom makes the night neon/headlights glow ----
    if (window.THREE && THREE.EffectComposer) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.12, 0.55, 0.92);
      composer.addPass(bloom);
      fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      composer.addPass(fxaa);
      sizeFXAA();
    }

    LD.game.renderer = renderer;          // world/env map needs it during build
    LD.input.init(canvas);
    LD.hud.init();
    LD.world.build(scene);
    LD.weather.init(scene, camera);
    LD.pickups.init(scene);
    LD.vehicles.init(scene);
    LD.traffic.init(scene);
    LD.fx.init(scene);
    LD.police.init(scene);
    LD.missions.init(scene);
    LD.quality.init(renderer, {
      bloom, fxaa, composer, sun: scene.children.find((c) => c.isDirectionalLight),
    });

    // populate the city
    LD.vehicles.spawnParked(26);
    LD.traffic.spawnTraffic(14);
    LD.traffic.spawnPeds(38);

    player = LD.Player(scene);
    const sp = LD.world.safeSpawn();
    player.respawn(sp.x, sp.z);

    // two real spotlights, re-parented to whatever the player drives
    for (let i = 0; i < 2; i++) {
      const sp = new THREE.SpotLight(0xfff0cf, 0, 95, 0.52, 0.45, 1.4);
      sp.castShadow = false;
      scene.add(sp); scene.add(sp.target);
      headlights.push(sp);
    }

    window.addEventListener('resize', onResize);
    document.getElementById('startBtn').addEventListener('click', start);

    // pause / menu toggle
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && playing) toggleMenu();
      if (e.code === 'KeyG' && playing) LD.quality.cycle();
    });
    // clicking canvas resumes audio
    canvas.addEventListener('click', () => LD.audio.resume());

    document.getElementById('loading').classList.add('hidden');
    requestAnimationFrame(loop);
  }

  function sizeFXAA() {
    if (!fxaa) return;
    const pr = renderer.getPixelRatio();
    fxaa.material.uniforms.resolution.value.set(
      1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    if (bloom) bloom.setSize(window.innerWidth, window.innerHeight);
    sizeFXAA();
  }

  function start() {
    document.getElementById('menu').classList.add('hidden');
    LD.hud.show();
    LD.audio.resume();
    LD.audio.startAmbience();
    playing = true; paused = false;
    LD.input.requestLock();
    LD.missions.begin(player);
    LD.hud.toast('Welcome to Liberty. Find a car and cause some chaos!', 'good');
  }

  function toggleMenu() {
    paused = !paused;
    const menu = document.getElementById('menu');
    if (paused) { menu.classList.remove('hidden'); document.exitPointerLock && document.exitPointerLock(); }
    else { menu.classList.add('hidden'); LD.input.requestLock(); }
  }

  // ---------- crime / wanted callbacks ----------
  function escalate(min) {
    if (LD.police.stars < min) LD.police.setStars(min);
  }
  function onPlayerAttack(isMelee) {
    if (isMelee) LD.police.addWanted(0.15);
    else { escalate(1); LD.police.addWanted(0.25); }   // firing a gun draws attention
  }
  function onPlayerKill(target, cause) {
    if (cause === 'car') { LD.police.addWanted(1.0); LD.hud.toast('Hit and run!', 'bad'); }
    else LD.police.addWanted(1.1);
    escalate(cause === 'car' ? 1 : 2);
  }
  function onCopKilled() {
    LD.police.addWanted(1.4); escalate(3);
    LD.weapons.addAmmo(14);
    LD.hud.toast('Cop down — heat rising! (+ammo)', 'bad');
  }
  function addMoney(n) { money += n; }
  function spendMoney(n) { money = Math.max(0, money - n); }

  // ---------- death / bust ----------
  function startWasted() {
    if (dying) return;
    dying = true;
    LD.hud.bigFlash('WASTED', 'wasted');
    LD.audio.stopEngine();
    setTimeout(() => respawn('hospital'), 2600);
  }
  function onBusted() {
    if (dying || !player) return;
    dying = true;
    LD.hud.bigFlash('BUSTED', 'busted');
    LD.audio.stopEngine();
    setTimeout(() => respawn('jail'), 2600);
  }
  function respawn(kind) {
    const fee = kind === 'jail' ? Math.round(money * 0.15) : Math.round(money * 0.1);
    spendMoney(fee);
    // respawn on a clear stretch of road
    const sp = LD.world.safeSpawn();
    player.respawn(sp.x, sp.z);
    player.armor = 0;
    LD.police.clear();
    LD.weapons.select(0);
    LD.pickups.reset();
    LD.hud.clearFlash();
    dying = false;
    LD.hud.toast((kind === 'jail' ? 'Released. Bribe: ' : 'Patched up. Bill: ') + U.money(fee), 'bad');
  }

  // ---------- interactions ----------
  function nearestCar(maxDist) {
    let best = null, bestD = maxDist;
    for (const car of LD.vehicles.cars) {
      if (car.destroyed) continue;
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function handleInteract() {
    if (player.dead) { LD.hud.prompt(''); return; }
    if (player.inCar) {
      if (LD.input.wasPressed('KeyF')) player.exitCar();
      LD.hud.prompt('');
      return;
    }
    const car = nearestCar(7.2);
    if (car) {
      LD.hud.prompt('Press <b>F</b> to ' + (car.isPolice ? 'steal police car' : 'enter vehicle'));
      if (LD.input.wasPressed('KeyF')) {
        const wasOccupied = car.isTraffic || car.copCar;
        // jack
        if (car.isTraffic) { spawnFleeingDriver(car); LD.police.addWanted(0.6); escalate(1); LD.hud.toast('Grand Theft Auto!', 'bad'); }
        if (car.isPolice) { LD.police.addWanted(1.0); escalate(2); LD.hud.toast('Stole a cop car!', 'bad'); }
        car.isTraffic = false; car.ai = null; car.copCar = null; car.control = { throttle: 0, steer: 0, handbrake: false };
        player.enterCar(car);
      }
    } else {
      LD.hud.prompt('');
    }
  }

  function spawnFleeingDriver(car) {
    // a scared pedestrian appears next to the jacked car
    LD.traffic.spawnPeds && (function () {
      LD.traffic.spawnPeds(1);
    })();
    LD.traffic.scare(car.pos, 14);
  }

  // ---------- main loop ----------
  function loop(t) {
    requestAnimationFrame(loop);
    let dt = clock.getDelta();
    dt = Math.min(dt, 0.05);

    LD._frameMouse = LD.input.consumeMouse();

    if (playing && !paused && !document.hidden) {
      updateSim(dt);
    }
    LD.quality.tick(dt);
    if (composer && (bloom.enabled || fxaa.enabled)) composer.render();
    else renderer.render(scene, camera);
  }

  function updateSim(dt) {
    LD.world.update(dt);
    LD.world.followSun(player.pos);
    if (bloom) bloom.strength = 0.07 + LD.world.nightFactor * 0.62;

    // vehicle input for the player's car
    if (player.inCar && !player.dead) LD.vehicles.driveInput(player.inCar);

    // AI controllers set their car controls / move peds & cops
    LD.traffic.update(dt, player);
    LD.police.update(dt, player, camera);

    // physics pass for every car
    for (const car of LD.vehicles.cars) car.updatePhysics(dt);

    // player (mouselook always applied inside; foot movement/cam when on foot)
    player.update(dt, camera);

    if (player.inCar) {
      player.pos.copy(player.inCar.pos);
      player.inCar.updateCamera(camera, player.camYaw, player.camPitch, dt);
      const spd01 = Math.abs(player.inCar.speed) / player.inCar.spec.maxF;
      LD.audio.updateEngine(spd01, Math.max(0, player.inCar.control.throttle));
    }

    // combat
    LD.weapons.update(dt, player);
    if (LD._frameMouse.downEdge && !player.dead && !player.inCar && !paused) {
      LD.weapons.attack(player, camera);
    }

    LD.weather.update(dt, player.pos);
    LD.pickups.update(dt, player);
    updateHeadlights();
    LD.fx.update(dt);
    LD.missions.update(dt, player);
    handleInteract();

    if (player.dead && !dying) startWasted();

    updateHUD();
  }

  // headlights follow the driven car and switch on when it gets dark or wet
  function updateHeadlights() {
    const car = player.inCar;
    const want = Math.max(LD.world.nightFactor, LD.weather.rainLevel * 0.8);
    if (!car || car.destroyed || want < 0.18) {
      for (const h of headlights) h.intensity = 0;
      return;
    }
    const fwd = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    headlights.forEach((h, i) => {
      const off = (i === 0 ? -1 : 1) * car.spec.w * 0.31;
      h.position.set(
        car.pos.x + fwd.x * (car.spec.l / 2) + side.x * off, car.dims.clear + car.spec.h * 0.78,
        car.pos.z + fwd.z * (car.spec.l / 2) + side.z * off);
      h.target.position.set(
        car.pos.x + fwd.x * 46 + side.x * off, -1.4, car.pos.z + fwd.z * 46 + side.z * off);
      h.target.updateMatrixWorld();
      h.intensity = 2.6 * want;
    });
  }

  function updateHUD() {
    LD.hud.setMoney(money);
    LD.hud.setHealth(player.health, player.armor);
    LD.hud.setStamina(player.stamina);
    LD.hud.setBoosting(player.boosting && !player.inCar);
    LD.hud.setWanted(LD.police.stars);
    LD.hud.setWeapon(LD.weapons.currentName(), LD.weapons.currentIsGun() ? LD.weapons.ammoText() : '');
    LD.hud.setClock(LD.world.timeString() + '  ' + LD.weather.label);
    LD.hud.speedo(!!player.inCar, player.inCar ? player.inCar.speedMph : 0);
    LD.hud.drawMinimap(player);
    LD.hud.setPerf(LD.quality.fps, LD.quality.label);
    LD.hud.setLockHint(!LD.input.mouse.locked);

    // red vignette on hurt
    if (player.hurtFlash > 0) {
      renderer.domElement.style.filter = 'saturate(1.2) brightness(' + (0.7 + Math.random() * 0.1) + ')';
    } else {
      renderer.domElement.style.filter = '';
    }
  }

  // public API used by other modules
  return {
    init,
    onPlayerAttack, onPlayerKill, onCopKilled, onBusted,
    addMoney, spendMoney,
    get money() { return money; },
    get player() { return player; },
    get scene() { return scene; },
    get camera() { return camera; },
    renderer: null,
  };
})();

window.addEventListener('DOMContentLoaded', () => LD.game.init());
