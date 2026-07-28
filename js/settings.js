/* ===========================================================
   LIBERTY DRIVE — camera / control / movement settings
   Tweakable live from the browser console via LD.settings.
   =========================================================== */
LD.settings = {
  // --- camera ---
  lookSensitivity: 0.0025,   // radians per pixel of mouse movement
  invertY: false,            // set true for inverted vertical look
  shoulder: 0.9,             // over-the-shoulder offset (0 = centred)
  camDistance: 7.4,
  camHeight: 4.0,

  // --- movement (world units / second) ---
  walkSpeed: 8.5,            // was 6 — plain walking
  runSpeed: 17,              // was 12 — holding Shift
  boostSpeed: 28,            // the surge
  accel: 46,                 // how hard you get up to speed
  decel: 34,                 // how hard you slow down

  // --- boost ---
  boostTime: 2.4,            // seconds a surge lasts at full tilt
  boostCooldown: 0.35,       // minimum gap between surges
  staminaMax: 100,
  staminaBoostDrain: 34,     // per second while boosting
  staminaRunDrain: 5,        // per second while sprinting
  staminaRegen: 22,          // per second while walking/idle
  staminaToBoost: 15,        // need at least this much to start a surge
};
