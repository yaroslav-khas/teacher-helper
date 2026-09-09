import Store from 'electron-store';
import { ipcMain } from 'electron';

const store = new Store();

export function registerStoreIpc(): void {
  ipcMain.handle('store:get', (_event, key: string) => store.get(key));
  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    store.set(key, value);
  });
}

// Пряме читання зі сховища в main-процесі (наприклад, "завжди на весь екран"
// треба знати ще до створення вікна, до будь-якого IPC з рендерером).
export function getStoreValue<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}
