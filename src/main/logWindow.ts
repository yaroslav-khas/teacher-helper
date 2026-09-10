import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

let logWindow: BrowserWindow | null = null;

// Звичайне (не always-on-top) утилітарне вікно — вчитель відкриває його
// свідомо через налаштування, коли треба скопіювати лог для звіту про баг.
export function showLogWindow(): void {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.show();
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 760,
    height: 520,
    title: 'Логи',
    backgroundColor: '#14161a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/log-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  logWindow.setMenuBarVisibility(false);
  logWindow.loadFile(path.join(__dirname, '../../public/logs/index.html'));
  logWindow.on('closed', () => {
    logWindow = null;
  });
}

export function registerLogWindowIpc(): void {
  ipcMain.handle('logs:open-window', () => showLogWindow());
}
