/* ===== LIBERTY DRIVE — mission / job system ===== */
LD.missions = (function () {
  const U = LD.util;
  let scene = null;
  let marker = null, beam = null;
  let phase = 'idle';       // idle | pickup | deliver
  let target = new THREE.Vector3();
  let reward = 0, timer = 0, cooldown = 0;
  let text = '';

  function init(sc) {
    scene = sc;
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 0.4, 20);
    marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.55,
    }));
    marker.position.y = 0.4;
    beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    beam.position.y = 20;
    marker.add(beam);
    marker.visible = false;
    scene.add(marker);
  }

  // Markers must land on a road that is actually clear of geometry. Picking
  // a raw random x/z can drop the objective inside a building, where nothing
  // — on foot or in a car — can ever reach it and the job is unwinnable.
  function randSpot(awayFrom, minDist) {
    let fallback = null;
    for (let i = 0; i < 60; i++) {
      const rp = LD.world.randomRoadPoint();
      if (LD.world.collide(rp.x, rp.z, 2.5).hit) continue;
      const spot = new THREE.Vector3(rp.x, 0, rp.z);
      if (!fallback) fallback = spot;
      if (!awayFrom || Math.hypot(rp.x - awayFrom.x, rp.z - awayFrom.z) > (minDist || 0)) {
        return spot;
      }
    }
    if (fallback) return fallback;
    const s = LD.world.safeSpawn();
    return new THREE.Vector3(s.x, 0, s.z);
  }

  function setMarker(pos, color) {
    target.copy(pos);
    marker.position.set(pos.x, 0.4, pos.z);
    marker.material.color.setHex(color);
    beam.material.color.setHex(color);
    marker.visible = true;
  }

  function startPickup(player) {
    phase = 'pickup';
    setMarker(randSpot(player.pos, 40), 0xffd23f);
    text = 'New job: reach the <b>pickup</b> marker.';
    LD.hud.mission(text);
  }

  function toDeliver(player) {
    phase = 'deliver';
    const drop = randSpot(target, 120);
    const dist = target.distanceTo(drop);
    reward = Math.round((300 + dist * 4) / 10) * 10;
    timer = 20 + dist / 12;
    setMarker(drop, 0x38d16b);
    text = 'Deliver the package! <b>' + U.money(reward) + '</b> — hurry!';
    LD.hud.mission(text);
    LD.hud.toast('Package collected. Deliver it!', 'good');
    LD.audio.pickup();
  }

  function complete(player) {
    LD.game.addMoney(reward);
    LD.hud.toast('Delivery complete: ' + U.money(reward), 'good');
    LD.audio.cash();
    marker.visible = false;
    phase = 'idle'; cooldown = 4;
    text = 'Job done! Next job in a moment…';
    LD.hud.mission(text);
  }

  function fail(player) {
    LD.hud.toast('Delivery failed — out of time.', 'bad');
    marker.visible = false;
    phase = 'idle'; cooldown = 4;
    text = 'Failed. New job soon…';
    LD.hud.mission(text);
  }

  function update(dt, player) {
    marker.rotation.y += dt * 1.2;
    if (phase === 'idle') {
      if (cooldown > 0) { cooldown -= dt; if (cooldown <= 0) startPickup(player); }
      return;
    }
    const d = Math.hypot(player.pos.x - target.x, player.pos.z - target.z);
    if (phase === 'pickup') {
      if (d < 3.2) toDeliver(player);
    } else if (phase === 'deliver') {
      timer -= dt;
      if (timer <= 0) { fail(player); return; }
      if (d < 3.5) complete(player);
      else {
        text = 'Deliver the package! <b>' + U.money(reward) + '</b> — ' + Math.ceil(timer) + 's';
        LD.hud.mission(text);
      }
    }
  }

  function begin(player) { cooldown = 1.5; phase = 'idle'; }
  function reset() { phase = 'idle'; cooldown = 2; if (marker) marker.visible = false; }
  function markerActive() { return marker && marker.visible; }
  function getTarget() { return target; }

  return { init, begin, update, reset, markerActive, getTarget };
})();
