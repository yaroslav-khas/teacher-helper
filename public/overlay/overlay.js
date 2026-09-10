const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const prev = canvas.width ? canvas.toDataURL() : null;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (prev) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = prev;
  }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let drawing = false;
let lastX = 0;
let lastY = 0;
let color = '#ff3b30';
let baseWidth = 4;
let erasing = false;

canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  lastX = e.clientX;
  lastY = e.clientY;
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const pressure = e.pressure > 0 ? e.pressure : 0.5;
  ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.lineWidth = baseWidth * (0.5 + pressure);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(e.clientX, e.clientY);
  ctx.stroke();
  lastX = e.clientX;
  lastY = e.clientY;
});

window.addEventListener('pointerup', () => {
  drawing = false;
});
window.addEventListener('pointercancel', () => {
  drawing = false;
});

document.querySelectorAll('.swatch').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    color = btn.dataset.color;
    erasing = false;
    document.getElementById('eraser').classList.remove('active');
    document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b === btn));
    // На тачскріні кнопка інакше лишається візуально "натиснутою"/у фокусі
    // назавжди — тут немає миші, яка природньо зняла б цей стан.
    e.currentTarget.blur();
  });
});

document.getElementById('width').addEventListener('input', (e) => {
  baseWidth = Number(e.target.value);
});

document.getElementById('eraser').addEventListener('click', (e) => {
  erasing = !erasing;
  e.currentTarget.classList.toggle('active', erasing);
  e.currentTarget.blur();
});

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

document.getElementById('clear').addEventListener('click', (e) => {
  clearCanvas();
  e.currentTarget.blur();
});
window.overlayApi.onClear(clearCanvas);

document.getElementById('close').addEventListener('click', () => {
  window.overlayApi.close();
});

// --- «пропускати кліки» ---
// Вікно ignoreMouseEvents діє на все вікно одразу, тож панель інструментів
// стає теж непроклацуваною. Тому тримаємо панель завжди «живою»: щойно курсор
// над нею — знімаємо ignore, а поза нею — застосовуємо його, якщо пропуск увімкнено.
const toolbar = document.getElementById('toolbar');
const clickThroughBtn = document.getElementById('click-through');

let passThroughEnabled = false;
let overToolbar = false;
let currentIgnore = false;

function applyIgnoreState() {
  const shouldIgnore = passThroughEnabled && !overToolbar;
  if (shouldIgnore !== currentIgnore) {
    currentIgnore = shouldIgnore;
    window.overlayApi.setIgnoreMouseEvents(shouldIgnore);
  }
}

function setPassThrough(next) {
  passThroughEnabled = next;
  clickThroughBtn.classList.toggle('active', passThroughEnabled);
  applyIgnoreState();
}

clickThroughBtn.addEventListener('click', () => {
  overToolbar = true;
  setPassThrough(!passThroughEnabled);
});

window.overlayApi.onForceTogglePassThrough(() => setPassThrough(!passThroughEnabled));

document.addEventListener('mousemove', (e) => {
  const rect = toolbar.getBoundingClientRect();
  const inside =
    e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (inside !== overToolbar) {
    overToolbar = inside;
    applyIgnoreState();
  }
});

// --- toolbar dragging ---
const dragHandle = toolbar.querySelector('.drag-handle');
let draggingToolbar = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

dragHandle.addEventListener('pointerdown', (e) => {
  draggingToolbar = true;
  dragOffsetX = e.clientX - toolbar.offsetLeft;
  dragOffsetY = e.clientY - toolbar.offsetTop;
});

window.addEventListener('pointermove', (e) => {
  if (!draggingToolbar) return;
  toolbar.style.left = `${e.clientX - dragOffsetX}px`;
  toolbar.style.top = `${e.clientY - dragOffsetY}px`;
});

window.addEventListener('pointerup', () => {
  draggingToolbar = false;
});
