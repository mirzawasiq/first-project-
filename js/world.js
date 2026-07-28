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
  let facadeMats = [];
  let capMat = null;
  let sun, hemi, ambient, sky, skyDome = null;
  let nightFactor = 0;
  let groundMat = null;            // road surface, goes wet/reflective in rain
  const neons = [];                // emissive shop signs
  const lampPools = [];            // fake light pools cast on the pavement
  let weatherLight = 1, weatherFog = 0, weatherFlash = 0;
  let envMap = null;
  let lampMeshes = [];
  let time = 8.0;          // hours 0..24
  let dayLen = 240;        // seconds per full day

  // ---------- textures ----------
  function makeWindowTexture(seed) {
    const S = 256, H = 512;
    const c = document.createElement('canvas'); c.width = S; c.height = H;
    const g = c.getContext('2d');
    const facades = ['#8b93a3', '#a2957f', '#7d8b9a', '#94969f', '#6f7789', '#a08d84'];
    const base = facades[seed % facades.length];
    g.fillStyle = base; g.fillRect(0, 0, S, H);

    // concrete grain
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.05) + ')';
      g.fillRect(Math.random() * S, Math.random() * H, 2, 2);
    }
    // floor slab bands
    const cols = 5, rows = 10;
    const cw = S / cols, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, r * rh, S, 3);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, r * rh + rh - 4, S, 4);
    }
    // recessed glass with a sky-ish reflection gradient
    const lit = [];
    for (let r = 0; r < rows; r++) {
      lit[r] = [];
      for (let col = 0; col < cols; col++) {
        const x = col * cw + cw * 0.18, y = r * rh + rh * 0.2;
        const w = cw * 0.64, h = rh * 0.52;
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(x - 2, y - 2, w + 4, h + 4);
        const grad = g.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, '#20303f'); grad.addColorStop(0.55, '#2b4457'); grad.addColorStop(1, '#16212c');
        g.fillStyle = grad; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(x, y, w, h * 0.22);
        lit[r][col] = Math.random() < 0.45;
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;

    // matching emissive map: only the lit windows glow after dark
    const e = document.createElement('canvas'); e.width = S; e.height = H;
    const eg = e.getContext('2d');
    eg.fillStyle = '#000'; eg.fillRect(0, 0, S, H);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (!lit[r][col]) continue;
        const x = col * cw + cw * 0.18, y = r * rh + rh * 0.2;
        eg.fillStyle = Math.random() < 0.15 ? '#9fd4ff' : '#ffdca1';
        eg.fillRect(x, y, cw * 0.64, rh * 0.52);
      }
    }
    const emis = new THREE.CanvasTexture(e);
    emis.wrapS = emis.wrapT = THREE.RepeatWrapping;
    emis.encoding = THREE.sRGBEncoding;
    return { map: tex, emissive: emis };
  }

  function makeAsphaltTexture() {
    const S = 512;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#494d57'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26000; i++) {
      const v = Math.random();
      g.fillStyle = 'rgba(' + (v < .5 ? '0,0,0,' : '255,255,255,') + (Math.random() * 0.09) + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    // faint patches / repairs so it isn't uniform noise
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * 0.07) + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 30 + Math.random() * 90, 20 + Math.random() * 70);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  // large inverted sphere with a vertex-driven gradient — reads far better
  // than a flat background colour, especially at dusk
  function makeSkyDome() {
    const geo = new THREE.SphereGeometry(760, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top:    { value: new THREE.Color(0x2a6cc4) },
        bottom: { value: new THREE.Color(0xbcd6f0) },
        offset: { value: 40 }, expo: { value: 0.7 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float expo; varying vec3 vP;' +
        'void main(){ float h = normalize(vP + vec3(0.0, offset, 0.0)).y;' +
        'gl_FragColor = vec4(mix(bottom, top, pow(max(h,0.0), expo)), 1.0); }',
    });
    return new THREE.Mesh(geo, mat);
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
    // Buildings SHARE one material per facade variant. Cloning a map +
    // emissiveMap per building meant hundreds of canvas textures and a
    // state change on every draw; tiling is baked into the UVs instead.
    const vi = U.randInt(0, facadeMats.length - 1);
    const mat = facadeMats[vi];
    const rx = Math.max(1, Math.round(w / 22)), ry = Math.max(1, Math.round(h / 20));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
    uv.needsUpdate = true;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, h / 2 + 0.3, cz);
    m.castShadow = true; m.receiveShadow = true;
    // rooftop cap + parapet
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, 2, d * 0.6),
      capMat
    );
    cap.castShadow = true;
    cap.position.set(cx, h + 1.3, cz);
    scene.add(m); scene.add(cap);
    buildings.push({ x: cx, z: cz, hx: w / 2, hz: d / 2, h, mesh: m });
  }

  function addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.55, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 0.95 })
    );
    trunk.position.set(x, 1.5, z);
    const leaves = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4, 0),
      new THREE.MeshStandardMaterial({ color: 0x2f6f39, flatShading: true, roughness: 1 })
    );
    leaves.position.set(x, 4.2, z);
    scene.add(trunk); scene.add(leaves);
    trees.push({ x, z });
    buildings.push({ x, z, hx: 0.6, hz: 0.6, h: 5, tree: true });
  }

  function addLamp(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.6, metalness: 0.5 })
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

  const NEON = [0xff2d6f, 0x2de1ff, 0xffd23f, 0x8a5cff, 0x38ff9e, 0xff6a2d];

  function addNeon(cx, cz, w, d, h) {
    const col = U.pick(NEON);
    const wide = U.chance(0.5);
    const geo = new THREE.PlaneGeometry(wide ? w * 0.5 : 1.1, wide ? 1.6 : h * 0.22);
    const mat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0, side: THREE.DoubleSide,
      roughness: 0.4, transparent: true, opacity: 0.96,
    });
    const sign = new THREE.Mesh(geo, mat);
    // pin it to a random face, just proud of the wall
    const face = U.randInt(0, 3);
    const y = U.rand(6, Math.max(8, h * 0.55));
    if (face === 0) sign.position.set(cx, y, cz + d / 2 + 0.15);
    else if (face === 1) { sign.position.set(cx, y, cz - d / 2 - 0.15); sign.rotation.y = Math.PI; }
    else if (face === 2) { sign.position.set(cx + w / 2 + 0.15, y, cz); sign.rotation.y = -Math.PI / 2; }
    else { sign.position.set(cx - w / 2 - 0.15, y, cz); sign.rotation.y = Math.PI / 2; }
    scene.add(sign);
    neons.push({ mat, flicker: U.chance(0.25), phase: U.rand(0, 9) });
  }

  function addLampPool(x, z) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(7.5, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffdba6, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: true })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    scene.add(m);
    lampPools.push(m.material);
  }

  // ---------- build ----------
  function build(sc) {
    scene = sc;
    windowMats = [0, 1, 2, 3, 4].map(makeWindowTexture);
    facadeMats = windowMats.map((src) => new THREE.MeshStandardMaterial({
      map: src.map, roughness: 0.72, metalness: 0.06,
      emissive: new THREE.Color(0xffffff), emissiveMap: src.emissive, emissiveIntensity: 0.0,
    }));
    capMat = new THREE.MeshStandardMaterial({ color: 0x363b46, roughness: 0.9 });

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
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // tight ortho frustum that travels with the player, so a 600-unit city
    // still gets crisp contact shadows from a 2k map
    const sc2 = sun.shadow.camera;
    sc2.left = -95; sc2.right = 95; sc2.top = 95; sc2.bottom = -95;
    sc2.near = 1; sc2.far = 420;
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);

    skyDome = makeSkyDome();
    scene.add(skyDome);

    // base asphalt (roads everywhere underneath the blocks)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SPAN + GRID * 2, SPAN + GRID * 2),
      groundMat = new THREE.MeshStandardMaterial({
        map: makeAsphaltTexture(), roughness: 0.95, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // outer grass ring beyond the city
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(SPAN * 0.75, SPAN * 1.6, 48),
      new THREE.MeshStandardMaterial({ color: 0x24512c, roughness: 1 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.2;
    outer.receiveShadow = true;
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
          new THREE.MeshStandardMaterial({
            color: isPark ? 0x2f6b39 : 0x5f646e, roughness: 0.94, metalness: 0.0 })
        );
        plat.receiveShadow = true; plat.castShadow = true;
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
            if (U.chance(0.5)) addNeon(cx, cz, w, d, 30);
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
        addLampPool(n.x + ROAD / 2 + 1.2, n.z + ROAD / 2 + 1.2);
      }
    }

    buildEnvMap();
    applyTimeOfDay();
    return { N, GRID, ROAD, HALF, SPAN, nodes, buildings };
  }

  /* Environment map for reflections (car paint, chrome, wet asphalt).
     NOTE: generating this from the sky-dome ShaderMaterial via
     PMREMGenerator.fromScene() produced a broken CubeUV texture that
     rendered every MeshStandardMaterial black. Building it from a plain
     equirectangular canvas is the reliable path. */
  function makeSkyEquirect() {
    const w = 256, h = 128;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0.00, '#2f6fc9');     // zenith
    grd.addColorStop(0.45, '#9dc4e8');
    grd.addColorStop(0.52, '#dbe7f2');     // horizon haze
    grd.addColorStop(1.00, '#4a4f58');     // ground bounce
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function buildEnvMap() {
    try {
      const renderer = LD.game && LD.game.renderer;
      if (!renderer || !THREE.PMREMGenerator) return;
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const src = makeSkyEquirect();
      const rt = pmrem.fromEquirectangular(src);
      envMap = rt.texture;
      scene.environment = envMap;
      src.dispose();
      pmrem.dispose();
    } catch (e) {
      envMap = null;
      scene.environment = null;      // never let reflections break rendering
    }
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

    if (skyDome) {
      const u = skyDome.material.uniforms;
      u.top.value.copy(new THREE.Color(0x070d1a).lerp(new THREE.Color(0x2a6cc4), day));
      const horizon = new THREE.Color(0x121b2e).lerp(new THREE.Color(0xbcd6f0), day);
      if (dusk) horizon.lerp(new THREE.Color(0xff8a3d), 0.55 * (1 - day * 0.6));
      u.bottom.value.copy(horizon);
    }

    sun.intensity = (0.06 + day * 0.95) * Math.max(0.45, weatherLight) + weatherFlash * 1.6;
    sun.color.setHex(dusk ? 0xffa055 : 0xfff4e2);
    ambient.intensity = (0.10 + day * 0.16) * U.lerp(1, 0.86, 1 - weatherLight) + weatherFlash * 1.2;
    hemi.intensity = 0.10 + day * 0.22;
    hemi.color.setHex(dusk ? 0xffc79a : 0xbdd7ff);

    // sun arc across the sky
    const ang = ((t - 6) / 12) * Math.PI; // sunrise 6 -> sunset 18
    sun.position.set(Math.cos(ang) * 140, Math.max(12, Math.sin(ang) * 150), 40);

    // r128 has no global IBL knob, so scale each material's envMapIntensity:
    // reflections must fade with the sky or night looks lit like noon
    const ibl = U.lerp(0.08, 0.42, day);
    for (const fm of facadeMats) fm.envMapIntensity = ibl;

    // windows + lamps glow at night (bloom picks these up)
    nightFactor = U.clamp(1 - day * 1.4, 0, 1);
    for (const fm of facadeMats) fm.emissiveIntensity = nightFactor * 1.5;
    for (const lm of lampMeshes) {
      lm.color.setHex(nightFactor > 0.35 ? 0xffe6b0 : 0x2f3138);
    }
    // lamps also throw a soft pool on the pavement once it is dark
    const lampOn = U.clamp((nightFactor - 0.25) / 0.5, 0, 1);
    for (const lp of lampPools) lp.opacity = lampOn * 0.3;
    // neon comes on at dusk; a quarter of the signs have a dying tube
    for (const n of neons) {
      let v = lampOn * 2.6;
      if (n.flicker) {
        const f = Math.sin(time * 90 + n.phase) * Math.sin(time * 37 + n.phase * 2);
        if (f > 0.72) v *= 0.15;
      }
      n.mat.emissiveIntensity = v;
    }
  }

  function update(dt) {
    time = (time + dt / dayLen * 24) % 24;
    applyTimeOfDay();
  }

  /* Called every frame by LD.weather with eased values. */
  function applyWeather(w, flash) {
    weatherLight = w.light; weatherFog = w.fog; weatherFlash = flash || 0;
    if (groundMat) {
      // Wet asphalt is a DIELECTRIC: it gets a smooth specular sheen, it does
      // not become metal. Pushing metalness up kills the diffuse term and the
      // road renders black, so keep metalness near zero and drop roughness.
      const wet = w.wet;
      groundMat.roughness = U.lerp(0.95, 0.30, wet);
      groundMat.metalness = U.lerp(0.02, 0.10, wet);
      groundMat.color.setScalar(U.lerp(1.0, 0.74, wet));
      groundMat.envMapIntensity = U.lerp(0.35, 1.15, wet);
    }
    // fog closes in with weather, and hard at night
    if (scene.fog) {
      const base = 460;
      scene.fog.near = U.lerp(140, 20, w.fog);
      scene.fog.far = U.lerp(base, 130, w.fog);
    }
  }

  // move the shadow camera and sky with the player
  function followSun(p) {
    if (!sun || !p) return;
    const dir = sun.position.clone().normalize();
    sun.target.position.set(p.x, 0, p.z);
    sun.target.updateMatrixWorld();
    sun.position.set(p.x + dir.x * 170, dir.y * 170, p.z + dir.z * 170);
    if (skyDome) skyDome.position.set(p.x, 0, p.z);
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
    randomRoadPoint, safeSpawn, timeString, followSun, applyWeather,
    get nightFactor() { return nightFactor; },
    get time() { return time; }, set time(v) { time = v; },
    get consts() { return { N, GRID, ROAD, HALF, SPAN }; },
    get nodes() { return nodes; },
    get buildings() { return buildings; },
  };
})();
