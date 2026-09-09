(() => {
  const PATH_KEY = 'anthem:path';

  let escHandler = null;
  let videoEl = null;

  window.boardModes.anthem = {
    icon: '🇺🇦',
    label: 'Гімн України',
    render: (container) => {
      container.innerHTML = `
        <div class="video-viewer">
          <div class="video-wrap">
            <video id="anthem-video" class="anthem-video" autoplay></video>
          </div>
          <button id="anthem-exit" class="pdf-exit-fullscreen">✕ Закрити (Esc)</button>
        </div>
      `;

      videoEl = container.querySelector('#anthem-video');

      window.boardApi.store.get(PATH_KEY).then((filePath) => {
        if (!filePath) {
          window.activateMode('home');
          return;
        }
        videoEl.src = `file://${filePath}`;
        videoEl.play().catch(() => {});
      });

      document.body.classList.add('web-fullscreen');
      window.boardApi.window.isFullscreen().then((isFs) => {
        if (!isFs) window.boardApi.window.toggleFullscreen();
      });

      function finish() {
        videoEl?.pause();
        document.body.classList.remove('web-fullscreen');
        window.activateMode('home');
      }

      videoEl.addEventListener('ended', finish);
      container.querySelector('#anthem-exit').addEventListener('pointerdown', finish);

      escHandler = (e) => {
        if (e.key === 'Escape') finish();
      };
      window.addEventListener('keydown', escHandler);
    },
    onDeactivate: () => {
      videoEl?.pause();
      videoEl = null;
      if (escHandler) {
        window.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
      document.body.classList.remove('web-fullscreen');
    },
  };

  // Якщо файл ще не обрано (перший запуск) — одразу пропонує вибрати його,
  // замість мовчки нічого не робити.
  window.triggerAnthem = async function triggerAnthem() {
    let filePath = await window.boardApi.store.get(PATH_KEY);
    if (!filePath) {
      filePath = await window.boardApi.anthem.chooseFile();
      if (!filePath) return;
      await window.boardApi.store.set(PATH_KEY, filePath);
    }
    window.activateMode('anthem');
  };
})();
