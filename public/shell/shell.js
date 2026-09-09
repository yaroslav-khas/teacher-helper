const contentEl = document.getElementById('content');
const modeNav = document.getElementById('mode-nav');
const modeLabel = document.getElementById('current-mode-label');
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const topbarClock = document.getElementById('topbar-clock');

let currentMode = null;

function updateModeNavActive() {
  modeNav.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

function activateMode(modeId) {
  const mode = window.boardModes[modeId];
  if (!mode) return;

  if (currentMode && window.boardModes[currentMode]?.onDeactivate) {
    window.boardModes[currentMode].onDeactivate();
  }

  // Малювання прив'язане до того, що зараз на екрані — при переході на іншу
  // вкладку стара анотація втрачає сенс, тож ховаємо (і, відповідно, чистимо
  // від попереднього фіксу) оверлей автоматично.
  window.boardApi.overlay.hide();

  mode.render(contentEl);
  mode.onActivate?.();

  currentMode = modeId;
  modeLabel.textContent = modeId === 'home' ? '' : `${mode.icon ?? ''} ${mode.label}`.trim();
  updateModeNavActive();
}
window.activateMode = activateMode;

// Нав-кнопки слухають pointerdown, а не click: коли вбудований браузер
// (WebContentsView) тримає фокус (наприклад, автофокус поля пошуку на
// Google/YouTube), перший клік по власних кнопках вікна йде лише на
// перефокусування і синтетичний click не долітає — а pointerdown спрацьовує
// одразу, з першого разу.
modeNav.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('pointerdown', () => activateMode(btn.dataset.mode));
});
activateMode('home');

// --- малювання поверх (доступне звідусіль, у т.ч. з фулскріну переглядачів) ---
document.getElementById('pencil-toggle').addEventListener('pointerdown', () => {
  window.boardApi.overlay.toggle();
});
document.getElementById('pencil-toggle-fs').addEventListener('pointerdown', () => {
  window.boardApi.overlay.toggle();
});

// --- fullscreen toggle ---
fullscreenToggle.addEventListener('pointerdown', async () => {
  const isFullscreen = await window.boardApi.window.toggleFullscreen();
  fullscreenToggle.classList.toggle('active', isFullscreen);
});
window.boardApi.window.isFullscreen().then((isFullscreen) => {
  fullscreenToggle.classList.toggle('active', isFullscreen);
});

// --- налаштування ---
const ALWAYS_FULLSCREEN_KEY = 'settings:always-fullscreen';
const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('settings-menu');
const alwaysFullscreenCheckbox = document.getElementById('settings-always-fullscreen');
const autoLaunchCheckbox = document.getElementById('settings-auto-launch');

settingsToggle.addEventListener('pointerdown', async (e) => {
  e.stopPropagation();
  if (!settingsMenu.hidden) {
    settingsMenu.hidden = true;
    return;
  }
  alwaysFullscreenCheckbox.checked = Boolean(await window.boardApi.store.get(ALWAYS_FULLSCREEN_KEY));
  autoLaunchCheckbox.checked = await window.boardApi.window.getAutoLaunch();
  settingsMenu.hidden = false;
});

document.addEventListener('pointerdown', (e) => {
  if (!settingsMenu.hidden && !settingsMenu.contains(e.target) && e.target !== settingsToggle) {
    settingsMenu.hidden = true;
  }
});

alwaysFullscreenCheckbox.addEventListener('change', () => {
  window.boardApi.store.set(ALWAYS_FULLSCREEN_KEY, alwaysFullscreenCheckbox.checked);
});

autoLaunchCheckbox.addEventListener('change', () => {
  window.boardApi.window.setAutoLaunch(autoLaunchCheckbox.checked);
});

document.getElementById('settings-minimize').addEventListener('pointerdown', () => {
  window.boardApi.window.minimize();
});

document.getElementById('settings-quit').addEventListener('pointerdown', () => {
  window.boardApi.window.quit();
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
