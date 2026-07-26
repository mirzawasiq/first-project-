/* ===== LIBERTY DRIVE — shared namespace & helpers ===== */
window.LD = window.LD || {};

LD.util = (function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // shortest-path angle interpolation
  function lerpAngle(a, b, t) {
    let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }
  function angleDiff(a, b) {
    return ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  }

  // deterministic-ish palette of GTA-ish car colors
  const CAR_COLORS = [
    0xd23b3b, 0x2d6cdf, 0xf0c020, 0x2ca05a, 0xe07b2c, 0x8a3fd0,
    0x20a3b0, 0xdfe3ea, 0x333844, 0x9aa4b6, 0xb02a5a, 0x1c1f28,
  ];
  const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9a6a44, 0x6d4327];
  const SHIRT = [0xe23b3b, 0x2d6cdf, 0x2ca05a, 0xf0c020, 0xdfe3ea, 0x333844, 0x8a3fd0, 0xe07b2c];
  const PANTS = [0x22262e, 0x33507a, 0x4a3d2c, 0x2b2b2b, 0x5a4a3a];

  function money(n) {
    return '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US');
  }

  return {
    clamp, lerp, rand, randInt, pick, chance, lerpAngle, angleDiff,
    CAR_COLORS, SKIN, SHIRT, PANTS, money,
  };
})();
