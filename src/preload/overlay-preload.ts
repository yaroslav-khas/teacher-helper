import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('overlayApi', {
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('overlay:set-ignore-mouse-events', ignore),
  onForceTogglePassThrough: (callback: () => void) => {
    ipcRenderer.on('overlay:force-toggle-pass-through', () => callback());
  },
  close: () => ipcRenderer.send('overlay:request-close'),
  onClear: (callback: () => void) => {
    ipcRenderer.on('overlay:clear', () => callback());
  },
});
