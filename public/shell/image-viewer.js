(() => {
  let activeKeydownHandler = null;

  function dispose() {
    if (activeKeydownHandler) {
      window.removeEventListener('keydown', activeKeydownHandler);
      activeKeydownHandler = null;
    }
  }
  window.disposeImageViewer = dispose;

  window.renderImageViewer = function renderImageViewer(container, filePath, siblingImages, onBack) {
    dispose();

    let index = siblingImages.findIndex((e) => e.fullPath === filePath);
    if (index < 0) index = 0;
    let isFullscreenActive = false;

    // Неперервний zoom+pan через transform замість дискретного класу
    // "zoomed" — саме це і дає можливість масштабувати жестом (pinch),
    // а не лише перемикати між двома фіксованими розмірами.
    const MIN_SCALE = 1;
    const MAX_SCALE = 4;
    let scale = 1;
    let panX = 0;
    let panY = 0;

    container.innerHTML = `
      <div class="image-viewer">
        <div class="pdf-toolbar">
          <button id="img-back" title="До бібліотеки">← Бібліотека</button>
          <button id="img-prev" title="Попереднє">←</button>
          <span id="img-indicator" class="pdf-page-indicator"></span>
          <button id="img-next" title="Наступне">→</button>
          <button id="img-zoom" title="Збільшити / за розміром">🔍</button>
          <button id="img-fullscreen" title="Повний екран">⛶</button>
        </div>
        <div id="img-wrap" class="image-wrap">
          <img id="img-el" class="image-el" alt="" />
        </div>
        <button id="img-exit-fullscreen" class="pdf-exit-fullscreen" title="Вийти з повного екрана (Esc)" hidden>✕ Вийти</button>
      </div>
    `;

    const imgEl = container.querySelector('#img-el');
    const wrap = container.querySelector('#img-wrap');
    const indicator = container.querySelector('#img-indicator');
    const prevBtn = container.querySelector('#img-prev');
    const nextBtn = container.querySelector('#img-next');
    const exitFsBtn = container.querySelector('#img-exit-fullscreen');

    function applyTransform() {
      imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      imgEl.classList.toggle('zoomed', scale > 1);
    }

    function resetZoom() {
      scale = 1;
      panX = 0;
      panY = 0;
      applyTransform();
    }

    function update() {
      imgEl.src = `file://${siblingImages[index].fullPath}`;
      resetZoom();
      indicator.textContent = `${index + 1} / ${siblingImages.length}`;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === siblingImages.length - 1;
    }
    update();

    function go(delta) {
      const next = index + delta;
      if (next < 0 || next >= siblingImages.length) return;
      index = next;
      update();
    }

    prevBtn.addEventListener('click', () => go(-1));
    nextBtn.addEventListener('click', () => go(1));
    container.querySelector('#img-zoom').addEventListener('click', () => {
      if (scale > 1) {
        resetZoom();
      } else {
        scale = 2;
        applyTransform();
      }
    });

    container.querySelector('#img-back').addEventListener('click', async () => {
      dispose();
      await exitFullscreenIfActive();
      onBack?.();
    });

    async function exitFullscreenIfActive() {
      if (!isFullscreenActive) return;
      isFullscreenActive = false;
      document.body.classList.remove('web-fullscreen');
    }

    async function toggleFullscreen() {
      isFullscreenActive = await window.boardApi.window.toggleFullscreen();
      document.body.classList.toggle('web-fullscreen', isFullscreenActive);
      exitFsBtn.hidden = !isFullscreenActive;
      if (!isFullscreenActive) window.boardApi.overlay.hide();
    }
    container.querySelector('#img-fullscreen').addEventListener('click', toggleFullscreen);
    exitFsBtn.addEventListener('click', toggleFullscreen);

    // --- жести: pinch-zoom (два пальці), пан (один палець, коли наближено),
    // свайп між фото (один палець, коли не наближено) ---
    const activePointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let swipeStartX = null;
    let swipeStartY = null;
    const SWIPE_THRESHOLD = 60;

    function distanceBetween(p1, p2) {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }

    wrap.addEventListener('pointerdown', (e) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2) {
        const [p1, p2] = [...activePointers.values()];
        pinchStartDist = distanceBetween(p1, p2);
        pinchStartScale = scale;
        swipeStartX = null;
      } else if (activePointers.size === 1) {
        if (scale > 1) {
          panStartX = e.clientX;
          panStartY = e.clientY;
          panOriginX = panX;
          panOriginY = panY;
        } else {
          swipeStartX = e.clientX;
          swipeStartY = e.clientY;
        }
      }
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2) {
        const [p1, p2] = [...activePointers.values()];
        const dist = distanceBetween(p1, p2);
        if (pinchStartDist > 0) {
          scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * (dist / pinchStartDist)));
          applyTransform();
        }
      } else if (activePointers.size === 1 && scale > 1) {
        panX = panOriginX + (e.clientX - panStartX);
        panY = panOriginY + (e.clientY - panStartY);
        applyTransform();
      }
    });

    function endPointer(e) {
      const wasSingle = activePointers.size === 1;
      activePointers.delete(e.pointerId);

      if (wasSingle && swipeStartX !== null && scale === 1) {
        const dx = e.clientX - swipeStartX;
        const dy = e.clientY - swipeStartY;
        if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) >= Math.abs(dy) * 1.5) {
          go(dx < 0 ? 1 : -1);
        }
      }
      swipeStartX = null;
      // Розтягли назад майже до 1 — довстановлюємо рівно 1 і скидаємо пан,
      // щоб не лишався ледь помітний зсув/масштаб.
      if (scale <= 1.02 && activePointers.size === 0) resetZoom();
    }
    wrap.addEventListener('pointerup', endPointer);
    wrap.addEventListener('pointercancel', endPointer);

    activeKeydownHandler = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape' && isFullscreenActive) toggleFullscreen();
    };
    window.addEventListener('keydown', activeKeydownHandler);
  };
})();
