import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import Store from 'electron-store';
import { convertToPdf } from './pptxConverter';

const store = new Store();

interface Entry {
  name: string;
  isDirectory: boolean;
  fullPath: string;
}

function getRoot(): string | null {
  return (store.get('presentation:root') as string | undefined) ?? null;
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

async function chooseRoot(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Обрати папку з презентаціями',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return getRoot();

  const chosen = result.filePaths[0];
  store.set('presentation:root', chosen);
  return chosen;
}

async function addFile(win: BrowserWindow, targetFolder: string): Promise<void> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Додати файл',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Презентації та документи', extensions: ['pptx', 'ppt', 'pdf', 'key', 'odp'] },
      { name: 'Усі файли', extensions: ['*'] },
    ],
  });
  if (result.canceled) return;

  for (const src of result.filePaths) {
    const dest = path.join(targetFolder, path.basename(src));
    if (path.resolve(src) === path.resolve(dest)) continue;
    fs.copyFileSync(src, dest);
  }
}

export function registerPresentationIpc(getShellWindow: () => BrowserWindow | null): void {
  ipcMain.handle('presentation:get-root', () => getRoot());

  ipcMain.handle('presentation:choose-root', async () => {
    const win = getShellWindow();
    if (!win) return getRoot();
    return chooseRoot(win);
  });

  ipcMain.handle('presentation:list', (_event, folderPath: string) => {
    try {
      return { ok: true, entries: listFolder(folderPath) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('presentation:add-file', async (_event, folderPath: string) => {
    const win = getShellWindow();
    if (!win) return { ok: false };
    await addFile(win, folderPath);
    return { ok: true };
  });

  ipcMain.handle('presentation:open-file', (_event, filePath: string) => {
    shell.openPath(filePath);
  });

  ipcMain.handle('presentation:open-as-pdf', async (_event, filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      return { ok: true, pdfPath: filePath };
    }
    if (ext === '.pptx' || ext === '.ppt') {
      return convertToPdf(filePath);
    }
    return { ok: false, error: 'Цей тип файлу не показуємо як PDF' };
  });

  ipcMain.handle('presentation:read-pdf-bytes', (_event, pdfPath: string) => {
    return fs.readFileSync(pdfPath);
  });
}
