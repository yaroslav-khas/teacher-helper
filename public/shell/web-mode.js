(() => {
  let resizeObserver = null;
  let unsubTabs = null;
  let unsubFullscreen = null;
  let escFallbackHandler = null;
  let currentUrl = '';
  let currentTitle = '';

  const BOOKMARKS_KEY = 'web:bookmarks';
  const DEFAULT_BOOKMARKS = [
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Google Диск', url: 'https://drive.google.com' },
    { name: 'Wordwall', url: 'https://wordwall.net' },
    { name: 'LearningApps', url: 'https://learningapps.org' },
    { name: 'Kahoot', url: 'https://kahoot.com' },
    { name: 'Classroomscreen', url: 'https://classroomscreen.com' },
    { name: 'Wheel of Names', url: 'https://wheelofnames.com' },
    { name: 'Online Stopwatch', url: 'https://www.online-stopwatch.com' },
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

      // Закладка відкривається в НОВІЙ вкладці — щоб клік не "збив" те, що
      // вчитель уже мав відкритим в поточній.
      chip.addEventListener('pointerdown', (e) => {
        if (e.target === removeBtn) return;
        window.boardApi.web.newTab(bm.url);
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

  function renderTabs(tabsEl, tabsData, activeId) {
    tabsEl.innerHTML = '';

    tabsData.forEach((tab) => {
      const pill = document.createElement('button');
      pill.className = 'web-tab' + (tab.id === activeId ? ' active' : '');
      pill.title = tab.url;

      const label = document.createElement('span');
      label.className = 'web-tab-label';
      label.textContent = tab.title || 'Нова вкладка';
      pill.appendChild(label);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'web-tab-close';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Закрити вкладку';
      closeBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        window.boardApi.web.closeTab(tab.id);
      });
      pill.appendChild(closeBtn);

      pill.addEventListener('pointerdown', (e) => {
        if (e.target === closeBtn) return;
        window.boardApi.web.switchTab(tab.id);
      });

      tabsEl.appendChild(pill);
    });

    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'web-tab web-tab-add';
    newTabBtn.title = 'Нова вкладка';
    newTabBtn.textContent = '+';
    newTabBtn.addEventListener('pointerdown', () => window.boardApi.web.newTab());
    tabsEl.appendChild(newTabBtn);
  }

  window.boardModes.web = {
    icon: '🌐',
    label: 'Веб',
    render: (container) => {
      container.innerHTML = `
        <div class="web-mode">
          <div id="web-tabs" class="web-tabs"></div>
          <div class="web-toolbar">
            <button id="web-back" title="Назад">←</button>
            <button id="web-forward" title="Вперед">→</button>
            <button id="web-reload" title="Оновити">⟳</button>
            <input id="web-url" type="text" placeholder="Адреса сайту або пошуковий запит…" />
            <button id="web-go">Перейти</button>
            <button id="web-content-fullscreen" title="На весь екран (тільки сторінка)">⛶</button>
          </div>
          <div id="web-bookmarks" class="web-bookmarks"></div>
          <div id="web-fullscreen-bar" class="web-fullscreen-bar" hidden>
            <button id="web-fullscreen-pencil" title="Малювати поверх (Ctrl+Alt+M)">✏️</button>
            <button id="web-exit-fullscreen">✕ Вийти з повного екрана (Esc)</button>
          </div>
          <div id="web-anchor" class="web-anchor"></div>
        </div>
      `;

      const anchor = container.querySelector('#web-anchor');
      const urlInput = container.querySelector('#web-url');
      const backBtn = container.querySelector('#web-back');
      const forwardBtn = container.querySelector('#web-forward');
      const bookmarksBar = container.querySelector('#web-bookmarks');
      const tabsBar = container.querySelector('#web-tabs');
      // Живе окремим рядком НАД #web-anchor (не position:fixed поверх нього) —
      // WebContentsView є нативним шаром і завжди рендериться поверх DOM
      // хоста, тож будь-яка "плаваюча" кнопка з CSS z-index опинилась би під
      // браузером і була б невидимою/неклікабельною. Розмістивши кнопку
      // виходу в звичайному потоці документа ПЕРЕД анкором, ми гарантуємо,
      // що обчислені для WebContentsView межі (currentBounds) фізично не
      // перекривають цю кнопку. Загальна плаваюча ✏️ (.pencil-fs-btn) теж
      // фіксована зверху зліва — накладалась би на цю панель, тож для
      // веб-режиму дублюємо олівець прямо тут, а плаваючу ховаємо CSS-ом.
      const fsBar = container.querySelector('#web-fullscreen-bar');
      const exitFsBtn = container.querySelector('#web-exit-fullscreen');
      container.querySelector('#web-fullscreen-pencil').addEventListener('pointerdown', () => {
        window.boardApi.overlay.toggle();
      });

      renderBookmarks(bookmarksBar);

      window.boardApi.web.show(currentBounds(anchor), 'https://www.google.com');

      // Коалесуємо через requestAnimationFrame: під час анімованого ресайзу
      // вікна (напр. вхід у повний екран) ResizeObserver може спрацювати
      // по кілька разів за кадр — синхронний IPC-ресайз нативного
      // WebContentsView на кожен такий виклик і давав видимі фрізи/ривки.
      let boundsRaf = null;
      function syncBoundsNextFrame() {
        if (boundsRaf) return;
        boundsRaf = requestAnimationFrame(() => {
          boundsRaf = null;
          window.boardApi.web.setBounds(currentBounds(anchor));
        });
      }

      resizeObserver = new ResizeObserver(syncBoundsNextFrame);
      resizeObserver.observe(anchor);

      // WebContentsView — нативний шар, який завжди рендериться поверх DOM
      // хоста (топбару, попапів налаштувань, банерів) незалежно від z-index.
      // Єдиний спосіб показати DOM-попап "над" відкритим сайтом — тимчасово
      // відʼєднати сам браузер, поки попап видимий, і повернути назад по
      // закритті. shell.js викликає це перед показом будь-якого такого попапу.
      // hideForPopup (а не звичайний hide) навмисно НЕ ставить відео на паузу —
      // попап видно кілька секунд, зупиняти через нього перегляд не варто.
      window.setWebViewVisible = function setWebViewVisible(visible) {
        if (visible) {
          window.boardApi.web.show(currentBounds(anchor));
        } else {
          window.boardApi.web.hideForPopup();
        }
      };

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

      unsubTabs = window.boardApi.web.onTabsChanged(({ tabs, activeId }) => {
        renderTabs(tabsBar, tabs, activeId);

        const active = tabs.find((t) => t.id === activeId);
        if (!active) return;
        currentUrl = active.url;
        currentTitle = active.title;
        if (document.activeElement !== urlInput) urlInput.value = active.url;
        backBtn.disabled = !active.canGoBack;
        forwardBtn.disabled = !active.canGoForward;
      });

      unsubFullscreen = window.boardApi.web.onFullscreenChange((isFullscreen) => {
        document.body.classList.toggle('web-fullscreen', isFullscreen);
        fsBar.hidden = !isFullscreen;
        if (!isFullscreen) window.boardApi.overlay.hide();
        syncBoundsNextFrame();
      });

      // Кнопка "лише сторінка на весь екран": ховає нашу навігацію/вкладки,
      // НЕ чіпаючи стан вікна самої програми (це окрема річ — ⛶ у топбарі).
      function toggleContentFullscreen() {
        const isFs = !document.body.classList.contains('web-fullscreen');
        document.body.classList.toggle('web-fullscreen', isFs);
        fsBar.hidden = !isFs;
        if (!isFs) window.boardApi.overlay.hide();
        syncBoundsNextFrame();
      }
      container.querySelector('#web-content-fullscreen').addEventListener('pointerdown', toggleContentFullscreen);
      exitFsBtn.addEventListener('pointerdown', toggleContentFullscreen);

      // Запасний варіант: якщо сторінка (наприклад, вихід з фулскріну
      // відео на YouTube) не завжди надійно шле нам подію
      // leave-html-full-screen, Esc примусово повертає нашу навігацію.
      escFallbackHandler = (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('web-fullscreen')) {
          document.body.classList.remove('web-fullscreen');
          fsBar.hidden = true;
          syncBoundsNextFrame();
        }
      };
      window.addEventListener('keydown', escFallbackHandler);
    },
    onDeactivate: () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      unsubTabs?.();
      unsubTabs = null;
      unsubFullscreen?.();
      unsubFullscreen = null;
      if (escFallbackHandler) {
        window.removeEventListener('keydown', escFallbackHandler);
        escFallbackHandler = null;
      }
      document.body.classList.remove('web-fullscreen');
      window.boardApi.web.hide();
      window.setWebViewVisible = null;
    },
  };

  // Викликається з головного екрана: перемикає на "Веб" і відкриває
  // посилання в новій вкладці, не чіпаючи те, що вже було відкрите.
  window.openWebLinkInNewTab = function openWebLinkInNewTab(url) {
    window.activateMode('web');
    window.boardApi.web.newTab(url);
  };
})();
