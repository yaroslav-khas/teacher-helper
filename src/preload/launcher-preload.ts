import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('launcherApi', {
  getPosition: () => ipcRenderer.invoke('launcher:get-position'),
  moveTo: (x: number, y: number) => ipcRenderer.send('launcher:move-to', x, y),
  moveEnd: (x: number, y: number) => ipcRenderer.send('launcher:move-end', x, y),
  toggleOverlay: () => ipcRenderer.send('launcher:toggle-overlay'),
});
