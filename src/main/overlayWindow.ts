import { BrowserWindow, screen, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import { logLine } from './logger';

const CLICK_THROUGH_SHORTCUT = 'CommandOrControl+Alt+D';

// =====================================================================
// Оверлей малювання складається з ДВОХ окремих вікон:
//  - canvasWindow — прозоре, на весь дисплей, тільки полотно для штрихів.
//  - toolbarWindow — маленьке НЕПРОЗОРЕ плаваюче вікно з кнопками.
//
// Раніше і полотно, і панель кнопок жили в одному прозорому вікні. Але
// прозорі (transparent:true) always-on-top вікна на Windows хіт-тестяться
// по альфа-каналу на рівні ОС і час від часу "губили" реєстрацію вхідних
// подій — звідси цілий ряд звітів про те, що тулбар деколи не реагує на
// дотик, кнопки перестають клікатись у певній зоні, межі "з'їжджають" після
// фулскріну і т.д. Непрозоре вікно (як і саме головне вікно застосунку,
// з яким таких проблем ніколи не було) цьому класу багів не підвладне
// взагалі — тому кнопки виносимо в окреме звичайне вікно, а прозорим
// (і залежним від складної логіки хіт-тесту) лишаємо тільки саме полотно.
// =====================================================================

let canvasWindow: BrowserWindow | null = null;
let toolbarWindow: BrowserWindow | null = null;
let passThroughEnabled = false;

// Обидва вікна мусять бути на НАЙВИЩОМУ рівні 'screen-saver' — це той самий
// рівень, який потрібен canvasWindow, щоб узагалі малюватись поверх
// справжнього OS-фулскріну (спроба знизити його до 'floating', щоб тулбар
// природньо був "вищим", зламала показ малюнку саме в фулскріні: канвас
// ставав невидимим над презентацією/відео на весь екран і з'являвся знову
// лише після виходу з фулскріну). Оскільки 'screen-saver' — це стеля
// Electron API (вище рівня просто не існує), тулбар підняти НАД канвасом
// рівнем неможливо — тому порядок серед двох вікон одного рівня підтримуємо
// активним перевстановленням (moveTopoolbarKeepOnTop нижче), а не статичною
// різницею рівнів.
const CANVAS_LEVEL = 'screen-saver';
const TOOLBAR_LEVEL = 'screen-saver';

// Клік по canvasWindow (початок штриха) активує його на рівні ОС, і серед
// двох вікон ОДНАКОВОГО рівня always-on-top ОС візуально піднімає щойно
// активоване — тобто канвас ліз би поверх тулбару, ховаючи й роблячи
// некліковною всю панель кнопок. Одноразового moveTop() по події 'focus'
// виявилось недостатньо (гонка з тим, як швидко ОС встигає перемалювати
// порядок), тож тримаємо тулбар нагорі періодичним примусовим moveTop(),
// поки оверлей активний — дешева операція, і будь-яке "просідання" тулбару
// самовиправляється щонайбільше за TOOLBAR_KEEP_ON_TOP_MS.
const TOOLBAR_KEEP_ON_TOP_MS = 300;
let toolbarKeepOnTopTimer: NodeJS.Timeout | null = null;

function startToolbarKeepOnTop(): void {
  if (toolbarKeepOnTopTimer) return;
  toolbarKeepOnTopTimer = setInterval(() => {
    if (toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible()) {
      toolbarWindow.moveTop();
    }
  }, TOOLBAR_KEEP_ON_TOP_MS);
}

function stopToolbarKeepOnTop(): void {
  if (toolbarKeepOnTopTimer) {
    clearInterval(toolbarKeepOnTopTimer);
    toolbarKeepOnTopTimer = null;
  }
}

function sendToCanvas(channel: string, ...args: unknown[]): void {
  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.webContents.send(channel, ...args);
  }
}

function sendToToolbar(channel: string, ...args: unknown[]): void {
  if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.webContents.send(channel, ...args);
  }
}

// "Пропускати кліки" тепер керується виключно тут, у main — canvasWindow
// сам більше нічого не вирішує (не потребує стеження за наведенням на
// тулбар, бо тулбар фізично в іншому вікні). Джерело правди про стан —
// саме passThroughEnabled нижче, а обидва вікна лише відображають його.
function setPassThrough(next: boolean): void {
  passThroughEnabled = next;
  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.setIgnoreMouseEvents(passThroughEnabled, { forward: true });
  }
  sendToCanvas('overlay:pass-through-changed', passThroughEnabled);
  sendToToolbar('overlay:pass-through-changed', passThroughEnabled);
}

