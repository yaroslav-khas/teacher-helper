import { PptxPresentation, PptxViewer } from '../../node_modules/@silurus/ooxml/dist/pptx.mjs';

let presentation = null;
let mainViewer = null;
let mainObserver = null;
let activeKeydownHandler = null;

function dispose() {
  mainObserver?.disconnect();
  mainObserver = null;
  if (activeKeydownHandler) {
    window.removeEventListener('keydown', activeKeydownHandler);
    activeKeydownHandler = null;
  }
  mainViewer?.destroy();
  mainViewer = null;
  presentation?.destroy();
  presentation = null;
}
window.disposePptxViewer = dispose;

function renderFallback(container, error, filePath, onBack) {
  container.innerHTML = '<div class="pdf-fallback"></div>';
  const wrap = container.querySelector('.pdf-fallback');

  const msg = document.createElement('div');
  msg.className = 'placeholder';
  msg.textContent = `Не вдалося показати презентацію (${error ?? 'невідома причина'}). Можна відкрити файл у звичайній програмі.`;
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
  openBtn.addEventListener('click', () => window.boardApi.presentation.openFile(filePath));

  row.appendChild(backBtn);
  row.appendChild(openBtn);
  wrap.appendChild(row);
}

window.renderPptxViewer = async function renderPptxViewer(container, filePath, onBack) {
  dispose();
  container.innerHTML = '<div class="placeholder">Завантаження презентації…</div>';

  try {
    presentation = await PptxPresentation.load(`file://${filePath}`);
  } catch (err) {
    renderFallback(container, err?.message ?? String(err), filePath, onBack);
    return;
  }

  const slideCount = presentation.slideCount;

  container.innerHTML = `
    <div class="pptx-viewer">
      <div class="pdf-toolbar">
        <button id="pptx-back" title="До бібліотеки">← Бібліотека</button>
        <button id="pptx-prev" title="Попередній слайд">←</button>
        <span id="pptx-indicator" class="pdf-page-indicator"></span>
        <button id="pptx-next" title="Наступний слайд">→</button>
        <button id="pptx-fullscreen" title="Повний екран">⛶</button>
      </div>
      <div class="pptx-body">
        <div id="pptx-rail" class="pptx-rail"></div>
        <div id="pptx-main-wrap" class="pptx-main-wrap">
          <canvas id="pptx-main-canvas" class="pptx-main-canvas"></canvas>
        </div>
      </div>
      <button id="pptx-exit-fullscreen" class="pdf-exit-fullscreen" title="Вийти з повного екрана (Esc)" hidden>✕ Вийти</button>
    </div>
  `;

  const mainCanvas = container.querySelector('#pptx-main-canvas');
  const mainWrap = container.querySelector('#pptx-main-wrap');
  const railEl = container.querySelector('#pptx-rail');
  const indicator = container.querySelector('#pptx-indicator');
  const exitFsBtn = container.querySelector('#pptx-exit-fullscreen');

  mainViewer = PptxViewer.fromPresentation(mainCanvas, presentation);

  function updateIndicator() {
    indicator.textContent = `${mainViewer.slideIndex + 1} / ${slideCount}`;
    railEl.querySelectorAll('.pptx-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === mainViewer.slideIndex);
    });
  }

  async function goToSlide(index) {
    if (index < 0 || index >= slideCount) return;
    await mainViewer.goToSlide(index);
    updateIndicator();
  }

  // Мініатюри рендеримо окремо й асинхронно (renderSlideToBitmap) — вони не
  // залежать від великого перегляду і не блокують його появу.
  for (let i = 0; i < slideCount; i += 1) {
    const thumbBtn = document.createElement('button');
    thumbBtn.className = 'pptx-thumb';

    const thumbCanvas = document.createElement('canvas');
    thumbBtn.appendChild(thumbCanvas);

    const label = document.createElement('span');
    label.className = 'pptx-thumb-label';
    label.textContent = String(i + 1);
    thumbBtn.appendChild(label);

    thumbBtn.addEventListener('click', () => goToSlide(i));
    railEl.appendChild(thumbBtn);

    presentation
      .renderSlideToBitmap(i, { width: 160, dpr: window.devicePixelRatio || 1 })
      .then((bitmap) => {
        thumbCanvas.width = bitmap.width;
        thumbCanvas.height = bitmap.height;
        thumbCanvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
      })
      .catch(() => {
        /* мініатюра — не критично, якщо якийсь слайд не вдалось відрендерити */
      });
  }

  await goToSlide(0);
  await mainViewer.fitPage();

  container.querySelector('#pptx-prev').addEventListener('click', () => goToSlide(mainViewer.slideIndex - 1));
  container.querySelector('#pptx-next').addEventListener('click', () => goToSlide(mainViewer.slideIndex + 1));
  container.querySelector('#pptx-back').addEventListener('click', async () => {
    dispose();
    await exitFullscreenIfActive();
    onBack?.();
  });

  let isFullscreenActive = false;
  function exitFullscreenIfActive() {
    if (!isFullscreenActive) return;
    isFullscreenActive = false;
    document.body.classList.remove('web-fullscreen');
  }

  // Лише ховає нашу панель/рейку мініатюр — НЕ чіпає стан вікна самої
  // програми. Раніше обидва були сплутані в один виклик toggleFullscreen()
  // вікна: якщо застосунок уже був у справжньому OS-фулскріні, ця кнопка
  // натомість ВИМИКАЛА його (бо isFullScreen() вже true, тож toggle різко
  // згортав вікно з фулскріну) — виглядало як "мінімізує".
  function toggleFullscreen() {
    isFullscreenActive = !document.body.classList.contains('web-fullscreen');
    document.body.classList.toggle('web-fullscreen', isFullscreenActive);
    exitFsBtn.hidden = !isFullscreenActive;
    if (!isFullscreenActive) window.boardApi.overlay.hide();
    requestAnimationFrame(() => mainViewer?.fitPage());
  }
  container.querySelector('#pptx-fullscreen').addEventListener('click', toggleFullscreen);
  exitFsBtn.addEventListener('click', toggleFullscreen);

  // --- свайп ---
  let swipeStartX = null;
  let swipeStartY = null;
  const SWIPE_THRESHOLD = 60;
  mainWrap.addEventListener('pointerdown', (e) => {
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
  });
  mainWrap.addEventListener('pointerup', (e) => {
    if (swipeStartX === null) return;
    const dx = e.clientX - swipeStartX;
    const dy = e.clientY - swipeStartY;
    swipeStartX = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goToSlide(mainViewer.slideIndex + (dx < 0 ? 1 : -1));
  });

  activeKeydownHandler = (e) => {
    if (e.key === 'ArrowRight') goToSlide(mainViewer.slideIndex + 1);
    else if (e.key === 'ArrowLeft') goToSlide(mainViewer.slideIndex - 1);
    else if (e.key === 'Escape' && isFullscreenActive) toggleFullscreen();
  };
  window.addEventListener('keydown', activeKeydownHandler);

  mainObserver = new ResizeObserver(() => mainViewer?.fitPage());
  mainObserver.observe(mainWrap);
};
