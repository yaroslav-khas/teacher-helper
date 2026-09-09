import { BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { toggleOverlayWindow } from './overlayWindow';

const LAUNCHER_SIZE = 64;
const store = new Store();

let launcherWindow: BrowserWindow | null = null;

function getDisplayBoundsUnderCursor(): Electron.Rectangle {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
}

function defaultPosition(): { x: number; y: number } {
  // Середина правого краю — подалі від Dock (низ) і меню (верх), де малий
  // always-on-top віджет легко губиться чи перекривається системним UI.
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  return { x: x + width - LAUNCHER_SIZE - 16, y: y + Math.round(height / 2 - LAUNCHER_SIZE / 2) };
}

export function createLauncherWindow(): BrowserWindow {
  const saved = store.get('launcher:pos') as { x: number; y: number } | undefined;
  const pos = saved ?? defaultPosition();

  launcherWindow = new BrowserWindow({
    width: LAUNCHER_SIZE,
    height: LAUNCHER_SIZE,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/launcher-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  launcherWindow.setAlwaysOnTop(true, 'screen-saver');
  launcherWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  launcherWindow.loadFile(path.join(__dirname, '../../public/launcher/index.html'));

  launcherWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log('[launcher] did-fail-load', code, desc);
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });

  return launcherWindow;
}

export function closeLauncherWindow(): void {
  launcherWindow?.close();
}

export function registerLauncherIpc(): void {
  ipcMain.handle('launcher:get-position', () => launcherWindow?.getPosition() ?? [0, 0]);

  ipcMain.on('launcher:move-to', (_event, x: number, y: number) => {
    launcherWindow?.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.on('launcher:move-end', (_event, x: number, y: number) => {
    store.set('launcher:pos', { x: Math.round(x), y: Math.round(y) });
  });

  ipcMain.on('launcher:toggle-overlay', () => {
    toggleOverlayWindow(getDisplayBoundsUnderCursor());
  });
}

export { getDisplayBoundsUnderCursor };
