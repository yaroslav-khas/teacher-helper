// =====================================================================
// Оверлей малювання — прозоре always-on-top вікно поверх будь-якої програми.
// Секції нижче: (1) canvas + Windows-хіт-тест фікс, (2) стан малювання й
// сам draw loop, (3) кнопки панелі (колір/ластик/очистити/закрити),
// (4) "пропускати кліки" (click-through), (5) перетягування панелі.
// =====================================================================

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const toolbar = document.getElementById('toolbar');

// --- (1) canvas + Windows-хіт-тест фікс -------------------------------
//
// Windows хіт-тестить прозоре (layered) вікно по альфа-каналу: повністю
// прозорий (alpha=0) піксель сама ОС вважає "непроклацуваним" незалежно від
// setIgnoreMouseEvents(false) — клік просто провалюється крізь нього до
// вікна під низом (на macOS такого немає, там усе працює одразу). Малопомітна
// заливка (1/255 альфи — візуально не відрізнити від чистої прозорості)
// робить піксель "непрозорим" для Windows, і хіт-тест повністю переходить
// під контроль нашого коду (ignoreMouseEvents/click-through нижче).
const HIT_TEST_FILL = 'rgba(0, 0, 0, 0.004)';

function fillHitTestBase() {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = HIT_TEST_FILL;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// Ластик (destination-out) прибирає й цю базову заливку в стертій області,
// повертаючи їй справжню alpha=0 — тобто щойно стерта пляма ставала б знову
// непроклацуваною "дірою". destination-over домальовує заливку рівно туди,
// де альфа впала нижче 1, не займаючи вже намальовані лінії.
function reinforceHitTestBase() {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = HIT_TEST_FILL;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function resizeCanvas() {
  const prev = canvas.width ? canvas.toDataURL() : null;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fillHitTestBase();
  if (prev) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = prev;
  }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fillHitTestBase();
}
document.getElementById('clear').addEventListener('pointerdown', (e) => {
  clearCanvas();
  e.currentTarget.blur();
});
window.overlayApi.onClear(clearCanvas);

// --- (2) стан малювання -------------------------------------------------
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
  if (erasing) reinforceHitTestBase();
});

window.addEventListener('pointerup', () => {
  drawing = false;
});
window.addEventListener('pointercancel', () => {
  drawing = false;
});

// --- (3) кнопки панелі ---------------------------------------------------
// pointerdown, а не click — на тачскріні дає миттєву реакцію без затримки
// на можливий подвійний тап (як і скрізь в основному вікні застосунку).
document.querySelectorAll('.swatch').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
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

document.getElementById('eraser').addEventListener('pointerdown', (e) => {
  erasing = !erasing;
  e.currentTarget.classList.toggle('active', erasing);
  e.currentTarget.blur();
});

document.getElementById('close').addEventListener('pointerdown', () => {
  window.overlayApi.close();
});

// --- (4) «пропускати кліки» (click-through) ------------------------------
// Вікно ignoreMouseEvents діє на все вікно одразу, тож панель інструментів
// стає теж непроклацуваною. Тому тримаємо панель завжди «живою»: щойно курсор
// над нею — знімаємо ignore, а поза нею — застосовуємо його, якщо пропуск увімкнено.
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

clickThroughBtn.addEventListener('pointerdown', () => {
  overToolbar = true;
  setPassThrough(!passThroughEnabled);
});

window.overlayApi.onForceTogglePassThrough(() => setPassThrough(!passThroughEnabled));

// pointermove, а не mousemove — щоб перевірка "чи курсор над панеллю"
// однаково рахувалась і для пера/тача, а не лише для миші.
document.addEventListener('pointermove', (e) => {
  const rect = toolbar.getBoundingClientRect();
  const inside =
    e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (inside !== overToolbar) {
    overToolbar = inside;
    applyIgnoreState();
  }
});

// --- (5) перетягування панелі --------------------------------------------
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
