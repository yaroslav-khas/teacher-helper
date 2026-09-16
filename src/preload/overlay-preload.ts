import { contextBridge, ipcRenderer } from 'electron';

// Полотно більше не приймає команд напряму від користувача (кнопки живуть в
// окремому toolbarWindow) — лише слухає, що main переслав від панелі.
contextBridge.exposeInMainWorld('overlayApi', {
  onClear: (callback: () => void) => {
    ipcRenderer.on('overlay:clear', () => callback());
  },
  onSetColor: (callback: (color: string) => void) => {
    ipcRenderer.on('overlay:set-color', (_event, color: string) => callback(color));
  },
  onSetErasing: (callback: (erasing: boolean) => void) => {
    ipcRenderer.on('overlay:set-erasing', (_event, erasing: boolean) => callback(erasing));
  },
  onSetWidth: (callback: (width: number) => void) => {
    ipcRenderer.on('overlay:set-width', (_event, width: number) => callback(width));
  },
  onPassThroughChanged: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('overlay:pass-through-changed', (_event, enabled: boolean) => callback(enabled));
  },
});
