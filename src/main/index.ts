import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { registerStoreIpc, getStoreValue } from './store';
import {
  registerOverlayIpc,
  toggleOverlayWindow,
  destroyOverlayWindow,
  hideOverlayWindow,
  getDisplayBoundsUnderCursor,
  reassertOverlayVisibility,
  getShellDisplayBounds,
} from './overlayWindow';
import { registerWebViewIpc } from './webViewManager';
import { registerFileLibraryIpc } from './fileLibrary';
import { configureUpdater } from './updater';
import { startMomentOfSilenceScheduler, registerMomentOfSilenceTestIpc } from './momentOfSilence';
import { showSplashWindow, closeSplashWindow } from './splashWindow';
import { initLogger, registerLoggerIpc, logLine } from './logger';
import { registerLogWindowIpc } from './logWindow';

// На класних ПК дошка часто працює через дубльований/клонований дисплей
// (проектор). Апаратне відеодекодування Chromium на клонованому виведенні
// нерідко рендериться білим/чорним екраном — GPU-оверлей відео не завжди
// коректно копіюється на другий вихід. Програмний рендер вирішує це ціною
// трохи вищого навантаження на CPU під час відтворення відео.
app.disableHardwareAcceleration();

// Забороняємо другий інстанс: якщо вчитель, не дочекавшись запуску,
// клацає по ярлику ще раз — без цього одночасно піднімалось два повністю
// незалежних процеси, що боролись за той самий файл налаштувань і за
// одні й ті ж вікна/дисплеї (звідси "теки збиваються", зависання кліків,
// дублікати вікон з білим екраном відео).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const TOGGLE_OVERLAY_SHORTCUT = 'CommandOrControl+Alt+M';

let shellWindow: BrowserWindow | null = null;

const ALWAYS_FULLSCREEN_KEY = 'settings:always-fullscreen';

function createShellWindow(): void {
  const alwaysFullscreen = getStoreValue<boolean>(ALWAYS_FULLSCREEN_KEY) ?? false;

  shellWindow = new BrowserWindow({
    width: 960,
    height: 720,
    fullscreen: alwaysFullscreen,
    frame: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shellWindow.loadFile(path.join(__dirname, '../../public/shell/index.html'));

  // Сплеш ховаємо лише тепер, коли головне вікно реально готове показатись —
  // без розриву між "сплеш зник" і "з'явився контент" (порожній білий кадр).
  shellWindow.once('ready-to-show', () => {
    closeSplashWindow();
    shellWindow?.show();
  });

  shellWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('[shell renderer]', level, message, `(${sourceId}:${line})`);
    // Рівень 2+ у цьому API — вже warning/error, найцінніше для діагностики
    // "щось зламалось на Windows" без доступу до девтулзів вчителя.
    if (level >= 2) {
      logLine('RENDERER', `${message} (${sourceId}:${line})`);
    }
  });

  // На Windows межі дисплея, які повертає Electron, можуть відрізнятись
  // до/після переходу застосунку в фулскрін (напр. через приховування
  // панелі задач) — оверлей, показаний ДО переходу, лишався б із межами
  // "вузького" довфулскрінного вікна: кнопки панелі малювання виглядали б
  // на своєму місці, але фактичний хіт-тест був би зсунутий. Особливо
  // помітно на тачскріні, де дотик жорсткіше мапиться на абсолютні
  // координати екрана, ніж курсор миші.
  const refreshOverlayBounds = () => reassertOverlayVisibility(getShellDisplayBounds(shellWindow));
  shellWindow.on('enter-full-screen', refreshOverlayBounds);
  shellWindow.on('leave-full-screen', refreshOverlayBounds);

  shellWindow.on('closed', () => {
    shellWindow = null;
    destroyOverlayWindow();
    app.quit();
  });
}

