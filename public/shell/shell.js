const contentEl = document.getElementById('content');
const modeNav = document.getElementById('mode-nav');
const modeLabel = document.getElementById('current-mode-label');
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const youtubeBtn = document.getElementById('nav-youtube');
const topbarClock = document.getElementById('topbar-clock');

let currentMode = null;
let webIsYoutube = false;

function isYoutubeUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  } catch {
    return false;
  }
}

function updateModeNavActive() {
  modeNav.querySelectorAll('[data-mode]').forEach((btn) => {
    const isWebBtn = btn.dataset.mode === 'web';
    btn.classList.toggle('active', btn.dataset.mode === currentMode && !(isWebBtn && webIsYoutube));
  });
  youtubeBtn.classList.toggle('active', currentMode === 'web' && webIsYoutube);
}

function activateMode(modeId) {
  const mode = window.boardModes[modeId];
  if (!mode) return;

  if (currentMode && window.boardModes[currentMode]?.onDeactivate) {
    window.boardModes[currentMode].onDeactivate();
  }

  mode.render(contentEl);
  mode.onActivate?.();

  currentMode = modeId;
  if (modeId !== 'web') webIsYoutube = false;
  modeLabel.textContent = modeId === 'home' ? '' : `${mode.icon ?? ''} ${mode.label}`.trim();
  updateModeNavActive();
}
window.activateMode = activateMode;

// called by web-mode.js whenever the embedded page's URL changes
window.setWebUrlForNav = function setWebUrlForNav(url) {
  webIsYoutube = isYoutubeUrl(url);
  updateModeNavActive();
};

modeNav.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => activateMode(btn.dataset.mode));
});
activateMode('home');

// --- YouTube quick launch ---
youtubeBtn.addEventListener('click', () => {
  webIsYoutube = true;
  activateMode('web');
  window.boardApi.web.navigate('https://www.youtube.com');
});

// --- fullscreen toggle ---
fullscreenToggle.addEventListener('click', async () => {
  const isFullscreen = await window.boardApi.window.toggleFullscreen();
  fullscreenToggle.classList.toggle('active', isFullscreen);
});
window.boardApi.window.isFullscreen().then((isFullscreen) => {
  fullscreenToggle.classList.toggle('active', isFullscreen);
});

// --- topbar clock ---
function tickClock() {
  topbarClock.textContent = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}
tickClock();
setInterval(tickClock, 1000);

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
