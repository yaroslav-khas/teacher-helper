import { BrowserWindow } from 'electron';
import * as path from 'path';

let splashWindow: BrowserWindow | null = null;

// Показується миттєво при старті, поки готується головне вікно (парсинг
// бандлу, читання налаштувань тощо). Без цього перші секунди після кліку по
// ярлику застосунок ніяк не сигналізує, що взагалі запускається — а це й
// провокує повторний клік та другий інстанс паралельно.
export function showSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    show: true,
    backgroundColor: '#1d2026',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splashWindow.loadFile(path.join(__dirname, '../../public/splash/index.html'));
}

export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}
