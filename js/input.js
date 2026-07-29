/* ===== LIBERTY DRIVE — input (keyboard + mouse look) ===== */
LD.input = (function () {
  const keys = {};        // held keys, lowercase
  const pressed = {};     // edge-triggered this frame
  const mouse = { dx: 0, dy: 0, down: false, downEdge: false, locked: false, rmb: false };
  let lastX = 0, lastY = 0, havePos = false;

  let canvas = null;

  function isDown(code) { return !!keys[code]; }
  function wasPressed(code) {
    if (pressed[code]) { pressed[code] = false; return true; }
    return false;
  }

  function keyName(e) {
    // normalize: use e.code where useful, fall back to key
    return e.code || e.key;
  }

  function onKeyDown(e) {
    const c = e.code;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(c)) e.preventDefault();
    if (!keys[c]) pressed[c] = true;
    keys[c] = true;
  }
  function onKeyUp(e) { keys[e.code] = false; }

  function onMouseMove(e) {
    if (mouse.locked) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    } else if (mouse.rmb && havePos) {
      // Fallback when Pointer Lock isn't available (or the user pressed Esc):
      // drag with the RIGHT button to look around. Without this the camera is
      // completely frozen whenever the pointer isn't captured.
      mouse.dx += e.clientX - lastX;
      mouse.dy += e.clientY - lastY;
    }
    lastX = e.clientX; lastY = e.clientY; havePos = true;
  }
  function onMouseDown(e) {
    if (e.button === 2) {                 // right button = drag-look
      if (!canvas || e.target === canvas) { mouse.rmb = true; e.preventDefault(); }
      return;
    }
    if (e.button !== 0) return;
    // Only clicks on the game canvas count as an attack. Without this, menu
    // clicks (e.g. the start button) bubble up to window and are read as a
    // punch, which hands the player a wanted star before they even move.
    if (canvas && e.target !== canvas) return;
    if (!mouse.down) mouse.downEdge = true;
    mouse.down = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rmb = false;
  }

  function onPointerLockChange() {
    mouse.locked = (document.pointerLockElement === canvas);
  }

  function requestLock() {
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock && canvas.requestPointerLock();
    }
  }

  function init(cnv) {
    canvas = cnv;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('click', requestLock);
    // right-drag look would otherwise be interrupted by the context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // blur clears held keys to avoid stuck movement
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  }

  // consume per-frame deltas
  function consumeMouse() {
    const m = { dx: mouse.dx, dy: mouse.dy, downEdge: mouse.downEdge };
    mouse.dx = 0; mouse.dy = 0; mouse.downEdge = false;
    return m;
  }

  return { init, isDown, wasPressed, consumeMouse, requestLock, mouse, get keys() { return keys; } };
})();
