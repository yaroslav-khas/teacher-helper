const contentEl = document.getElementById('content');
const homeBtn = document.getElementById('home-btn');
const modeLabel = document.getElementById('current-mode-label');
const widgetsToggle = document.getElementById('widgets-toggle');
const fullscreenToggle = document.getElementById('fullscreen-toggle');

const activeWidgets = {};
let currentMode = null;

function activateMode(modeId) {
  const mode = window.boardModes[modeId];
  if (!mode) return;

  if (currentMode && window.boardModes[currentMode]?.onDeactivate) {
    window.boardModes[currentMode].onDeactivate();
  }

  mode.render(contentEl);
  mode.onActivate?.();

  currentMode = modeId;
  modeLabel.textContent = modeId === 'home' ? '' : `${mode.icon ?? ''} ${mode.label}`.trim();
  homeBtn.classList.toggle('active', modeId === 'home');
}
window.activateMode = activateMode;

homeBtn.addEventListener('click', () => activateMode('home'));
activateMode('home');

// --- fullscreen toggle ---
fullscreenToggle.addEventListener('click', async () => {
  const isFullscreen = await window.boardApi.window.toggleFullscreen();
  fullscreenToggle.classList.toggle('active', isFullscreen);
});
window.boardApi.window.isFullscreen().then((isFullscreen) => {
  fullscreenToggle.classList.toggle('active', isFullscreen);
});

// --- widgets menu ---
widgetsToggle.addEventListener('click', () => {
  const menu = document.createElement('div');
  menu.className = 'widgets-menu';

  Object.entries(window.boardWidgets).forEach(([id, def]) => {
    const item = document.createElement('button');
    item.textContent = (activeWidgets[id] ? '✅ ' : '⬜ ') + def.label;
    item.addEventListener('click', async () => {
      if (activeWidgets[id]) {
        window.unmountWidget(id, activeWidgets[id]);
        delete activeWidgets[id];
      } else {
        activeWidgets[id] = await window.mountWidget(id);
      }
      window.boardApi.store.set('widgets:active', Object.keys(activeWidgets));
      menu.remove();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  const rect = widgetsToggle.getBoundingClientRect();
  menu.style.left = `${rect.right - menu.offsetWidth}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== widgetsToggle) {
      menu.remove();
      document.removeEventListener('click', closeMenu, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
});

// restore previously active widgets on launch
(async () => {
  const saved = (await window.boardApi.store.get('widgets:active')) || [];
  for (const id of saved) {
    if (window.boardWidgets[id]) {
      activeWidgets[id] = await window.mountWidget(id);
    }
  }
})();

// --- update banner ---
const banner = document.getElementById('update-banner');
const bannerText = document.getElementById('update-text');
const bannerAction = document.getElementById('update-action');
const bannerDismiss = document.getElementById('update-dismiss');

window.boardApi.updater.onEvent('updater:available', (info) => {
  bannerText.textContent = `Доступна нова версія ${info?.version ?? ''}`;
  bannerAction.textContent = 'Завантажити оновлення';
  banner.hidden = false;
});

window.boardApi.updater.onEvent('updater:progress', (progress) => {
  bannerText.textContent = `Завантаження оновлення… ${Math.round(progress?.percent ?? 0)}%`;
});

window.boardApi.updater.onEvent('updater:downloaded', () => {
  bannerText.textContent = 'Оновлення завантажено';
  bannerAction.textContent = 'Перезапустити й оновити';
});

bannerAction.addEventListener('click', () => {
  if (bannerAction.textContent === 'Завантажити оновлення') {
    window.boardApi.updater.download();
    bannerAction.textContent = 'Завантаження…';
  } else if (bannerAction.textContent === 'Перезапустити й оновити') {
    window.boardApi.updater.quitAndInstall();
  }
});

bannerDismiss.addEventListener('click', () => {
  banner.hidden = true;
});
