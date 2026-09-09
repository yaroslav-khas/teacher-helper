import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('boardApi', {
  window: {
    toggleFullscreen: () => ipcRenderer.invoke('shell:toggle-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('shell:is-fullscreen'),
  },
  overlay: {
    show: () => ipcRenderer.invoke('overlay:show'),
    hide: () => ipcRenderer.invoke('overlay:hide'),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },
  updater: {
    download: () => ipcRenderer.invoke('updater:download'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    onEvent: (channel: string, callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
});