// Тимчасова діагностика для звіту про "канвас раптом зменшується, краї не
// клікаються": логуємо, ЯКІ межі ми просили встановити і ЯКІ Windows реально
// застосувала (окремо), плюс масштаб дисплея. Оскільки тепер лише canvasWindow
// взагалі змінює свої межі (toolbarWindow більше не рухається програмно при
// фулскріні — саме ця сполученість і була ймовірною причиною бага), сам факт
// відтворення проблеми після цього поділу вже буде діагностично цінним.
function logOverlayBounds(context: string, requested: Electron.Rectangle): void {
  if (!canvasWindow || canvasWindow.isDestroyed()) return;
  const applied = canvasWindow.getBounds();
  const display = screen.getDisplayMatching(applied);
  logLine(
    'OVERLAY',
    `${context}: запит=${JSON.stringify(requested)} застосовано=${JSON.stringify(applied)} ` +
      `дисплей.bounds=${JSON.stringify(display.bounds)} дисплей.workArea=${JSON.stringify(display.workArea)} ` +
      `scaleFactor=${display.scaleFactor}`,
  );
}

// На Windows реєстрація хіт-тесту для прозорого always-on-top вікна іноді не
// "заводиться" сама після setIgnoreMouseEvents(false) — вікно видиме, але
// геть не отримує вхід (миша/тач проходить крізь нього), хоча на macOS той
// самий код працює одразу. Примусове true->false і .focus() — задокументований
// у спільноті Electron обхід саме цього: він ніби "штовхає" вікно перереєструвати
// себе як таке, що приймає вхід. Потрібно лише canvasWindow — toolbarWindow
// непрозоре і цій проблемі не підвладне.
function kickHitTesting(win: BrowserWindow): void {
  win.setIgnoreMouseEvents(true);
  win.setIgnoreMouseEvents(false);
  win.focus();
}

// Достатньо просторо для всіх 11 елементів панелі (ручка перетягування + 5
// кружечків кольору по 40px + повзунок товщини + 4 кнопки по 40px) з запасом,
// щоб останню кнопку не обрізало по краю вікна.
const TOOLBAR_WIDTH = 640;
const TOOLBAR_HEIGHT = 68;
const TOOLBAR_BG = '#14161a';

function createToolbarWindow(displayBounds: Electron.Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    x: displayBounds.x + 24,
    y: displayBounds.y + 24,
    frame: false,
    transparent: false,
    backgroundColor: TOOLBAR_BG,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/overlay-toolbar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, TOOLBAR_LEVEL);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '../../public/overlay-toolbar/index.html'));

  win.on('closed', () => {
    toolbarWindow = null;
  });

  return win;
}

