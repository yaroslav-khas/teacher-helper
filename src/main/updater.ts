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
  // Ручна кнопка "Перевірити оновлення" в налаштуваннях. Лишаємо доступною
  // і для portable — спроба там просто чесно поверне помилку (немає
  // app-update.yml), і рендерер покаже відповідне повідомлення, замість
  // того щоб кнопка мовчки нічого не робила.
  ipcMain.handle('updater:check-now', () => autoUpdater.checkForUpdates());

  // electron-builder генерує app-update.yml (звідки electron-updater бере
  // адресу перевірки) лише для NSIS-цілі — портативний .exe його не має
  // взагалі, тож автоматична перевірка при старті для нього завжди мовчки
  // провалиться. Це не виправна помилка з нашого боку, а свідомий вибір
  // архітектури electron-builder: у portable немає ні фіксованого місця
  // встановлення, ні реєстру, куди можна було б поставити оновлення.
  if (!process.env.PORTABLE_EXECUTABLE_DIR) {
    autoUpdater.checkForUpdates().catch(() => undefined);
  }
}
