import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';

export function configureUpdater(shellWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false;

  const send = (channel: string, payload?: unknown) => {
    if (!shellWindow.isDestroyed()) {
      shellWindow.webContents.send(channel, payload);
    }
  };

  autoUpdater.on('checking-for-update', () => send('updater:checking'));
  autoUpdater.on('update-available', (info) => send('updater:available', info));
  autoUpdater.on('update-not-available', () => send('updater:none'));
  autoUpdater.on('download-progress', (progress) => send('updater:progress', progress));
  autoUpdater.on('update-downloaded', (info) => send('updater:downloaded', info));
  autoUpdater.on('error', (err) => send('updater:error', String(err)));

  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:quit-and-install', () => autoUpdater.quitAndInstall());

  // У розробці немає app-update.yml і немає налаштованого репозиторію —
  // помилку тут очікувано ігноруємо, поки не буде реального GitHub-релізу.
  autoUpdater.checkForUpdates().catch(() => undefined);
}