export function showOverlayWindow(bounds: Electron.Rectangle): BrowserWindow {
  startToolbarKeepOnTop();

  if (!toolbarWindow || toolbarWindow.isDestroyed()) {
    toolbarWindow = createToolbarWindow(bounds);
  } else {
    // Позицію тулбару свідомо НЕ переставляємо тут — вчитель міг перетягнути
    // його кудись зручно, і кожен повторний показ не повинен це скидати.
    toolbarWindow.setAlwaysOnTop(true, TOOLBAR_LEVEL);
    toolbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    toolbarWindow.show();
  }

  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.setBounds(bounds);
    logOverlayBounds('showOverlayWindow', bounds);
    // Перевстановлюємо щоразу перед показом, а не лише один раз при
    // створенні: після виходу з fullscreen і повторного входу macOS "забуває"
    // приналежність вікна до Space, і показ без цього спричиняє стрибок
    // екрана на інший Space замість тихого показу поверх поточного.
    canvasWindow.setAlwaysOnTop(true, CANVAS_LEVEL);
    canvasWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    canvasWindow.show();
    kickHitTesting(canvasWindow);
    globalShortcut.register(CLICK_THROUGH_SHORTCUT, () => setPassThrough(!passThroughEnabled));
    toolbarWindow.moveTop();
    return canvasWindow;
  }

  const { x, y, width, height } = bounds;

  canvasWindow = new BrowserWindow({
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

  canvasWindow.setAlwaysOnTop(true, CANVAS_LEVEL);
  canvasWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  canvasWindow.loadFile(path.join(__dirname, '../../public/overlay/index.html'));

  canvasWindow.once('ready-to-show', () => {
    if (canvasWindow) kickHitTesting(canvasWindow);
    toolbarWindow?.moveTop();
  });

  // Миттєва реакція між "тіками" startToolbarKeepOnTop() вище — на
  // активацію canvasWindow (початок штриха) не варто чекати навіть
  // TOOLBAR_KEEP_ON_TOP_MS, якщо можна підняти тулбар одразу.
  canvasWindow.on('focus', () => {
    toolbarWindow?.moveTop();
  });

  canvasWindow.on('closed', () => {
    globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
    canvasWindow = null;
  });

  globalShortcut.register(CLICK_THROUGH_SHORTCUT, () => setPassThrough(!passThroughEnabled));

  return canvasWindow;
}

export function hideOverlayWindow(): void {
  globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
  stopToolbarKeepOnTop();
  // Малюнок стирається щоразу, як оверлей ховається — інакше стара анотація
  // з попереднього контексту (наприклад, з презентації) несподівано випливає
  // поверх зовсім іншої програми наступного разу, коли оверлей знову покажуть.
  sendToCanvas('overlay:clear');
  canvasWindow?.hide();
  toolbarWindow?.hide();
}

// hide() лишає вікно живим (Electron і далі рахує його "відкритим"), тож при
// повному завершенні застосунку його треба саме закрити, а не сховати.
export function destroyOverlayWindow(): void {
  globalShortcut.unregister(CLICK_THROUGH_SHORTCUT);
  stopToolbarKeepOnTop();
  if (canvasWindow && !canvasWindow.isDestroyed()) canvasWindow.destroy();
  if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.destroy();
  canvasWindow = null;
  toolbarWindow = null;
}

// На macOS вхід іншого вікна (нашого ж shellWindow) у справжній fullscreen
// створює окремий Space, і always-on-top вікна іноді "губляться", доки їхні
// прапорці не переустановити вже ПІСЛЯ переходу. Викликати з shellWindow
// 'enter-full-screen'/'leave-full-screen'.
//
// bounds (опційно) — актуальні межі дисплея на момент переходу, застосовуються
// ЛИШЕ до canvasWindow (йому справді треба покривати весь дисплей). toolbarWindow
// свідомо не займає весь дисплей і не мусить підлаштовуватись під його межі —
// раніше обидва були одним вікном, і саме ця сполученість, ймовірно, і була
// причиною звітів про "тулбар відвалюється шматками" після фулскріну.
export function reassertOverlayVisibility(bounds?: Electron.Rectangle): void {
  if (canvasWindow && !canvasWindow.isDestroyed() && canvasWindow.isVisible()) {
    if (bounds) {
      canvasWindow.setBounds(bounds);
      logOverlayBounds('reassertOverlayVisibility', bounds);
    }
    canvasWindow.setAlwaysOnTop(true, CANVAS_LEVEL);
    canvasWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    canvasWindow.moveTop();
    // setBounds() — це саме та зміна вікна, після якої Windows може "загубити"
    // реєстрацію хіт-тесту (звідси й потреба в kickHitTesting при кожному показі
    // в showOverlayWindow вище).
    kickHitTesting(canvasWindow);
  }

  if (toolbarWindow && !toolbarWindow.isDestroyed() && toolbarWindow.isVisible()) {
    toolbarWindow.setAlwaysOnTop(true, TOOLBAR_LEVEL);
    toolbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    toolbarWindow.moveTop();
  }
}

export function getShellDisplayBounds(shellWindow: BrowserWindow | null): Electron.Rectangle {
  const display = shellWindow ? screen.getDisplayMatching(shellWindow.getBounds()) : screen.getPrimaryDisplay();
  return display.bounds;
}

export function getDisplayBoundsUnderCursor(): Electron.Rectangle {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
}

export function isOverlayVisible(): boolean {
  return !!canvasWindow && !canvasWindow.isDestroyed() && canvasWindow.isVisible();
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

  ipcMain.on('overlay:request-close', () => {
    hideOverlayWindow();
  });

  // Команди від панелі кнопок (toolbarWindow) до полотна (canvasWindow) —
  // проходять через main, бо це два різні процеси рендерера без прямого
  // зв'язку між собою.
  ipcMain.on('overlay:set-color', (_event, color: string) => {
    sendToCanvas('overlay:set-color', color);
  });

  ipcMain.on('overlay:set-erasing', (_event, erasing: boolean) => {
    sendToCanvas('overlay:set-erasing', erasing);
  });

  ipcMain.on('overlay:set-width', (_event, width: number) => {
    sendToCanvas('overlay:set-width', width);
  });

  ipcMain.on('overlay:request-clear', () => {
    sendToCanvas('overlay:clear');
  });

  ipcMain.on('overlay:toggle-pass-through', () => {
    setPassThrough(!passThroughEnabled);
  });
}
