import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('toolbarApi', {
  setColor: (color: string) => ipcRenderer.send('overlay:set-color', color),
  setErasing: (erasing: boolean) => ipcRenderer.send('overlay:set-erasing', erasing),
  setWidth: (width: number) => ipcRenderer.send('overlay:set-width', width),
  requestClear: () => ipcRenderer.send('overlay:request-clear'),
  togglePassThrough: () => ipcRenderer.send('overlay:toggle-pass-through'),
  close: () => ipcRenderer.send('overlay:request-close'),
  onPassThroughChanged: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('overlay:pass-through-changed', (_event, enabled: boolean) => callback(enabled));
  },
});
