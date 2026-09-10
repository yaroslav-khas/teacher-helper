const contentEl = document.getElementById('content');
const modeNav = document.getElementById('mode-nav');
const modeLabel = document.getElementById('current-mode-label');
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const topbarClock = document.getElementById('topbar-clock');

let currentMode = null;
// Лічильник "покоління" рендеру: асинхронні режими (бібліотеки файлів тощо)
// звіряються з ним перед кожним записом у DOM. Без цього повільна відповідь
// від попереднього режиму (повільний диск/мережева тека на Windows) могла
// дозаписатись поверх щойно відкритого — і виглядало це як "тека зникла".
let renderGeneration = 0;
window.getRenderGeneration = () => renderGeneration;

function updateModeNavActive() {
  modeNav.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

function activateMode(modeId) {
  const mode = window.boardModes[modeId];
  if (!mode) return;

  renderGeneration += 1;

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
window.currentBoardMode = () => currentMode;

// На тачскріні :focus по дотику ніколи природньо не знімається (нема миші,
// яка б "клікнула повз") — без цього кнопки в топбарі (напр. повний екран)
// візуально лишались би "застиглими" в натиснутому стані після дотику.
document.addEventListener('pointerup', (e) => {
  const btn = e.target.closest('.icon-btn, .settings-btn, .settings-icon-btn');
  btn?.blur();
});

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
const LIGHT_THEME_KEY = 'settings:light-theme';
const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('settings-menu');
const alwaysFullscreenCheckbox = document.getElementById('settings-always-fullscreen');
const autoLaunchCheckbox = document.getElementById('settings-auto-launch');
const lightThemeCheckbox = document.getElementById('settings-light-theme');

// WebContentsView (вбудований браузер у "Веб") — нативний шар, який завжди
// рендериться поверх DOM хоста незалежно від z-index, тож попап налаштувань
// інакше опинявся б під відкритим сайтом. window.setWebViewVisible існує,
// лише коли активний режим "Веб" (визначається в web-mode.js).
function closeSettingsMenu() {
  if (settingsMenu.hidden) return;
  settingsMenu.hidden = true;
  window.setWebViewVisible?.(true);
}

async function openSettingsMenu() {
  window.setWebViewVisible?.(false);
  alwaysFullscreenCheckbox.checked = Boolean(await window.boardApi.store.get(ALWAYS_FULLSCREEN_KEY));
  autoLaunchCheckbox.checked = await window.boardApi.window.getAutoLaunch();
  lightThemeCheckbox.checked = Boolean(await window.boardApi.store.get(LIGHT_THEME_KEY));
  settingsMenu.hidden = false;
}

settingsToggle.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (!settingsMenu.hidden) {
    closeSettingsMenu();
    return;
  }
  openSettingsMenu();
});

// --- тема ---
function applyTheme(isLight) {
  document.documentElement.classList.toggle('theme-light', isLight);
}
// Застосовуємо збережену тему одразу при завантаженні, не чекаючи відкриття
// налаштувань — інакше вчитель бачив би темну тему кожного разу до першого
// відкриття ⚙️.
window.boardApi.store.get(LIGHT_THEME_KEY).then((isLight) => applyTheme(Boolean(isLight)));

lightThemeCheckbox.addEventListener('change', () => {
  window.boardApi.store.set(LIGHT_THEME_KEY, lightThemeCheckbox.checked);
  applyTheme(lightThemeCheckbox.checked);
});

