import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { registerStoreIpc } from './store';
import { registerOverlayIpc, toggleOverlayWindow } from './overlayWindow';
import { createLauncherWindow, closeLauncherWindow, registerLauncherIpc, getDisplayBoundsUnderCursor } from './launcherWindow';
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

  shellWindow.on('closed', () => {
    shellWindow = null;
    closeLauncherWindow();
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
  createShellWindow();
  createLauncherWindow();

  globalShortcut.register(TOGGLE_OVERLAY_SHORTCUT, () => {
    toggleOverlayWindow(getDisplayBoundsUnderCursor());
  });

  if (shellWindow) {
    configureUpdater(shellWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createShellWindow();
      createLauncherWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