function registerShellIpc(): void {
  function isShellFullscreen(): boolean {
    if (!shellWindow) return false;
    return shellWindow.isFullScreen() || shellWindow.isSimpleFullScreen();
  }

  function setShellFullscreen(value: boolean): void {
    if (!shellWindow) return;

    if (process.platform !== 'darwin') {
      shellWindow.setFullScreen(value);
      return;
    }

    if (!value) {
      // Вихід — тим самим API, яким реально зайшли в fullscreen.
      if (shellWindow.isSimpleFullScreen()) shellWindow.setSimpleFullScreen(false);
      if (shellWindow.isFullScreen()) shellWindow.setFullScreen(false);
      return;
    }

    // Спершу пробуємо звичайний нативний setFullScreen() — плавніший, без
    // ривків при ресайзі вбудованого браузера. Але в деяких оточеннях
    // (віддалені/екран-шерені macOS-сесії без повної підтримки Mission
    // Control) ця OS-транзиція в окремий Space мовчки не відбувається:
    // isFullScreen() назавжди лишається false, а кнопка виглядає "мертвою".
    // Якщо за 400мс переходу не сталось — автоматичний відкат на
    // setSimpleFullScreen(), який розтягує вікно на весь екран без Space і
    // працює надійно завжди, хай і з невеликим візуальним ривком.
    shellWindow.setFullScreen(true);
    const win = shellWindow;
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isFullScreen() && !win.isSimpleFullScreen()) {
        win.setSimpleFullScreen(true);
      }
    }, 400);
  }

  ipcMain.handle('shell:toggle-fullscreen', () => {
    if (!shellWindow) return false;
    const next = !isShellFullscreen();
    setShellFullscreen(next);
    return next;
  });

  ipcMain.handle('shell:is-fullscreen', () => isShellFullscreen());

  ipcMain.handle('shell:minimize', () => {
    if (!shellWindow) return;
    try {
      // На Windows minimize() ігнорується, поки вікно в режимі setFullScreen —
      // спершу треба вийти з фулскріну, і лише тоді згортати.
      if (isShellFullscreen()) {
        setShellFullscreen(false);
      }
      // Оверлей — окреме always-on-top вікно; саме лише згортання "Дошки"
      // його не торкається, і він лишився б висіти зверху екрана, створюючи
      // враження, що кнопка взагалі нічого не зробила.
      hideOverlayWindow();
      shellWindow.minimize();
    } catch (err) {
      // Тимчасова діагностика: якщо тут щось падає на Windows — побачимо це
      // прямо у нативному вікні, без потреби в консолі/девтулзах.
      dialog.showErrorBox('Помилка "Згорнути"', String(err));
      logLine('ERROR', `shell:minimize failed: ${err}`);
    }
  });

  ipcMain.handle('shell:quit', () => {
    // Той самий шлях, що й закриття вікна хрестиком — уже коректно чистить
    // оверлей і завершує весь процес (обробник 'closed' нижче).
    shellWindow?.close();
  });

  ipcMain.handle('shell:get-version', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));

  ipcMain.handle('shell:get-auto-launch', () => app.getLoginItemSettings().openAtLogin);

  ipcMain.handle('shell:set-auto-launch', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
  });

  ipcMain.handle('anthem:choose-file', async () => {
    if (!shellWindow) return null;
    const result = await dialog.showOpenDialog(shellWindow, {
      title: 'Обрати відео гімну України',
      properties: ['openFile'],
      filters: [{ name: 'Відео', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

if (gotSingleInstanceLock) {
  // Спроба другого запуску (подвійний клік по ярлику) — просто повертаємо
  // фокус на вже відкрите вікно замість запуску ще одного процесу.
  app.on('second-instance', () => {
    if (!shellWindow) return;
    if (shellWindow.isMinimized()) shellWindow.restore();
    shellWindow.show();
    shellWindow.focus();
  });

  app.whenReady().then(() => {
    initLogger();
    registerLoggerIpc();
    registerLogWindowIpc();
    showSplashWindow();
    registerStoreIpc();
    registerShellIpc();
    registerOverlayIpc(() => shellWindow);
    registerWebViewIpc(() => shellWindow);
    registerFileLibraryIpc(
      'presentation',
      'presentation:root',
      'Обрати папку з презентаціями',
      [{ name: 'Презентації', extensions: ['pptx', 'ppt', 'ppsx', 'pps', 'odp', 'key'] }],
      () => shellWindow,
    );
    registerFileLibraryIpc(
      'image',
      'image:root',
      'Обрати папку із зображеннями й підручниками',
      [{ name: 'Зображення та PDF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'] }],
      () => shellWindow,
    );
    registerFileLibraryIpc(
      'media',
      'media:root',
      'Обрати папку з відео',
      [{ name: 'Відео', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
      () => shellWindow,
    );
    createShellWindow();
    startMomentOfSilenceScheduler(() => shellWindow);
    registerMomentOfSilenceTestIpc(() => shellWindow);

    globalShortcut.register(TOGGLE_OVERLAY_SHORTCUT, () => {
      toggleOverlayWindow(getDisplayBoundsUnderCursor());
    });

    if (shellWindow) {
      configureUpdater(shellWindow);
    }
  });

  app.on('window-all-closed', () => {
    // Не тримаємо процес у фоні після закриття (без macOS-конвенції
    // "додаток лишається в доку") — це вчительський інструмент, закриття
    // головного вікна має завершувати все, включно з плаваючою кнопкою.
    app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
