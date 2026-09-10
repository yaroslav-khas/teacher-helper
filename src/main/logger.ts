import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2 МБ — за навчальний рік цього з запасом вистачає

let logFilePath: string | null = null;

function ensureLogFile(): string {
  if (logFilePath) return logFilePath;
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  logFilePath = path.join(dir, 'app.log');
  return logFilePath;
}

// Проста ротація без зовнішніх залежностей: якщо файл переріс ліміт,
// лишаємо тільки другу половину — новіші записи важливіші за архів.
function rotateIfNeeded(filePath: string): void {
  try {
    const { size } = fs.statSync(filePath);
    if (size <= MAX_LOG_BYTES) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const trimmed = content.slice(Math.floor(content.length / 2));
    const fromNextLine = trimmed.indexOf('\n');
    fs.writeFileSync(filePath, `[...обрізано...]\n${fromNextLine >= 0 ? trimmed.slice(fromNextLine + 1) : trimmed}`);
  } catch {
    // Файлу ще нема або читання не вдалось — просто продовжуємо писати.
  }
}

export function logLine(level: string, message: string): void {
  try {
    const filePath = ensureLogFile();
    rotateIfNeeded(filePath);
    const timestamp = new Date().toISOString();
    fs.appendFileSync(filePath, `[${timestamp}] [${level}] ${message}\n`);
  } catch {
    // Диск недоступний/переповнений — логування не має ламати сам застосунок.
  }
}

// Ловимо те, що інакше побачили б лише як мовчазний крах застосунку: непіймані
// винятки й відхилені проміси в головному процесі, а також "зникнення"
// рендер-процесів (вбудований браузер/вікно застосунку впали без пояснення).
export function initLogger(): void {
  ensureLogFile();
  logLine('INFO', `Застосунок запущено. Версія ${app.getVersion()}, платформа ${process.platform}`);

  process.on('uncaughtException', (err) => {
    logLine('ERROR', `Uncaught exception: ${err?.stack || err}`);
  });
  process.on('unhandledRejection', (reason) => {
    logLine('ERROR', `Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
  });
  app.on('render-process-gone', (_event, webContents, details) => {
    logLine('ERROR', `render-process-gone: reason=${details.reason} url=${webContents.getURL()}`);
  });
  app.on('child-process-gone', (_event, details) => {
    logLine('ERROR', `child-process-gone: type=${details.type} reason=${details.reason}`);
  });
}

export function registerLoggerIpc(): void {
  ipcMain.handle('logs:read', () => {
    try {
      return fs.readFileSync(ensureLogFile(), 'utf8');
    } catch (err) {
      return `Не вдалося прочитати лог-файл: ${(err as Error).message}`;
    }
  });

  ipcMain.handle('logs:get-path', () => ensureLogFile());
}
