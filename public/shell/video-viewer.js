(() => {
  let activeKeydownHandler = null;
  let activeVideoEl = null;

  function dispose() {
    // Перемикання на іншу вкладку через нав-панель (не через власну кнопку
    // "← Бібліотека") інакше лишало відео програватись у фоні — DOM-елемент
    // видаляється, але без явної паузи це не гарантовано зупиняє програвання.
    activeVideoEl?.pause();
    activeVideoEl = null;
    if (activeKeydownHandler) {
      window.removeEventListener('keydown', activeKeydownHandler);
      activeKeydownHandler = null;
    }
  }
  window.disposeVideoViewer = dispose;

  window.renderVideoViewer = function renderVideoViewer(container, filePath, siblingVideos, onBack) {
    dispose();

    let index = siblingVideos.findIndex((e) => e.fullPath === filePath);
    if (index < 0) index = 0;
    let isFsActive = false;

    container.innerHTML = `
      <div class="video-viewer">
        <div class="pdf-toolbar">
          <button id="vid-back" title="До бібліотеки">← Бібліотека</button>
          <button id="vid-prev" title="Попереднє">←</button>
          <span id="vid-indicator" class="pdf-page-indicator"></span>
          <button id="vid-next" title="Наступне">→</button>
          <button id="vid-fullscreen" title="Повний екран">⛶</button>
        </div>
        <div id="vid-wrap" class="video-wrap">
          <video id="vid-el" class="video-el" controls></video>
        </div>
        <button id="vid-exit-fullscreen" class="pdf-exit-fullscreen" title="Вийти з повного екрана (Esc)" hidden>✕ Вийти</button>
      </div>
    `;

    const videoEl = container.querySelector('#vid-el');
    activeVideoEl = videoEl;
    const indicator = container.querySelector('#vid-indicator');
    const prevBtn = container.querySelector('#vid-prev');
    const nextBtn = container.querySelector('#vid-next');
    const exitFsBtn = container.querySelector('#vid-exit-fullscreen');

    function update() {
      videoEl.src = `file://${siblingVideos[index].fullPath}`;
      videoEl.play().catch(() => {});
      indicator.textContent = `${index + 1} / ${siblingVideos.length}`;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === siblingVideos.length - 1;
    }
    update();

    function go(delta) {
      const next = index + delta;
      if (next < 0 || next >= siblingVideos.length) return;
      index = next;
      update();
    }

    prevBtn.addEventListener('pointerdown', () => go(-1));
    nextBtn.addEventListener('pointerdown', () => go(1));

    container.querySelector('#vid-back').addEventListener('pointerdown', async () => {
      videoEl.pause();
      dispose();
      await exitFullscreenIfActive();
      onBack?.();
    });

    async function exitFullscreenIfActive() {
      if (!isFsActive) return;
      isFsActive = false;
      document.body.classList.remove('web-fullscreen');
    }

    async function toggleFullscreen() {
      isFsActive = await window.boardApi.window.toggleFullscreen();
      document.body.classList.toggle('web-fullscreen', isFsActive);
      exitFsBtn.hidden = !isFsActive;
      if (!isFsActive) window.boardApi.overlay.hide();
    }
    container.querySelector('#vid-fullscreen').addEventListener('pointerdown', toggleFullscreen);
    exitFsBtn.addEventListener('pointerdown', toggleFullscreen);

    activeKeydownHandler = (e) => {
      if (document.activeElement === videoEl) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape' && isFsActive) toggleFullscreen();
    };
    window.addEventListener('keydown', activeKeydownHandler);
  };
})();
