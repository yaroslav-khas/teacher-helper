import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { registerStoreIpc, getStoreValue } from './store';
import {
  registerOverlayIpc,
  toggleOverlayWindow,
  destroyOverlayWindow,
  getDisplayBoundsUnderCursor,
  reassertOverlayVisibility,
} from './overlayWindow';
import { registerWebViewIpc } from './webViewManager';
import { registerFileLibraryIpc } from './fileLibrary';
import { configureUpdater } from './updater';

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
    webPreferences: {
      preload: path.join(__dirname, '../preload/shell-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shellWindow.loadFile(path.join(__dirname, '../../public/shell/index.html'));

  shellWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('[shell renderer]', level, message, `(${sourceId}:${line})`);
  });

  shellWindow.on('enter-full-screen', () => {
    reassertOverlayVisibility();
  });

  shellWindow.on('closed', () => {
    shellWindow = null;
    destroyOverlayWindow();
    app.quit();
  });
}

function registerShellIpc(): void {
  ipcMain.handle('shell:toggle-fullscreen', () => {
    if (!shellWindow) return false;
    const next = !shellWindow.isFullScreen();
    shellWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('shell:is-fullscreen', () => shellWindow?.isFullScreen() ?? false);

  ipcMain.handle('shell:minimize', () => {
    shellWindow?.minimize();
  });

  ipcMain.handle('shell:quit', () => {
    // Той самий шлях, що й закриття вікна хрестиком — уже коректно чистить
    // оверлей і завершує весь процес (обробник 'closed' нижче).
    shellWindow?.close();
  });

  ipcMain.handle('shell:get-auto-launch', () => app.getLoginItemSettings().openAtLogin);

  ipcMain.handle('shell:set-auto-launch', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
  });
}

app.whenReady().then(() => {
  registerStoreIpc();
  registerShellIpc();
  registerOverlayIpc(() => shellWindow);
  registerWebViewIpc(() => shellWindow);
  registerFileLibraryIpc(
    'presentation',
    'presentation:root',
    'Обрати папку з презентаціями',
    [{ name: 'Презентації', extensions: ['pptx', 'ppt'] }],
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
