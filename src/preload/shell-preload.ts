import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('boardApi', {
  window: {
    toggleFullscreen: () => ipcRenderer.invoke('shell:toggle-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('shell:is-fullscreen'),
    minimize: () => ipcRenderer.invoke('shell:minimize'),
    quit: () => ipcRenderer.invoke('shell:quit'),
    getAutoLaunch: () => ipcRenderer.invoke('shell:get-auto-launch'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('shell:set-auto-launch', enabled),
    getVersion: () => ipcRenderer.invoke('shell:get-version'),
  },
  logs: {
    openWindow: () => ipcRenderer.invoke('logs:open-window'),
  },
  overlay: {
    show: () => ipcRenderer.invoke('overlay:show'),
    hide: () => ipcRenderer.invoke('overlay:hide'),
    toggle: () => ipcRenderer.invoke('overlay:toggle'),
  },
  web: {
    show: (bounds: Electron.Rectangle, url?: string) => ipcRenderer.send('web:show', bounds, url),
    hide: () => ipcRenderer.send('web:hide'),
    hideForPopup: () => ipcRenderer.send('web:hide-for-popup'),
    setBounds: (bounds: Electron.Rectangle) => ipcRenderer.send('web:set-bounds', bounds),
    navigate: (url: string) => ipcRenderer.send('web:navigate', url),
    back: () => ipcRenderer.send('web:back'),
    forward: () => ipcRenderer.send('web:forward'),
    reload: () => ipcRenderer.send('web:reload'),
    newTab: (url?: string) => ipcRenderer.send('web:new-tab', url),
    switchTab: (id: string) => ipcRenderer.send('web:switch-tab', id),
    closeTab: (id: string) => ipcRenderer.send('web:close-tab', id),
    onTabsChanged: (callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on('web:tabs-changed', listener);
      return () => ipcRenderer.removeListener('web:tabs-changed', listener);
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
  },
  image: {
    getRoot: () => ipcRenderer.invoke('image:get-root'),
    chooseRoot: () => ipcRenderer.invoke('image:choose-root'),
    list: (folderPath: string) => ipcRenderer.invoke('image:list', folderPath),
    addFile: (folderPath: string) => ipcRenderer.invoke('image:add-file', folderPath),
    openFile: (filePath: string) => ipcRenderer.invoke('image:open-file', filePath),
    readFileBytes: (filePath: string) => ipcRenderer.invoke('image:read-file-bytes', filePath),
  },
  media: {
    getRoot: () => ipcRenderer.invoke('media:get-root'),
    chooseRoot: () => ipcRenderer.invoke('media:choose-root'),
    list: (folderPath: string) => ipcRenderer.invoke('media:list', folderPath),
    addFile: (folderPath: string) => ipcRenderer.invoke('media:add-file', folderPath),
    openFile: (filePath: string) => ipcRenderer.invoke('media:open-file', filePath),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },
  anthem: {
    chooseFile: () => ipcRenderer.invoke('anthem:choose-file'),
  },
  momentOfSilence: {
    onTrigger: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('moment-of-silence:trigger', listener);
      return () => ipcRenderer.removeListener('moment-of-silence:trigger', listener);
    },
    simulate: () => ipcRenderer.invoke('moment-of-silence:simulate'),
  },
  updater: {
    download: () => ipcRenderer.invoke('updater:download'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    checkNow: () => ipcRenderer.invoke('updater:check-now'),
    onEvent: (channel: string, callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
});
