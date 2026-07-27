/* ===========================================================
   LIBERTY DRIVE — world pickups
   Health, armour, ammo, cash and weapon crates scattered on the
   pavement. Collected on touch, then respawn on a timer so the
   city never runs dry.
   =========================================================== */
LD.pickups = (function () {
  const U = LD.util;

  const KINDS = {
    health: { color: 0x38d16b, label: 'Health +25', respawn: 26 },
    armor:  { color: 0x4aa8ff, label: 'Armour +50', respawn: 34 },
    ammo:   { color: 0xffd23f, label: 'Ammo',        respawn: 20 },
    cash:   { color: 0x7CFC7A, label: 'Cash',        respawn: 24 },
    shotgun:{ color: 0xff6a2d, label: 'Shotgun',     respawn: 45 },
    smg:    { color: 0xff2d6f, label: 'SMG',         respawn: 45 },
  };

  let scene = null;
  const items = [];

  function makeMesh(kind) {
    const k = KINDS[kind];
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({
        color: k.color, emissive: k.color, emissiveIntensity: 1.4,
        roughness: 0.3, metalness: 0.2,
      })
    );
    core.castShadow = true;
    g.add(core);
    // ground glow so it's findable at night
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 16),
      new THREE.MeshBasicMaterial({
        color: k.color, transparent: true, opacity: 0.22,
        depthWrite: false, blending: THREE.AdditiveBlending })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.3;
    g.add(halo);
    return g;
  }

  function init(sc) {
    scene = sc;
    const plan = ['health', 'health', 'health', 'armor', 'armor',
                  'ammo', 'ammo', 'ammo', 'cash', 'cash', 'cash',
                  'shotgun', 'shotgun', 'smg', 'smg'];
    for (const kind of plan) spawn(kind);
  }

  function spawn(kind) {
    const s = LD.world.safeSpawn();
    const g = makeMesh(kind);
    g.position.set(s.x, 1.6, s.z);
    scene.add(g);
    items.push({ kind, group: g, pos: new THREE.Vector3(s.x, 0, s.z), taken: 0, phase: U.rand(0, 6.3) });
  }

  function collect(it, player) {
    const k = KINDS[it.kind];
    switch (it.kind) {
      case 'health': player.health = Math.min(player.maxHealth, player.health + 25); break;
      case 'armor':  player.armor = Math.min(100, player.armor + 50); break;
      case 'ammo':   LD.weapons.addAmmo(40); break;
      case 'cash': {
        const amt = U.randInt(40, 260);
        LD.game.addMoney(amt);
        LD.hud.toast('Found ' + U.money(amt), 'good');
        LD.audio.cash();
        it.taken = k.respawn; it.group.visible = false;
        return;
      }
      case 'shotgun': LD.weapons.give('shotgun'); break;
      case 'smg':     LD.weapons.give('smg'); break;
    }
    LD.hud.toast(k.label, 'good');
    LD.audio.pickup();
    it.taken = k.respawn;
    it.group.visible = false;
  }

  function update(dt, player) {
    const t = performance.now() * 0.001;
    for (const it of items) {
      if (it.taken > 0) {
        it.taken -= dt;
        if (it.taken <= 0) {
          // reappear somewhere new so the map keeps changing
          const s = LD.world.safeSpawn();
          it.pos.set(s.x, 0, s.z);
          it.group.position.set(s.x, 1.6, s.z);
          it.group.visible = true;
        }
        continue;
      }
      it.group.rotation.y += dt * 1.6;
      it.group.position.y = 1.6 + Math.sin(t * 2 + it.phase) * 0.22;
      if (player.dead) continue;
      const d = Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z);
      if (d < (player.inCar ? 3.4 : 2.4)) collect(it, player);
    }
  }

  function reset() {
    for (const it of items) { it.taken = 0; it.group.visible = true; }
  }

  return { init, update, reset, get items() { return items; }, KINDS };
})();
