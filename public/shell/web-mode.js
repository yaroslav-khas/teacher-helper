(() => {
  let resizeObserver = null;
  let unsubState = null;
  let unsubFullscreen = null;

  function currentBounds(anchor) {
    const rect = anchor.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  window.boardModes.web = {
    icon: '🌐',
    label: 'Веб',
    render: (container) => {
      container.innerHTML = `
        <div class="web-mode">
          <div class="web-toolbar">
            <button id="web-back" title="Назад">←</button>
            <button id="web-forward" title="Вперед">→</button>
            <button id="web-reload" title="Оновити">⟳</button>
            <input id="web-url" type="text" placeholder="Адреса сайту або пошуковий запит…" />
            <button id="web-go">Перейти</button>
          </div>
          <div id="web-anchor" class="web-anchor"></div>
        </div>
      `;

      const anchor = container.querySelector('#web-anchor');
      const urlInput = container.querySelector('#web-url');
      const backBtn = container.querySelector('#web-back');
      const forwardBtn = container.querySelector('#web-forward');

      window.boardApi.web.show(currentBounds(anchor), 'https://www.google.com');

      resizeObserver = new ResizeObserver(() => {
        window.boardApi.web.setBounds(currentBounds(anchor));
      });
      resizeObserver.observe(anchor);

      container.querySelector('#web-go').addEventListener('click', () => {
        window.boardApi.web.navigate(urlInput.value);
      });
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.boardApi.web.navigate(urlInput.value);
      });
      backBtn.addEventListener('click', () => window.boardApi.web.back());
      forwardBtn.addEventListener('click', () => window.boardApi.web.forward());
      container.querySelector('#web-reload').addEventListener('click', () => window.boardApi.web.reload());

      unsubState = window.boardApi.web.onState((state) => {
        if (document.activeElement !== urlInput) urlInput.value = state.url;
        backBtn.disabled = !state.canGoBack;
        forwardBtn.disabled = !state.canGoForward;
        window.setWebUrlForNav?.(state.url);
      });

      unsubFullscreen = window.boardApi.web.onFullscreenChange((isFullscreen) => {
        document.body.classList.toggle('web-fullscreen', isFullscreen);
      });
    },
    onDeactivate: () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      unsubState?.();
      unsubState = null;
      unsubFullscreen?.();
      unsubFullscreen = null;
      document.body.classList.remove('web-fullscreen');
      window.boardApi.web.hide();
    },
  };
})();
