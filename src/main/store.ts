import Store from 'electron-store';
import { ipcMain } from 'electron';

const store = new Store();

export function registerStoreIpc(): void {
  ipcMain.handle('store:get', (_event, key: string) => store.get(key));
  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    store.set(key, value);
  });
}
