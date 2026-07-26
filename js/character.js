/* ===========================================================
   LIBERTY DRIVE — character rig & procedural animation
   -----------------------------------------------------------
   Replaces the old six-box figure with a jointed humanoid:
   hips -> torso -> chest -> neck/head, plus two-segment arms
   and legs so knees and elbows actually bend.

   Everything is nested Groups, because a Group's rotation
   pivots at its own origin — that is what lets a thigh swing
   from the hip and a shin fold at the knee.

   Overall height stays ~4 units so existing cameras, collision
   radii and the weapon hit-spheres keep working.
   =========================================================== */
LD.makeHuman = function (opts) {
  opts = opts || {};
  const U = LD.util;
  const skin  = opts.skin  != null ? opts.skin  : U.pick(U.SKIN);
  const shirt = opts.shirt != null ? opts.shirt : U.pick(U.SHIRT);
  const pants = opts.pants != null ? opts.pants : U.pick(U.PANTS);
  const hairC = opts.hair  != null ? opts.hair  : U.pick([0x2a1f18, 0x120d0a, 0x5b3d24, 0x8a6a3a, 0x1a1a1a]);

  // slightly rough, non-metallic skin/cloth reads far better than flat Lambert
  const mat = (c, rough) => new THREE.MeshStandardMaterial({
    color: c, roughness: rough != null ? rough : 0.85, metalness: 0.0,
  });
  const skinM  = mat(skin, 0.72);
  const shirtM = mat(shirt, 0.9);
  const pantsM = mat(pants, 0.92);
  const shoeM  = mat(0x14161c, 0.6);
  const hairM  = mat(hairC, 0.95);

  // box helper whose pivot sits at the TOP of the box, so limbs
  // rotate from the joint above them rather than their centre
  function limb(w, h, d, m, taper) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, -h / 2, 0);
    if (taper) {                      // narrow the far end a little
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < -h * 0.4) { p.setX(i, p.getX(i) * taper); p.setZ(i, p.getZ(i) * taper); }
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    return mesh;
  }
  function box(w, h, d, m, y) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.y = y || 0;
    mesh.castShadow = true;
    return mesh;
  }

  const root = new THREE.Group();

  // ---- hips (the whole body hangs off this, so bounce lives here) ----
  const hips = new THREE.Group();
  hips.position.y = 1.82;
  root.add(hips);
  hips.add(box(0.78, 0.42, 0.46, pantsM, -0.1));

  // ---- torso ----
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.8, 0.62, 0.44, shirtM, 0.32));          // waist
  const chest = new THREE.Group();
  chest.position.y = 0.62;
  torso.add(chest);
  chest.add(box(0.96, 0.72, 0.5, shirtM, 0.3));           // ribcage
  // collar / shoulder yoke gives the silhouette some shape
  chest.add(box(1.06, 0.18, 0.46, mat(shirt, 0.8), 0.66));

  // ---- head ----
  const neck = new THREE.Group();
  neck.position.y = 0.74;
  chest.add(neck);
  neck.add(box(0.24, 0.16, 0.24, skinM, 0.08));
  const head = new THREE.Group();
  head.position.y = 0.16;
  neck.add(head);
  head.add(box(0.5, 0.56, 0.52, skinM, 0.28));
  const hair = box(0.54, 0.18, 0.56, hairM, 0.6); head.add(hair);
  hair.position.z = -0.01;
  // brow + nose so the face has a front
  const brow = box(0.52, 0.08, 0.06, hairM, 0.42); brow.position.z = 0.25; head.add(brow);
  const nose = box(0.1, 0.12, 0.1, skinM, 0.26); nose.position.z = 0.28; head.add(nose);

  // ---- arms: shoulder -> upper -> elbow -> fore -> hand ----
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.58, 0.58, 0);
    chest.add(shoulder);
    const upper = limb(0.26, 0.66, 0.28, shirtM);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.66;
    shoulder.add(elbow);
    const fore = limb(0.22, 0.6, 0.24, skinM, 0.85);
    elbow.add(fore);
    const hand = box(0.2, 0.22, 0.22, skinM, -0.7);
    elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const armL = makeArm(-1), armR = makeArm(1);

  // ---- legs: hip -> thigh -> knee -> shin -> foot ----
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.24, -0.24, 0);
    hips.add(hip);
    const thigh = limb(0.38, 0.9, 0.42, pantsM);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.9;
    hip.add(knee);
    const shin = limb(0.32, 0.86, 0.34, pantsM, 0.9);
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.56), shoeM);
    foot.position.set(0, -0.88, 0.12);
    foot.castShadow = true;
    knee.add(foot);
    return { hip, knee, foot };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);

  const human = {
    group: root, hips, torso, chest, head, neck,
    armL, armR, legL, legR,
    _phase: 0, _t: 0, _punch: 0, _land: 0,
    aiming: false, dead: false,

    /* speed is world units/sec; 0 = idle, ~6 walk, ~12 sprint */
    animate(dt, speed) {
      if (this.dead) return;
      this._t += dt;
      const s = speed || 0;
      const moving = s > 0.4;
      // stride frequency rises with speed but flattens out at a sprint
      const freq = moving ? 1.6 + Math.min(s, 14) * 0.52 : 1.6;
      this._phase += dt * freq;
      const th = this._phase;

      // how "run-like" the gait is: 0 walk, 1 full sprint
      const run = U.clamp((s - 5) / 7, 0, 1);
      const amp = moving ? U.lerp(0.55, 1.15, run) : 0;

      // ---- legs ----
      const swing = Math.sin(th) * amp;
      legL.hip.rotation.x = swing;
      legR.hip.rotation.x = -swing;
      // knees only fold backwards, and fold hardest as the foot comes through
      const kneeL = Math.max(0, -Math.sin(th - 0.6)) * (0.5 + run * 1.5);
      const kneeR = Math.max(0, -Math.sin(th + Math.PI - 0.6)) * (0.5 + run * 1.5);
      legL.knee.rotation.x = kneeL;
      legR.knee.rotation.x = kneeR;
      legL.foot.rotation.x = -kneeL * 0.35;
      legR.foot.rotation.x = -kneeR * 0.35;

      // ---- body bounce + lean ----
      // two bounces per stride cycle, and the torso pitches into the run
      const bounce = moving ? Math.abs(Math.sin(th)) * (0.05 + run * 0.13) : Math.sin(this._t * 1.8) * 0.012;
      hips.position.y = 1.82 + bounce - (moving ? run * 0.06 : 0);
      torso.rotation.x = moving ? U.lerp(0.06, 0.30, run) : 0.02;
      // counter-rotate shoulders against the hips — this is what sells a run
      chest.rotation.y = moving ? -Math.sin(th) * (0.06 + run * 0.16) : 0;
      hips.rotation.y = moving ? Math.sin(th) * (0.04 + run * 0.10) : 0;
      head.rotation.x = moving ? -torso.rotation.x * 0.7 : Math.sin(this._t * 1.8 + 1) * 0.03;

      // ---- arms ----
      if (this._punch > 0) {
        this._punch -= dt * 3.2;
        const p = Math.sin(U.clamp(1 - this._punch, 0, 1) * Math.PI);
        armR.shoulder.rotation.x = -1.5 * p - 0.1;
        armR.elbow.rotation.x = -0.5 * (1 - p);
        armL.shoulder.rotation.x = 0.5 * p;
        armL.elbow.rotation.x = -0.9;
      } else if (this.aiming) {
        // two-handed pistol stance, arms out front
        armR.shoulder.rotation.set(-1.45, 0, -0.12);
        armR.elbow.rotation.x = -0.12;
        armL.shoulder.rotation.set(-1.25, 0, 0.34);
        armL.elbow.rotation.x = -0.55;
        chest.rotation.y = -0.18;
      } else {
        // arms swing opposite the legs, elbows bent more the faster you go
        const bend = -(0.25 + run * 1.05);
        armL.shoulder.rotation.set(-swing * (0.7 + run * 0.5), 0, 0.06);
        armR.shoulder.rotation.set(swing * (0.7 + run * 0.5), 0, -0.06);
        armL.elbow.rotation.x = bend - Math.max(0, -swing) * 0.5;
        armR.elbow.rotation.x = bend - Math.max(0, swing) * 0.5;
      }
    },

    /* airborne pose — tucked legs, arms up */
    airborne(up) {
      legL.hip.rotation.x = up ? -0.5 : 0.35;
      legR.hip.rotation.x = up ? 0.3 : -0.2;
      legL.knee.rotation.x = up ? 1.1 : 0.4;
      legR.knee.rotation.x = 0.5;
      armL.shoulder.rotation.x = -1.1;
      armR.shoulder.rotation.x = -1.3;
      torso.rotation.x = up ? -0.1 : 0.18;
    },

    punch() { this._punch = 1; },

    die() {
      if (this.dead) return;
      this.dead = true;
      // crumple rather than a rigid 90° flop
      root.rotation.x = -Math.PI / 2 + 0.12;
      root.rotation.z = U.rand(-0.4, 0.4);
      root.position.y = 0.35;
      hips.position.y = 1.6;
      torso.rotation.x = 0.5;
      legL.hip.rotation.x = 0.5; legR.hip.rotation.x = -0.25;
      legL.knee.rotation.x = 0.9; legR.knee.rotation.x = 0.4;
      armL.shoulder.rotation.set(1.4, 0, 0.7);
      armR.shoulder.rotation.set(0.9, 0, -1.1);
    },

    setTint(hex) { shirtM.color.setHex(hex); },
  };

  // legacy aliases — older code pokes armR/legL directly
  human.arm = { L: armL, R: armR };
  return human;
};
