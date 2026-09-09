const btn = document.getElementById('launcher-btn');

const DRAG_THRESHOLD = 6;

let dragging = false;
let moved = false;
let startScreenX = 0;
let startScreenY = 0;
let winX = 0;
let winY = 0;

btn.addEventListener('pointerdown', async (e) => {
  dragging = true;
  moved = false;
  startScreenX = e.screenX;
  startScreenY = e.screenY;
  [winX, winY] = await window.launcherApi.getPosition();
  btn.setPointerCapture(e.pointerId);
});

btn.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - startScreenX;
  const dy = e.screenY - startScreenY;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    moved = true;
  }
  if (moved) {
    window.launcherApi.moveTo(winX + dx, winY + dy);
  }
});

btn.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved) {
    const dx = e.screenX - startScreenX;
    const dy = e.screenY - startScreenY;
    window.launcherApi.moveEnd(winX + dx, winY + dy);
  } else {
    window.launcherApi.toggleOverlay();
  }
});

btn.addEventListener('pointercancel', () => {
  dragging = false;
});
