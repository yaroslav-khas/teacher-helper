import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import Store from 'electron-store';

const store = new Store();

interface Entry {
  name: string;
  isDirectory: boolean;
  fullPath: string;
}

interface FileFilter {
  name: string;
  extensions: string[];
}

function listFolder(folderPath: string): Entry[] {
  const items = fs.readdirSync(folderPath, { withFileTypes: true });
  const entries = items
    .filter((item) => !item.name.startsWith('.'))
    .map((item) => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      fullPath: path.join(folderPath, item.name),
    }));

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'uk');
  });

  return entries;
}

async function chooseRoot(win: BrowserWindow, storeKey: string, title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title,
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return (store.get(storeKey) as string | undefined) ?? null;
  }

  const chosen = result.filePaths[0];
  store.set(storeKey, chosen);
  return chosen;
}

async function addFile(win: BrowserWindow, targetFolder: string, filters: FileFilter[]): Promise<void> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Додати файл',
    properties: ['openFile', 'multiSelections'],
    filters: [...filters, { name: 'Усі файли', extensions: ['*'] }],
  });
  if (result.canceled) return;

  for (const src of result.filePaths) {
    const dest = path.join(targetFolder, path.basename(src));
    if (path.resolve(src) === path.resolve(dest)) continue;
    fs.copyFileSync(src, dest);
  }
}

// Один генератор IPC для декількох незалежних файлових бібліотек (Презентація,
// Зображення тощо) — кожна має власну збережену кореневу папку (storeKey) і
// власний список розширень для діалогу "Додати файл", решта поведінки спільна.
export function registerFileLibraryIpc(
  namespace: string,
  storeKey: string,
  chooseRootTitle: string,
  addFileFilters: FileFilter[],
  getShellWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(`${namespace}:get-root`, () => (store.get(storeKey) as string | undefined) ?? null);

  ipcMain.handle(`${namespace}:choose-root`, async () => {
    const win = getShellWindow();
    if (!win) return (store.get(storeKey) as string | undefined) ?? null;
    return chooseRoot(win, storeKey, chooseRootTitle);
  });

  ipcMain.handle(`${namespace}:list`, (_event, folderPath: string) => {
    try {
      return { ok: true, entries: listFolder(folderPath) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(`${namespace}:add-file`, async (_event, folderPath: string) => {
    const win = getShellWindow();
    if (!win) return { ok: false };
    await addFile(win, folderPath, addFileFilters);
    return { ok: true };
  });

  ipcMain.handle(`${namespace}:open-file`, (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  ipcMain.handle(`${namespace}:read-file-bytes`, (_event, filePath: string) => {
    return fs.readFileSync(filePath);
  });
}
