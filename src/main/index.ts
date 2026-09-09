import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { registerStoreIpc } from './store';
import { registerOverlayIpc, toggleOverlayWindow, destroyOverlayWindow } from './overlayWindow';
import { createLauncherWindow, closeLauncherWindow, registerLauncherIpc, getDisplayBoundsUnderCursor } from './launcherWindow';
import { registerWebViewIpc } from './webViewManager';
import { registerPresentationIpc } from './presentationLibrary';
import { configureUpdater } from './updater';

const TOGGLE_OVERLAY_SHORTCUT = 'CommandOrControl+Alt+M';

let shellWindow: BrowserWindow | null = null;

function createShellWindow(): void {
  shellWindow = new BrowserWindow({
    width: 960,
    height: 720,
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

  shellWindow.on('closed', () => {
    shellWindow = null;
    closeLauncherWindow();
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
}

app.whenReady().then(() => {
  registerStoreIpc();
  registerShellIpc();
  registerOverlayIpc(() => shellWindow);
  registerLauncherIpc();
  registerWebViewIpc(() => shellWindow);
  registerPresentationIpc(() => shellWindow);
  createShellWindow();
  createLauncherWindow();

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
