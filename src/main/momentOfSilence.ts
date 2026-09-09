import { BrowserWindow, Notification, ipcMain } from 'electron';

const TARGET_HOUR = 9;
const TARGET_MINUTE = 0;
const CHECK_INTERVAL_MS = 20_000;

let lastTriggeredDateKey: string | null = null;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function notifyRenderer(shellWindow: BrowserWindow | null): void {
  if (!shellWindow || shellWindow.isDestroyed()) return;
  shellWindow.webContents.send('moment-of-silence:trigger');
}

function fireMomentOfSilence(shellWindow: BrowserWindow | null): void {
  notifyRenderer(shellWindow);

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Хвилина мовчання',
      body: 'Розпочалася щоденна хвилина мовчання. Відкрити таймер?',
    });
    notification.on('click', () => {
      if (shellWindow && !shellWindow.isDestroyed()) {
        if (shellWindow.isMinimized()) shellWindow.restore();
        shellWindow.show();
        shellWindow.focus();
      }
      notifyRenderer(shellWindow);
    });
    notification.show();
  }
}

// Щодня о 9:00 в Україні звучить хвилина мовчання. Перевіряємо раз на
// CHECK_INTERVAL_MS (замість рівно раз на хвилину) — цього достатньо, щоб
// не пропустити 60-секундне вікно, і не тримати окремий точний таймер.
export function startMomentOfSilenceScheduler(getShellWindow: () => BrowserWindow | null): void {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() !== TARGET_HOUR || now.getMinutes() !== TARGET_MINUTE) return;

    const key = dateKey(now);
    if (key === lastTriggeredDateKey) return;
    lastTriggeredDateKey = key;

    fireMomentOfSilence(getShellWindow());
  }, CHECK_INTERVAL_MS);
}

// Тестова кнопка в налаштуваннях імітує саме реальний сценарій 9:00
// (сповіщення + банер), а не пряме відкриття таймера — щоб перевіряти весь
// шлях, не чекаючи ранку.
export function registerMomentOfSilenceTestIpc(getShellWindow: () => BrowserWindow | null): void {
  ipcMain.handle('moment-of-silence:simulate', () => {
    fireMomentOfSilence(getShellWindow());
  });
}
