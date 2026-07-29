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
    envMapIntensity: 0.35,     // cloth and skin barely reflect the sky
  });
  const skinM  = mat(skin, 0.72);
  const shirtM = mat(shirt, 0.9);
  const pantsM = mat(pants, 0.92);
  const shoeM  = mat(0x14161c, 0.6);
  const hairM  = mat(hairC, 0.95);

  /* Limbs and torso are built from CAPSULES (a tapered cylinder capped with
     spheres), not boxes. Boxes are what made the old figure read as a robot:
     hard square edges and visible gaps at every joint. A capsule has a round
     silhouette from every angle and its sphere caps fill the joint, so a
     bending knee or elbow stays continuous.
     r128 predates CapsuleGeometry, so it is assembled by hand. */
  function capsule(rTop, rBot, len, m, flatten) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 12, 1, true), m);
    shaft.position.y = -len / 2;
    shaft.castShadow = true;
    g.add(shaft);
    const capA = new THREE.Mesh(new THREE.SphereGeometry(rTop, 12, 8), m);
    capA.castShadow = true;
    g.add(capA);
    const capB = new THREE.Mesh(new THREE.SphereGeometry(rBot, 12, 8), m);
    capB.position.y = -len;
    capB.castShadow = true;
    g.add(capB);
    if (flatten) g.scale.z = flatten;     // limbs are slightly oval, not round
    return g;
  }

  /* Rounded body mass: a sphere squashed into an ellipsoid. */
  function blob(rx, ry, rz, m, y) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m);
    mesh.scale.set(rx, ry, rz);
    mesh.position.y = y || 0;
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
  hips.add(blob(0.42, 0.30, 0.26, pantsM, -0.08));

  // ---- torso ----
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(blob(0.38, 0.36, 0.25, shirtM, 0.30));        // waist / midriff
  const chest = new THREE.Group();
  chest.position.y = 0.62;
  torso.add(chest);
  chest.add(blob(0.44, 0.40, 0.27, shirtM, 0.30));        // ribcage
  // rounded deltoid caps instead of a square yoke
  [-1, 1].forEach((sd) => {
    // Object3D.add() returns the PARENT, so keep a reference to the child
    const delt = blob(0.165, 0.145, 0.165, shirtM, 0.56);
    delt.position.x = sd * 0.415;
    chest.add(delt);
  });

  // ---- head ----
  const neck = new THREE.Group();
  neck.position.y = 0.70;
  chest.add(neck);
  neck.add(capsule(0.10, 0.11, 0.09, skinM));
  const head = new THREE.Group();
  head.position.y = 0.06;
  neck.add(head);
  // skull: an ellipsoid, slightly longer front-to-back like a real head
  head.add(blob(0.26, 0.295, 0.275, skinM, 0.25));
  const jaw = blob(0.20, 0.15, 0.22, skinM, 0.12); jaw.position.z = 0.02; head.add(jaw);
  // hair as a skull cap that follows the curve rather than a slab
  const hair = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM);
  hair.scale.set(0.275, 0.31, 0.29);
  hair.position.set(0, 0.26, -0.012);
  hair.castShadow = true;
  head.add(hair);
  // small nose + brow so there is a clear facing direction
  const nose = blob(0.045, 0.05, 0.05, skinM, 0.22); nose.position.z = 0.235; head.add(nose);
  const brow = blob(0.20, 0.028, 0.04, hairM, 0.30); brow.position.z = 0.185; head.add(brow);
  const eyeM = mat(0x1b1f28, 0.35);
  [-1, 1].forEach((sd) => {
    const eye = blob(0.045, 0.045, 0.03, eyeM, 0.265);
    eye.position.set(sd * 0.09, 0.265, 0.215);
    head.add(eye);
  });

  // ---- arms: shoulder -> upper -> elbow -> fore -> hand ----
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.58, 0.58, 0);
    chest.add(shoulder);
    const upper = capsule(0.135, 0.115, 0.62, shirtM, 0.92);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.62;
    shoulder.add(elbow);
    const fore = capsule(0.115, 0.085, 0.58, skinM, 0.92);
    elbow.add(fore);
    const hand = blob(0.095, 0.12, 0.07, skinM, -0.66);
    elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const armL = makeArm(-1), armR = makeArm(1);

  // ---- legs: hip -> thigh -> knee -> shin -> foot ----
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.24, -0.24, 0);
    hips.add(hip);
    const thigh = capsule(0.20, 0.155, 0.86, pantsM, 0.95);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.86;
    hip.add(knee);
    const shin = capsule(0.15, 0.10, 0.82, pantsM, 0.95);
    knee.add(shin);
    // shoe: rounded, and longer than it is wide
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), shoeM);
    foot.scale.set(0.13, 0.09, 0.27);
    foot.position.set(0, -0.86, 0.10);
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
      const freq = moving ? 1.6 + Math.min(s, 30) * 0.40 : 1.6;
      this._phase += dt * freq;
      const th = this._phase;

      // how "run-like" the gait is: 0 walk, 1 full sprint
      const run = U.clamp((s - 7) / 11, 0, 1);   // 0 at a walk, 1 by full sprint
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
