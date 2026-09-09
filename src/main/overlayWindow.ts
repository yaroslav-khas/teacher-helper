import { BrowserWindow, screen, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';

const CLICK_THROUGH_SHORTCUT = 'CommandOrControl+Alt+D';

let overlayWindow: BrowserWindow | null = null;

function forceTogglePassThrough(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay:force-toggle-pass-through');
}

export function showOverlayWindow(bounds: Electron.Rectangle): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds(bounds);
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.show();
    globalShortcut.register(CLICK_THROUGH_SHORTCUT, forceTogglePassThrough);
    return overlayWindow;
  }

  const { x, y, width, height } = bounds;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.loadFile(path.join(__dirname, '../../public/overlay/index.html'));

  overlayWindow.on('closed', () => {
    globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
    overlayWindow = null;
  });

  globalShortcut.register(CLICK_THROUGH_SHORTCUT, forceTogglePassThrough);

  return overlayWindow;
}

export function hideOverlayWindow(): void {
  globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
  overlayWindow?.hide();
}

export function isOverlayVisible(): boolean {
  return !!overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
}

export function toggleOverlayWindow(bounds: Electron.Rectangle): void {
  if (isOverlayVisible()) {
    hideOverlayWindow();
  } else {
    showOverlayWindow(bounds);
  }
}

export function registerOverlayIpc(getShellWindow: () => BrowserWindow | null): void {
  ipcMain.handle('overlay:show', () => {
    const shellWindow = getShellWindow();
    const display = shellWindow
      ? screen.getDisplayMatching(shellWindow.getBounds())
      : screen.getPrimaryDisplay();
    showOverlayWindow(display.bounds);
  });

  ipcMain.handle('overlay:hide', () => {
    hideOverlayWindow();
  });

  ipcMain.on('overlay:set-ignore-mouse-events', (_event, ignore: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('overlay:request-close', () => {
    hideOverlayWindow();
  });
}
