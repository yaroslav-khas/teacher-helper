import { BrowserWindow, WebContentsView, ipcMain } from 'electron';
import { randomUUID } from 'crypto';

interface Tab {
  id: string;
  view: WebContentsView;
}

const tabs: Tab[] = [];
let activeTabId: string | null = null;
let lastBounds: Electron.Rectangle | null = null;

function findTab(id: string | null): Tab | undefined {
  return tabs.find((t) => t.id === id);
}

function tabSummary(tab: Tab) {
  const wc = tab.view.webContents;
  return {
    id: tab.id,
    url: wc.getURL(),
    title: wc.getTitle() || wc.getURL() || 'Нова вкладка',
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    loading: wc.isLoading(),
  };
}

function sendTabsChanged(shellWindow: BrowserWindow): void {
  if (shellWindow.isDestroyed()) return;
  shellWindow.webContents.send('web:tabs-changed', {
    tabs: tabs.map(tabSummary),
    activeId: activeTabId,
  });
}

function pauseMedia(tab: Tab): void {
  tab.view.webContents
    .executeJavaScript('document.querySelectorAll("video, audio").forEach((el) => el.pause());')
    .catch(() => undefined);
}

function wireTabEvents(shellWindow: BrowserWindow, tab: Tab): void {
  const wc = tab.view.webContents;
  const emit = () => sendTabsChanged(shellWindow);
  wc.on('did-navigate', emit);
  wc.on('did-navigate-in-page', emit);
  wc.on('did-start-loading', emit);
  wc.on('did-stop-loading', emit);
  wc.on('page-title-updated', emit);

  // Сторінка (наприклад, відео на YouTube) сама просить повний екран через
  // HTML5 Fullscreen API. Ми лише повідомляємо рендерер — той ховає власну
  // навігацію через CSS, після чого ResizeObserver сам розтягне цей view.
  wc.on('enter-html-full-screen', () => {
    shellWindow.webContents.send('web:fullscreen-change', true);
  });
  wc.on('leave-html-full-screen', () => {
    shellWindow.webContents.send('web:fullscreen-change', false);
  });
}

function createTab(shellWindow: BrowserWindow, url?: string): Tab {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const tab: Tab = { id: randomUUID(), view };
  tabs.push(tab);
  wireTabEvents(shellWindow, tab);
  view.webContents.loadURL(url || 'https://www.google.com');
  return tab;
}

function attachActiveTab(shellWindow: BrowserWindow): void {
  const active = findTab(activeTabId);
  if (!active || !lastBounds) return;
  shellWindow.contentView.addChildView(active.view);
  active.view.setBounds(lastBounds);
}

function detachTab(shellWindow: BrowserWindow, tab: Tab, pause = true): void {
  if (pause) pauseMedia(tab);
  shellWindow.contentView.removeChildView(tab.view);
}

export function showWebView(shellWindow: BrowserWindow, bounds: Electron.Rectangle, url?: string): void {
  lastBounds = bounds;
  if (tabs.length === 0) {
    activeTabId = createTab(shellWindow, url).id;
  }
  attachActiveTab(shellWindow);
  sendTabsChanged(shellWindow);
}

export function hideWebView(shellWindow: BrowserWindow): void {
  const active = findTab(activeTabId);
  if (active) detachTab(shellWindow, active);
}

// Для короткочасного показу DOM-попапу (налаштування, банер) поверх активної
// вкладки — на відміну від hideWebView (перемикання вкладки/вихід з режиму),
// тут відео/аудіо навмисно НЕ ставиться на паузу: попап видно секунди,
// зупиняти через нього перегляд було б небажаним побічним ефектом.
export function hideWebViewForPopup(shellWindow: BrowserWindow): void {
  const active = findTab(activeTabId);
  if (active) detachTab(shellWindow, active, false);
}

export function setWebViewBounds(bounds: Electron.Rectangle): void {
  lastBounds = bounds;
  const active = findTab(activeTabId);
  active?.view.setBounds(bounds);
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'https://www.google.com';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const looksLikeDomain = /^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(trimmed) && !trimmed.includes(' ');
  if (looksLikeDomain) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function registerWebViewIpc(getShellWindow: () => BrowserWindow | null): void {
  ipcMain.on('web:show', (_event, bounds: Electron.Rectangle, url?: string) => {
    const shellWindow = getShellWindow();
    if (shellWindow) showWebView(shellWindow, bounds, url);
  });

  ipcMain.on('web:hide', () => {
    const shellWindow = getShellWindow();
    if (shellWindow) hideWebView(shellWindow);
  });

  ipcMain.on('web:hide-for-popup', () => {
    const shellWindow = getShellWindow();
    if (shellWindow) hideWebViewForPopup(shellWindow);
  });

  ipcMain.on('web:set-bounds', (_event, bounds: Electron.Rectangle) => {
    setWebViewBounds(bounds);
  });

  ipcMain.on('web:navigate', (_event, input: string) => {
    const active = findTab(activeTabId);
    active?.view.webContents.loadURL(normalizeUrl(input));
  });

  ipcMain.on('web:back', () => {
    const active = findTab(activeTabId);
    if (active?.view.webContents.canGoBack()) active.view.webContents.goBack();
  });

  ipcMain.on('web:forward', () => {
    const active = findTab(activeTabId);
    if (active?.view.webContents.canGoForward()) active.view.webContents.goForward();
  });

  ipcMain.on('web:reload', () => {
    findTab(activeTabId)?.view.webContents.reload();
  });

  // Відкриває посилання (із закладок чи з головного екрана) у НОВІЙ вкладці,
  // а не поверх поточної — щоб клік по чомусь на дошці випадково не "збив"
  // те, що вчитель уже мав відкритим.
  ipcMain.on('web:new-tab', (_event, url?: string) => {
    const shellWindow = getShellWindow();
    if (!shellWindow) return;
    const prevActive = findTab(activeTabId);
    if (prevActive) detachTab(shellWindow, prevActive);
    activeTabId = createTab(shellWindow, url).id;
    attachActiveTab(shellWindow);
    sendTabsChanged(shellWindow);
  });

  ipcMain.on('web:switch-tab', (_event, id: string) => {
    const shellWindow = getShellWindow();
    if (!shellWindow || id === activeTabId) return;
    const prevActive = findTab(activeTabId);
    if (prevActive) detachTab(shellWindow, prevActive);
    activeTabId = id;
    attachActiveTab(shellWindow);
    sendTabsChanged(shellWindow);
  });

  ipcMain.on('web:close-tab', (_event, id: string) => {
    const shellWindow = getShellWindow();
    if (!shellWindow) return;
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const [closed] = tabs.splice(index, 1);
    const wasActive = closed.id === activeTabId;
    // WebContentsView (на відміну від старого BrowserView) не має власного
    // destroy() — досить прибрати з вікна й позбутись останнього посилання,
    // Electron сам звільнить ресурси при збиранні сміття.
    shellWindow.contentView.removeChildView(closed.view);

    if (wasActive) {
      const fallback = tabs[index] ?? tabs[index - 1] ?? null;
      activeTabId = fallback ? fallback.id : createTab(shellWindow).id;
      attachActiveTab(shellWindow);
    }
    sendTabsChanged(shellWindow);
  });
}