document.addEventListener('pointerdown', (e) => {
  if (!settingsMenu.hidden && !settingsMenu.contains(e.target) && e.target !== settingsToggle) {
    closeSettingsMenu();
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

document.getElementById('settings-view-logs').addEventListener('pointerdown', () => {
  window.boardApi.logs.openWindow();
});

document.getElementById('settings-silence-now').addEventListener('pointerdown', () => {
  settingsMenu.hidden = true;
  // Ручний запуск на випадок, якщо треба провести хвилину мовчання не рівно
  // о 9:00 (інший розклад дзвінків тощо) — той самий шлях, що й щоденний
  // автотригер: сповіщення + банер, а не пряме відкриття таймера.
  window.boardApi.momentOfSilence.simulate();
});

document.getElementById('settings-anthem-now').addEventListener('pointerdown', () => {
  settingsMenu.hidden = true;
  window.triggerAnthem();
});

document.getElementById('settings-anthem-gear').addEventListener('pointerdown', async (e) => {
  e.stopPropagation();
  const chosen = await window.boardApi.anthem.chooseFile();
  if (chosen) await window.boardApi.store.set('anthem:path', chosen);
});

// --- версія і ручна перевірка оновлень ---
const versionLabel = document.getElementById('settings-version-label');
const checkUpdateBtn = document.getElementById('settings-check-update');
const updateStatusEl = document.getElementById('settings-update-status');

window.boardApi.window.getVersion().then(({ version, electron }) => {
  versionLabel.textContent = `Версія: ${version} (білд Electron ${electron})`;
});

checkUpdateBtn.addEventListener('pointerdown', async (e) => {
  e.stopPropagation();
  updateStatusEl.textContent = 'Перевірка…';
  try {
    await window.boardApi.updater.checkNow();
  } catch {
    // Портативна збірка не має конфігурації для перевірки — чесно про це
    // повідомляємо, а не лишаємо кнопку виглядати "мертвою".
    updateStatusEl.textContent = 'Перевірка недоступна для цієї збірки (portable)';
  }
});

window.boardApi.updater.onEvent('updater:checking', () => {
  updateStatusEl.textContent = 'Перевірка…';
});
window.boardApi.updater.onEvent('updater:none', () => {
  updateStatusEl.textContent = 'Встановлено останню версію';
});
window.boardApi.updater.onEvent('updater:available', () => {
  updateStatusEl.textContent = '';
});
window.boardApi.updater.onEvent('updater:error', () => {
  updateStatusEl.textContent = 'Не вдалося перевірити оновлення';
});

// --- хвилина мовчання (щодня о 9:00) ---
const silenceBanner = document.getElementById('silence-banner');

let silenceAlertCtx = null;
// Сигнал при появі попапу — синтезований, без зовнішнього аудіофайлу, як і
// клац секундної стрілки в самому таймері. 4 ноти й помітно вища гучність
// (0.6 замість 0.2), щоб точно було чутно в класі.
function playSilenceAlert() {
  try {
    silenceAlertCtx = silenceAlertCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (silenceAlertCtx.state === 'suspended') silenceAlertCtx.resume();
    const now = silenceAlertCtx.currentTime;
    [880, 1108, 880, 1108].forEach((freq, i) => {
      const osc = silenceAlertCtx.createOscillator();
      const gain = silenceAlertCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.6, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      osc.connect(gain);
      gain.connect(silenceAlertCtx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // Web Audio недоступний — тиша не критична.
  }
}

document.getElementById('silence-open').addEventListener('pointerdown', () => {
  silenceBanner.hidden = true;
  window.triggerMomentOfSilence();
});

document.getElementById('silence-dismiss').addEventListener('pointerdown', () => {
  silenceBanner.hidden = true;
  window.setWebViewVisible?.(true);
});

window.boardApi.momentOfSilence.onTrigger(() => {
  // Той самий бар'єр, що й для попапу налаштувань — WebContentsView відкритої
  // сторінки інакше сховав би цей банер під собою.
  window.setWebViewVisible?.(false);
  silenceBanner.hidden = false;
  playSilenceAlert();
});

// --- topbar clock ---
function tickClock() {
  topbarClock.textContent = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}
tickClock();
setInterval(tickClock, 1000);

// --- заряд акумулятора біля годинника ---
// У повноекранному режимі вчитель не бачить індикатор заряду Windows
// (панель задач схована), тож дублюємо його тут. Показуємо, лише якщо
// Battery Status API взагалі щось повернув — на десктопі без акумулятора
// цей блок просто ніколи не з'явиться.
const topbarBattery = document.getElementById('topbar-battery');
if (navigator.getBattery) {
  navigator
    .getBattery()
    .then((battery) => {
      function updateBattery() {
        const pct = Math.round(battery.level * 100);
        topbarBattery.textContent = `${battery.charging ? '⚡' : '🔋'} ${pct}%`;
        topbarBattery.hidden = false;
      }
      updateBattery();
      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingchange', updateBattery);
    })
    .catch(() => {
      // Battery Status API недоступний у цій збірці Electron — просто не показуємо блок.
    });
}

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

// --- розклад: сповіщення "до кінця уроку лишилось 10 хв" ---
// Перевіряється глобально (не лише коли відкрита вкладка "Розклад") — на
// самому уроці вчитель зазвичай дивиться в презентацію чи браузер, а не в
// таблицю розкладу, тож сповіщення має долетіти звідусіль.
const lessonBanner = document.getElementById('lesson-banner');
const lessonBannerText = document.getElementById('lesson-banner-text');
let lastNotifiedLessonKey = null;

function playLessonChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Web Audio недоступний — тиша не критична.
  }
}

async function checkLessonEndingSoon() {
  if (!window.computeScheduleStatus || !window.loadScheduleData) return;
  const { times, subjects } = await window.loadScheduleData();
  const status = window.computeScheduleStatus(times, subjects);
  if (!status.dayName || status.onBreak || status.periodIndex == null) return;
  if (status.remainingMinutes > 10 || status.remainingMinutes <= 0) return;

  const key = `${status.dayName}-${status.periodIndex}`;
  if (lastNotifiedLessonKey === key) return;
  lastNotifiedLessonKey = key;

  const text = `⏰ До кінця уроку «${status.subject || 'поточний урок'}» лишилось ${status.remainingMinutes} хв`;
  window.setWebViewVisible?.(false);
  lessonBannerText.textContent = text;
  lessonBanner.hidden = false;
  playLessonChime();

  if (window.Notification) {
    try {
      new Notification('Розклад уроків', { body: text });
    } catch {
      // Ігноруємо — банер у самому застосунку вже показано.
    }
  }
}

document.getElementById('lesson-banner-dismiss').addEventListener('pointerdown', () => {
  lessonBanner.hidden = true;
  window.setWebViewVisible?.(true);
});

setInterval(checkLessonEndingSoon, 30_000);
checkLessonEndingSoon();
