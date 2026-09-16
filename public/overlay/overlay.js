// =====================================================================
// Оверлей малювання — прозоре always-on-top вікно поверх будь-якої програми.
// Тільки полотно: кнопки тепер живуть в окремому непрозорому toolbarWindow
// (public/overlay-toolbar/), команди приходять сюди через IPC від main.
// Секції: (1) canvas + Windows-хіт-тест фікс, (2) стан малювання й сам draw
// loop, (3) команди з панелі (колір/товщина/ластик/очистити/click-through).
// =====================================================================

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

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
// непроклацуваною "дірою". destination-over домальовує заливку рівно вздовж
// щойно стертого штриха (а НЕ по всьому canvas — так було спочатку, і саме
// це давало видиму сіру "мряку": кожен виклик під час руху миші повторно
// заливав усе полотно, і десятки викликів на секунду накопичувались у
// помітне затемнення).
function reinforceHitTestBase(x1, y1, x2, y2, lineWidth) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.strokeStyle = HIT_TEST_FILL;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
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
  const lineWidth = baseWidth * (0.5 + pressure);
  ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(e.clientX, e.clientY);
  ctx.stroke();
  if (erasing) reinforceHitTestBase(lastX, lastY, e.clientX, e.clientY, lineWidth);
  lastX = e.clientX;
  lastY = e.clientY;
});

window.addEventListener('pointerup', () => {
  drawing = false;
});
window.addEventListener('pointercancel', () => {
  drawing = false;
});

// --- (3) команди з панелі ------------------------------------------------
window.overlayApi.onSetColor((c) => {
  color = c;
});
window.overlayApi.onSetErasing((e) => {
  erasing = e;
});
window.overlayApi.onSetWidth((w) => {
  baseWidth = w;
});

// Коли клік дійсно проходить крізь вікно до програми під низом, ОС намагається
// показати курсор ТІЄЇ програми, а наш canvas одночасно нав'язує власний
// cursor:crosshair — звідси видимий конфлікт/мерехтіння двох курсорів
// одночасно. Ховаємо прицільний курсор саме на час пропускання кліків.
window.overlayApi.onPassThroughChanged((enabled) => {
  canvas.style.cursor = enabled ? 'default' : 'crosshair';
});
