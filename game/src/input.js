// Keyboard + mouse input. Drag orbits the camera, click shoots, keys drive / walk.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_SAVE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function codeOf(e) { return e.code; }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(codeOf(e));
    if (codeOf(e) === 'Enter' || codeOf(e) === 'Space') actions |= ACTION_CONFIRM;
    if (codeOf(e) === 'KeyP' || codeOf(e) === 'Escape') actions |= ACTION_PAUSE;
    if (codeOf(e) === 'KeyM') actions |= ACTION_MUTE;
    if (codeOf(e) === 'KeyR') actions |= ACTION_SAVE;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(codeOf(e))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(codeOf(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (e.button === 0) { mouseDown = true; mouseClicked = true; }
  });
  window.addEventListener('pointerup', (e) => {
    dragging = false;
    if (e.button === 0) mouseDown = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragX += e.clientX - lastX;
    dragY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });

  return {
    keys,
    takeActions() { const a = actions; actions = 0; return a; },
    takeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    takeDrag() { const d = { x: dragX, y: dragY }; dragX = 0; dragY = 0; return d; },
    get mouseDown() { return mouseDown; },
    axis() {
      let x = 0, y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      return { x, y };
    },
    get run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    get jump() { return keys.has('Space'); },
    get handbrake() { return keys.has('Space'); },
    get interact() { return keys.has('KeyE'); },
    get punch() { return keys.has('KeyF'); },
  };
}
