import { BrowserWindow, screen, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';

const CLICK_THROUGH_SHORTCUT = 'CommandOrControl+Alt+D';

let overlayWindow: BrowserWindow | null = null;

function forceTogglePassThrough(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay:force-toggle-pass-through');
}

// На Windows реєстрація хіт-тесту для прозорого always-on-top вікна іноді не
// "заводиться" сама після setIgnoreMouseEvents(false) — вікно видиме, але
// геть не отримує вхід (миша/тач проходить крізь нього), хоча на macOS той
// самий код працює одразу. Примусове true->false і .focus() — задокументований
// у спільноті Electron обхід саме цього: він ніби "штовхає" вікно перереєструвати
// себе як таке, що приймає вхід.
function kickHitTesting(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(true);
  win.setIgnoreMouseEvents(false);
  win.focus();
}

export function showOverlayWindow(bounds: Electron.Rectangle): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds(bounds);
    // Перевстановлюємо щоразу перед показом, а не лише один раз при
    // створенні: після виходу з fullscreen і повторного входу macOS "забуває"
    // приналежність вікна до Space, і показ без цього спричиняє стрибок
    // екрана на інший Space замість тихого показу поверх поточного.
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.show();
    kickHitTesting(overlayWindow);
    globalShortcut.register(CLICK_THROUGH_SHORTCUT, forceTogglePassThrough);
    return overlayWindow;
  }

  const { x, y, width, height } = bounds;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, '../../public/overlay/index.html'));

  overlayWindow.once('ready-to-show', () => {
    if (overlayWindow) kickHitTesting(overlayWindow);
  });

  overlayWindow.on('closed', () => {
    globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
    overlayWindow = null;
  });

  globalShortcut.register(CLICK_THROUGH_SHORTCUT, forceTogglePassThrough);

  return overlayWindow;
}

export function hideOverlayWindow(): void {
  globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
  // Малюнок стирається щоразу, як оверлей ховається — інакше стара анотація
  // з попереднього контексту (наприклад, з презентації) несподівано випливає
  // поверх зовсім іншої програми наступного разу, коли оверлей знову покажуть.
  overlayWindow?.webContents.send('overlay:clear');
  overlayWindow?.hide();
}

// hide() лишає вікно живим (Electron і далі рахує його "відкритим"), тож при
// повному завершенні застосунку його треба саме закрити, а не сховати.
export function destroyOverlayWindow(): void {
  globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
  overlayWindow = null;
}

// На macOS вхід іншого вікна (нашого ж shellWindow) у справжній fullscreen
// створює окремий Space, і always-on-top вікна (включно з цим оверлеєм)
// іноді "губляться", доки їхні прапорці не переустановити вже ПІСЛЯ
// переходу. Викликати з shellWindow 'enter-full-screen'.
export function reassertOverlayVisibility(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Вікно оверлею не знищується при "схованні" (лишається живим для швидкого
  // повторного показу), тому без цієї перевірки переустановка прапорців
  // випадково повертала на екран оверлей, який мав лишатись прихованим.
  if (!overlayWindow.isVisible()) return;
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.moveTop();
}

export function getDisplayBoundsUnderCursor(): Electron.Rectangle {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
}

export function isOverlayVisible(): boolean {
  return !!overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
}

export function toggleOverlayWindow(bounds: Electron.Rectangle): void {
  if (isOverlayVisible()) {
    hideOverlayWindow();
  } else {
    showOverlayWindow(bounds);
  }
}

export function registerOverlayIpc(getShellWindow: () => BrowserWindow | null): void {
  const shellDisplayBounds = (): Electron.Rectangle => {
    const shellWindow = getShellWindow();
    const display = shellWindow
      ? screen.getDisplayMatching(shellWindow.getBounds())
      : screen.getPrimaryDisplay();
    return display.bounds;
  };

  ipcMain.handle('overlay:show', () => {
    showOverlayWindow(shellDisplayBounds());
  });

  ipcMain.handle('overlay:hide', () => {
    hideOverlayWindow();
  });

  ipcMain.handle('overlay:toggle', () => {
    toggleOverlayWindow(shellDisplayBounds());
  });

  ipcMain.on('overlay:set-ignore-mouse-events', (_event, ignore: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('overlay:request-close', () => {
    hideOverlayWindow();
  });
}
