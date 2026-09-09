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
  web: {
    show: (bounds: Electron.Rectangle, url?: string) => ipcRenderer.send('web:show', bounds, url),
    hide: () => ipcRenderer.send('web:hide'),
    setBounds: (bounds: Electron.Rectangle) => ipcRenderer.send('web:set-bounds', bounds),
    navigate: (url: string) => ipcRenderer.send('web:navigate', url),
    back: () => ipcRenderer.send('web:back'),
    forward: () => ipcRenderer.send('web:forward'),
    reload: () => ipcRenderer.send('web:reload'),
    onState: (callback: (state: unknown) => void) => {
      const listener = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on('web:state', listener);
      return () => ipcRenderer.removeListener('web:state', listener);
    },
    onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
      const listener = (_event: unknown, isFullscreen: boolean) => callback(isFullscreen);
      ipcRenderer.on('web:fullscreen-change', listener);
      return () => ipcRenderer.removeListener('web:fullscreen-change', listener);
    },
  },
  presentation: {
    getRoot: () => ipcRenderer.invoke('presentation:get-root'),
    chooseRoot: () => ipcRenderer.invoke('presentation:choose-root'),
    list: (folderPath: string) => ipcRenderer.invoke('presentation:list', folderPath),
    addFile: (folderPath: string) => ipcRenderer.invoke('presentation:add-file', folderPath),
    openFile: (filePath: string) => ipcRenderer.invoke('presentation:open-file', filePath),
    openAsPdf: (filePath: string) => ipcRenderer.invoke('presentation:open-as-pdf', filePath),
    readPdfBytes: (pdfPath: string) => ipcRenderer.invoke('presentation:read-pdf-bytes', pdfPath),
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
