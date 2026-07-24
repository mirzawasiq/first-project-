/* ===== LIBERTY DRIVE — procedural open-world city ===== */
LD.world = (function () {
  const U = LD.util;

  const N = 10;            // roads per axis
  const GRID = 64;         // spacing between road centerlines
  const ROAD = 16;         // road width
  const HALF = (N - 1) * GRID / 2;
  const SPAN = (N - 1) * GRID;

  let scene = null;
  const buildings = [];    // { x, z, hx, hz, h } AABB colliders
  const nodes = [];        // intersection positions {x,z,i,j}
  const trees = [];
  let windowMats = [];
  let sun, hemi, ambient, sky;
  let lampMeshes = [];
  let time = 8.0;          // hours 0..24
  let dayLen = 240;        // seconds per full day

  // ---------- textures ----------
  function makeWindowTexture(seed) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const facades = ['#3a3f4b', '#4a4033', '#33414a', '#464650', '#2f3540'];
    g.fillStyle = facades[seed % facades.length];
    g.fillRect(0, 0, 64, 128);
    const cols = 4, rows = 8, m = 6;
    const ww = (64 - m * (cols + 1)) / cols;
    const wh = (128 - m * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const lit = Math.random() < 0.5;
        g.fillStyle = lit ? '#ffe9a8' : '#171b22';
        g.fillRect(m + col * (ww + m), m + r * (wh + m), ww, wh);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function makeLaneTexture() {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 8, 64);
    g.fillStyle = '#e8d54a';
    g.fillRect(3, 8, 2, 30);           // single dash
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.transparent = true;
    return t;
  }

  // ---------- geometry helpers ----------
  function addBuilding(cx, cz, w, d) {
    const h = U.rand(14, 62);
    const geo = new THREE.BoxGeometry(w, h, d);
    const wt = U.pick(windowMats).clone();
    wt.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12)));
    const mat = new THREE.MeshLambertMaterial({ map: wt });
    mat.emissive = new THREE.Color(0xffe9a8);
    mat.emissiveMap = wt;
    mat.emissiveIntensity = 0.0; // raised at night
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, h / 2 + 0.3, cz);
    m.castShadow = false; m.receiveShadow = false;
    // rooftop cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, 2, d * 0.6),
      new THREE.MeshLambertMaterial({ color: 0x2a2e38 })
    );
    cap.position.set(cx, h + 1.3, cz);
    scene.add(m); scene.add(cap);
    buildings.push({ x: cx, z: cz, hx: w / 2, hz: d / 2, h, mesh: m, mat });
  }

  function addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.55, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x5b3d24 })
    );
    trunk.position.set(x, 1.5, z);
    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4, 0),
      new THREE.MeshPhongMaterial({ color: 0x2f7d3a, flatShading: true, shininess: 0 })
    );
    leaves.position.set(x, 4.2, z);
    scene.add(trunk); scene.add(leaves);
    trees.push({ x, z });
    buildings.push({ x, z, hx: 0.6, hz: 0.6, h: 5, tree: true });
  }

  function addLamp(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0x20242c })
    );
    pole.position.set(x, 3, z);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2a })
    );
    head.position.set(x, 6, z);
    scene.add(pole); scene.add(head);
    lampMeshes.push(head.material);
  }

  // ---------- build ----------
  function build(sc) {
    scene = sc;
    windowMats = [0, 1, 2, 3, 4].map(makeWindowTexture);

    // sky + fog
    sky = new THREE.Color(0x8fb7e6);
    scene.background = sky.clone();
    scene.fog = new THREE.Fog(sky.getHex(), 140, 460);

    // lights
    ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    hemi = new THREE.HemisphereLight(0xbdd7ff, 0x30302a, 0.5);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2d6, 1.0);
    sun.position.set(80, 140, 40);
    scene.add(sun);

    // base asphalt (roads everywhere underneath the blocks)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SPAN + GRID * 2, SPAN + GRID * 2),
      new THREE.MeshLambertMaterial({ color: 0x24272e })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // outer grass ring beyond the city
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(SPAN * 0.75, SPAN * 1.6, 48),
      new THREE.MeshLambertMaterial({ color: 0x24502e })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.2;
    scene.add(outer);

    // lane markings (dashed lines along each road centerline)
    const laneTex = makeLaneTexture();
    const laneMat = new THREE.MeshBasicMaterial({ map: laneTex, transparent: true });
    for (let i = 0; i < N; i++) {
      const p = i * GRID - HALF;
      // vertical road (runs along Z)
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.6, SPAN), laneMat);
      v.rotation.x = -Math.PI / 2; v.position.set(p, 0.03, 0);
      v.material = laneMat.clone(); v.material.map = laneTex.clone();
      v.material.map.repeat.set(1, SPAN / 8); v.material.map.wrapT = THREE.RepeatWrapping;
      scene.add(v);
      // horizontal road (runs along X)
      const h = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, 0.6), laneMat.clone());
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.03, p);
      h.material.map = laneTex.clone();
      h.material.map.repeat.set(SPAN / 8, 1); h.material.map.wrapS = THREE.RepeatWrapping;
      scene.add(h);
    }

    // intersection nodes
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        nodes.push({ x: i * GRID - HALF, z: j * GRID - HALF, i, j });
      }
    }

    // blocks: sidewalk platforms + buildings or parks
    const inner = ROAD / 2 + 1;            // sidewalk starts here from road
    const blockSpan = GRID - ROAD - 2;     // usable block width
    for (let bi = 0; bi < N - 1; bi++) {
      for (let bj = 0; bj < N - 1; bj++) {
        const cx = (bi + 0.5) * GRID - HALF;
        const cz = (bj + 0.5) * GRID - HALF;
        const isPark = U.chance(0.12);

        // sidewalk / lot platform
        const plat = new THREE.Mesh(
          new THREE.BoxGeometry(GRID - ROAD, 0.6, GRID - ROAD),
          new THREE.MeshLambertMaterial({ color: isPark ? 0x2f6b38 : 0x4b505b })
        );
        plat.position.set(cx, 0.3, cz);
        scene.add(plat);

        if (isPark) {
          for (let t = 0; t < 5; t++) {
            addTree(cx + U.rand(-16, 16), cz + U.rand(-16, 16));
          }
        } else {
          // 1 large or a few smaller buildings on the lot
          if (U.chance(0.55)) {
            const w = blockSpan * U.rand(0.7, 0.92);
            const d = blockSpan * U.rand(0.7, 0.92);
            addBuilding(cx, cz, w, d);
          } else {
            const w = blockSpan * 0.44, d = blockSpan * 0.44, o = blockSpan * 0.24;
            addBuilding(cx - o, cz - o, w, d);
            addBuilding(cx + o, cz - o, w, d);
            addBuilding(cx - o, cz + o, w, d);
            addBuilding(cx + o, cz + o, w, d);
          }
        }
      }
    }

    // street lamps at every other intersection
    for (const n of nodes) {
      if ((n.i + n.j) % 2 === 0) {
        addLamp(n.x + ROAD / 2 + 1.2, n.z + ROAD / 2 + 1.2);
      }
    }

    applyTimeOfDay();
    return { N, GRID, ROAD, HALF, SPAN, nodes, buildings };
  }

  // ---------- queries ----------
  function isRoad(x, z) {
    if (Math.abs(x) > HALF + ROAD || Math.abs(z) > HALF + ROAD) return false;
    const gx = x + HALF, gz = z + HALF;
    const dx = Math.abs(gx - Math.round(gx / GRID) * GRID);
    const dz = Math.abs(gz - Math.round(gz / GRID) * GRID);
    return dx <= ROAD / 2 || dz <= ROAD / 2;
  }

  function inBounds(x, z) {
    return Math.abs(x) <= HALF && Math.abs(z) <= HALF;
  }

  function nearestNode(x, z) {
    let i = U.clamp(Math.round((x + HALF) / GRID), 0, N - 1);
    let j = U.clamp(Math.round((z + HALF) / GRID), 0, N - 1);
    return nodes[i * N + j];
  }

  function nodeNeighbors(node) {
    const out = [];
    const { i, j } = node;
    if (i > 0) out.push(nodes[(i - 1) * N + j]);
    if (i < N - 1) out.push(nodes[(i + 1) * N + j]);
    if (j > 0) out.push(nodes[i * N + (j - 1)]);
    if (j < N - 1) out.push(nodes[i * N + (j + 1)]);
    return out;
  }

  // resolve circle-vs-building collisions; returns adjusted {x,z} + hit flag
  function collide(x, z, radius) {
    let hit = false;
    for (const b of buildings) {
      const minx = b.x - b.hx - radius, maxx = b.x + b.hx + radius;
      const minz = b.z - b.hz - radius, maxz = b.z + b.hz + radius;
      if (x > minx && x < maxx && z > minz && z < maxz) {
        // push out along least-penetration axis
        const penL = x - minx, penR = maxx - x;
        const penB = z - minz, penT = maxz - z;
        const mx = Math.min(penL, penR);
        const mz = Math.min(penB, penT);
        if (mx < mz) x = (penL < penR) ? minx : maxx;
        else z = (penB < penT) ? minz : maxz;
        hit = true;
      }
    }
    // keep inside the outer world
    const lim = HALF + GRID * 0.6;
    x = U.clamp(x, -lim, lim); z = U.clamp(z, -lim, lim);
    return { x, z, hit };
  }

  // ---------- day / night ----------
  function applyTimeOfDay() {
    // t 0..24. Compute sun angle & daylight factor.
    const t = time;
    const noonDist = Math.abs(t - 13);              // 0 at 1pm
    let day = U.clamp(1 - noonDist / 7.5, 0, 1);     // 1 midday, 0 night
    day = Math.pow(day, 0.8);

    const dayColor = new THREE.Color(0x8fb7e6);
    const duskColor = new THREE.Color(0xe08a4a);
    const nightColor = new THREE.Color(0x0b1424);

    let col;
    const dusk = (t > 17 && t < 20) || (t > 5 && t < 8);
    if (day > 0.15) {
      col = nightColor.clone().lerp(dayColor, day);
      if (dusk) col.lerp(duskColor, 0.35 * (1 - day));
    } else {
      col = nightColor.clone();
    }
    scene.background.copy(col);
    scene.fog.color.copy(col);

    sun.intensity = 0.25 + day * 0.95;
    sun.color.setHex(dusk ? 0xffb066 : 0xfff2d6);
    ambient.intensity = 0.28 + day * 0.4;
    hemi.intensity = 0.2 + day * 0.5;

    // sun arc across the sky
    const ang = ((t - 6) / 12) * Math.PI; // sunrise 6 -> sunset 18
    sun.position.set(Math.cos(ang) * 140, Math.max(12, Math.sin(ang) * 150), 40);

    // windows + lamps glow at night
    const nightFactor = U.clamp(1 - day * 1.4, 0, 1);
    for (const b of buildings) {
      if (b.mat) b.mat.emissiveIntensity = nightFactor * 0.9;
    }
    for (const lm of lampMeshes) {
      lm.color.setHex(nightFactor > 0.4 ? 0xffdf9a : 0x2a2a2a);
    }
  }

  function update(dt) {
    time = (time + dt / dayLen * 24) % 24;
    applyTimeOfDay();
  }

  function timeString() {
    const h = Math.floor(time);
    const m = Math.floor((time - h) * 60);
    const hh = ((h + 11) % 12) + 1;
    const ap = h < 12 ? 'AM' : 'PM';
    return hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  // a clear point on a road, safe for spawning the player (no building overlap)
  function safeSpawn() {
    for (let i = 0; i < 60; i++) {
      const rp = randomRoadPoint();
      const c = collide(rp.x, rp.z, 1.2);
      if (!c.hit && inBounds(rp.x, rp.z)) return { x: rp.x, z: rp.z };
    }
    return { x: 0, z: 0 };
  }

  // a random point on a road (for spawning traffic), returns {x,z,dir}
  function randomRoadPoint() {
    if (U.chance(0.5)) {
      const i = U.randInt(0, N - 1);
      const x = i * GRID - HALF + (U.chance(0.5) ? ROAD / 4 : -ROAD / 4);
      const z = U.rand(-HALF, HALF);
      return { x, z, axis: 'z' };
    } else {
      const j = U.randInt(0, N - 1);
      const z = j * GRID - HALF + (U.chance(0.5) ? ROAD / 4 : -ROAD / 4);
      const x = U.rand(-HALF, HALF);
      return { x, z, axis: 'x' };
    }
  }

  return {
    build, isRoad, inBounds, nearestNode, nodeNeighbors, collide, update,
    randomRoadPoint, safeSpawn, timeString,
    get time() { return time; }, set time(v) { time = v; },
    get consts() { return { N, GRID, ROAD, HALF, SPAN }; },
    get nodes() { return nodes; },
    get buildings() { return buildings; },
  };
})();
