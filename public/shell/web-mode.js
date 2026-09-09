(() => {
  let resizeObserver = null;
  let unsubState = null;
  let unsubFullscreen = null;
  let currentUrl = '';
  let currentTitle = '';

  const BOOKMARKS_KEY = 'web:bookmarks';
  const DEFAULT_BOOKMARKS = [
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Google Диск', url: 'https://drive.google.com' },
  ];

  function currentBounds(anchor) {
    const rect = anchor.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  async function getBookmarks() {
    const saved = await window.boardApi.store.get(BOOKMARKS_KEY);
    return Array.isArray(saved) ? saved : DEFAULT_BOOKMARKS;
  }

  async function renderBookmarks(barEl) {
    const bookmarks = await getBookmarks();
    barEl.innerHTML = '';

    bookmarks.forEach((bm, index) => {
      const chip = document.createElement('button');
      chip.className = 'web-bookmark';
      chip.title = bm.url;

      const label = document.createElement('span');
      label.textContent = bm.name;
      chip.appendChild(label);

      const removeBtn = document.createElement('span');
      removeBtn.className = 'web-bookmark-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Прибрати закладку';
      removeBtn.addEventListener('pointerdown', async (e) => {
        e.stopPropagation();
        const list = await getBookmarks();
        list.splice(index, 1);
        await window.boardApi.store.set(BOOKMARKS_KEY, list);
        renderBookmarks(barEl);
      });
      chip.appendChild(removeBtn);

      chip.addEventListener('pointerdown', (e) => {
        if (e.target === removeBtn) return;
        window.boardApi.web.navigate(bm.url);
      });

      barEl.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'web-bookmark web-bookmark-add';
    addBtn.title = 'Додати поточну сторінку в закладки';
    addBtn.textContent = '+';
    addBtn.addEventListener('pointerdown', async () => {
      if (!currentUrl) return;
      const list = await getBookmarks();
      list.push({ name: currentTitle || hostnameOf(currentUrl), url: currentUrl });
      await window.boardApi.store.set(BOOKMARKS_KEY, list);
      renderBookmarks(barEl);
    });
    barEl.appendChild(addBtn);
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
          <div id="web-bookmarks" class="web-bookmarks"></div>
          <div id="web-anchor" class="web-anchor"></div>
        </div>
      `;

      const anchor = container.querySelector('#web-anchor');
      const urlInput = container.querySelector('#web-url');
      const backBtn = container.querySelector('#web-back');
      const forwardBtn = container.querySelector('#web-forward');
      const bookmarksBar = container.querySelector('#web-bookmarks');

      renderBookmarks(bookmarksBar);

      window.boardApi.web.show(currentBounds(anchor), 'https://www.google.com');

      resizeObserver = new ResizeObserver(() => {
        window.boardApi.web.setBounds(currentBounds(anchor));
      });
      resizeObserver.observe(anchor);

      // pointerdown, не click — коли WebContentsView тримає фокус, перший
      // click по власних кнопках вікна губиться на перефокусування.
      function submitUrl() {
        window.boardApi.web.navigate(urlInput.value);
        // Клік усередині вбудованого браузера — це окремий нативний view, не
        // частина DOM нашої сторінки, тож він ніяк не знімає фокус з поля.
        // Без цього рядок назавжди застряг би на введеному запиті й більше
        // ніколи не показував би справжню адресу після переходів.
        urlInput.blur();
      }
      container.querySelector('#web-go').addEventListener('pointerdown', submitUrl);
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitUrl();
      });
      backBtn.addEventListener('pointerdown', () => window.boardApi.web.back());
      forwardBtn.addEventListener('pointerdown', () => window.boardApi.web.forward());
      container.querySelector('#web-reload').addEventListener('pointerdown', () => window.boardApi.web.reload());

      unsubState = window.boardApi.web.onState((state) => {
        currentUrl = state.url;
        currentTitle = state.title;
        if (document.activeElement !== urlInput) urlInput.value = state.url;
        backBtn.disabled = !state.canGoBack;
        forwardBtn.disabled = !state.canGoForward;
      });

      unsubFullscreen = window.boardApi.web.onFullscreenChange((isFullscreen) => {
        document.body.classList.toggle('web-fullscreen', isFullscreen);
        if (!isFullscreen) window.boardApi.overlay.hide();
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
