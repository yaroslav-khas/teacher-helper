import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('logsApi', {
  read: () => ipcRenderer.invoke('logs:read'),
  getPath: () => ipcRenderer.invoke('logs:get-path'),
});
