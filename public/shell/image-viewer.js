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
    let zoomed = false;
    let isFullscreenActive = false;

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

    function update() {
      imgEl.src = `file://${siblingImages[index].fullPath}`;
      imgEl.classList.toggle('zoomed', zoomed);
      indicator.textContent = `${index + 1} / ${siblingImages.length}`;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === siblingImages.length - 1;
    }
    update();

    function go(delta) {
      const next = index + delta;
      if (next < 0 || next >= siblingImages.length) return;
      index = next;
      zoomed = false;
      update();
    }

    prevBtn.addEventListener('click', () => go(-1));
    nextBtn.addEventListener('click', () => go(1));
    container.querySelector('#img-zoom').addEventListener('click', () => {
      zoomed = !zoomed;
      update();
    });
    imgEl.addEventListener('click', () => {
      zoomed = !zoomed;
      update();
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

    let swipeStartX = null;
    let swipeStartY = null;
    const SWIPE_THRESHOLD = 60;
    wrap.addEventListener('pointerdown', (e) => {
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
    });
    wrap.addEventListener('pointerup', (e) => {
      if (swipeStartX === null || zoomed) return;
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      swipeStartX = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      go(dx < 0 ? 1 : -1);
    });

    activeKeydownHandler = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape' && isFullscreenActive) toggleFullscreen();
    };
    window.addEventListener('keydown', activeKeydownHandler);
  };
})();
