import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdfjs/pdf.worker.min.mjs';

let activeObserver = null;
let activeKeydownHandler = null;
let isFullscreenActive = false;

function exitFullscreenIfActive() {
  if (!isFullscreenActive) return;
  isFullscreenActive = false;
  document.body.classList.remove('web-fullscreen');
}

function disposeViewer() {
  activeObserver?.disconnect();
  activeObserver = null;
  if (activeKeydownHandler) {
    window.removeEventListener('keydown', activeKeydownHandler);
    activeKeydownHandler = null;
  }
}
window.disposePdfViewer = () => {
  disposeViewer();
  exitFullscreenIfActive();
};

function renderFallback(container, error, filePath, onBack) {
  container.innerHTML = '<div class="pdf-fallback"></div>';
  const wrap = container.querySelector('.pdf-fallback');

  const msg = document.createElement('div');
  msg.className = 'placeholder';
  msg.textContent = `Не вдалося підготувати вбудований перегляд (${error ?? 'невідома причина'}). Можна відкрити файл у звичайній програмі.`;
  wrap.appendChild(msg);

  const row = document.createElement('div');
  row.className = 'pdf-fallback-actions';

  const backBtn = document.createElement('button');
  backBtn.className = 'icon-btn';
  backBtn.textContent = '← Бібліотека';
  backBtn.addEventListener('click', () => onBack?.());

  const openBtn = document.createElement('button');
  openBtn.className = 'icon-btn';
  openBtn.textContent = 'Відкрити зовні';
  openBtn.addEventListener('click', () => window.boardApi.image.openFile(filePath));

  row.appendChild(backBtn);
  row.appendChild(openBtn);
  wrap.appendChild(row);
}

window.renderPdfViewer = async function renderPdfViewer(container, filePath, onBack) {
  disposeViewer();
  container.innerHTML = '<div class="placeholder">Завантаження…</div>';

  let bytes;
  try {
    bytes = await window.boardApi.image.readFileBytes(filePath);
  } catch (err) {
    renderFallback(container, err?.message ?? String(err), filePath, onBack);
    return;
  }
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  let currentPage = 1;
  const totalPages = pdf.numPages;
  let renderTask = null;

  container.innerHTML = `
    <div class="pdf-viewer">
      <div class="pdf-toolbar">
        <button id="pdf-back" title="До бібліотеки">← Бібліотека</button>
        <button id="pdf-prev" title="Попередній слайд">←</button>
        <span id="pdf-page-indicator" class="pdf-page-indicator"></span>
        <button id="pdf-next" title="Наступний слайд">→</button>
        <button id="pdf-fullscreen" title="Повний екран">⛶</button>
      </div>
      <div class="pdf-canvas-wrap">
        <canvas id="pdf-canvas" class="pdf-canvas"></canvas>
      </div>
      <button id="pdf-exit-fullscreen" class="pdf-exit-fullscreen" title="Вийти з повного екрана (Esc)" hidden>✕ Вийти</button>
    </div>
  `;

  const canvas = container.querySelector('#pdf-canvas');
  const ctx = canvas.getContext('2d');
  const pageIndicator = container.querySelector('#pdf-page-indicator');
  const wrap = container.querySelector('.pdf-canvas-wrap');
  const exitFsBtn = container.querySelector('#pdf-exit-fullscreen');

  // pdf.js кидає помилку, якщо запустити новий render() поки canvas ще
  // зайнятий попереднім — cancel() лише ЗАПЛАНОВУЄ скасування, воно не
  // миттєве. Тому чекаємо, поки попередній таск дійсно завершиться (його
  // promise відхилиться), і лише тоді займаємо canvas знову. Токен-покоління
  // додатково відкидає застарілі виклики, якщо їх встигло накопичитись
  // кілька (швидке клацання/ресайз/fullscreen одночасно).
  let renderGeneration = 0;

  async function renderPage(num) {
    const myGeneration = ++renderGeneration;

    if (renderTask) {
      renderTask.cancel();
      try {
        await renderTask.promise;
      } catch {
        // очікуване відхилення через скасування
      }
    }
    if (myGeneration !== renderGeneration) return;

    const page = await pdf.getPage(num);
    if (myGeneration !== renderGeneration) return;

    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width < 1 || wrapRect.height < 1) return;

    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = Math.min(wrapRect.width / baseViewport.width, wrapRect.height / baseViewport.height);
    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: fitScale * pixelRatio });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / pixelRatio}px`;
    canvas.style.height = `${viewport.height / pixelRatio}px`;

    renderTask = page.render({ canvasContext: ctx, viewport });
    try {
      await renderTask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') throw err;
      return;
    }
    if (myGeneration !== renderGeneration) return;
    pageIndicator.textContent = `${num} / ${totalPages}`;
  }

  function goToPage(next) {
    if (next < 1 || next > totalPages) return;
    currentPage = next;
    renderPage(currentPage);
  }

  renderPage(currentPage);

  container.querySelector('#pdf-prev').addEventListener('click', () => goToPage(currentPage - 1));
  container.querySelector('#pdf-next').addEventListener('click', () => goToPage(currentPage + 1));
  container.querySelector('#pdf-back').addEventListener('click', async () => {
    disposeViewer();
    await exitFullscreenIfActive();
    onBack?.();
  });

  // Лише ховає нашу панель — НЕ чіпає стан вікна самої програми. Раніше обидва
  // були сплутані в один виклик toggleFullscreen() вікна: якщо застосунок уже
  // був у справжньому OS-фулскріні, ця кнопка натомість ВИМИКАЛА його (бо
  // isFullScreen() вже true) — виглядало як "мінімізує".
  function toggleFullscreen() {
    isFullscreenActive = !document.body.classList.contains('web-fullscreen');
    document.body.classList.toggle('web-fullscreen', isFullscreenActive);
    exitFsBtn.hidden = !isFullscreenActive;
    if (!isFullscreenActive) window.boardApi.overlay.hide();
    requestAnimationFrame(() => renderPage(currentPage));
  }

  container.querySelector('#pdf-fullscreen').addEventListener('click', toggleFullscreen);
  exitFsBtn.addEventListener('click', toggleFullscreen);

  // --- свайп на дошці/тачскріні ---
  let swipeStartX = null;
  let swipeStartY = null;
  const SWIPE_THRESHOLD = 60;

  wrap.addEventListener('pointerdown', (e) => {
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
  });
  wrap.addEventListener('pointerup', (e) => {
    if (swipeStartX === null) return;
    const dx = e.clientX - swipeStartX;
    const dy = e.clientY - swipeStartY;
    swipeStartX = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goToPage(dx < 0 ? currentPage + 1 : currentPage - 1);
  });

  activeKeydownHandler = (e) => {
    if (e.key === 'ArrowRight') goToPage(currentPage + 1);
    else if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
    else if (e.key === 'Escape' && isFullscreenActive) toggleFullscreen();
  };
  window.addEventListener('keydown', activeKeydownHandler);

  activeObserver = new ResizeObserver(() => renderPage(currentPage));
  activeObserver.observe(wrap);
};
