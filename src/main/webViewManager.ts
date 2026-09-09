import { BrowserWindow, WebContentsView, ipcMain } from 'electron';

let webView: WebContentsView | null = null;
let wired = false;

function ensureWebView(): WebContentsView {
  if (!webView) {
    webView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
  }
  return webView;
}

function sendState(shellWindow: BrowserWindow): void {
  if (!webView) return;
  const wc = webView.webContents;
  shellWindow.webContents.send('web:state', {
    url: wc.getURL(),
    title: wc.getTitle(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    loading: wc.isLoading(),
  });
}

function wireEvents(shellWindow: BrowserWindow, view: WebContentsView): void {
  const wc = view.webContents;
  const emit = () => sendState(shellWindow);
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

export function showWebView(shellWindow: BrowserWindow, bounds: Electron.Rectangle, url?: string): void {
  const view = ensureWebView();
  if (!wired) {
    wireEvents(shellWindow, view);
    wired = true;
  }
  shellWindow.contentView.addChildView(view);
  view.setBounds(bounds);
  if (url && !view.webContents.getURL()) {
    view.webContents.loadURL(url);
  }
  // Якщо view вже мав завантажену сторінку (повторний вхід у режим "Веб"),
  // жодна навігаційна подія тут не спрацює — без цього виклику свіжа панель
  // (адресний рядок, підсвітка вкладки, ←/→) лишається порожньою й
  // застарілою, хоч сам контент насправді на місці.
  sendState(shellWindow);
}

export function hideWebView(shellWindow: BrowserWindow): void {
  if (webView) {
    shellWindow.contentView.removeChildView(webView);
  }
}

export function setWebViewBounds(bounds: Electron.Rectangle): void {
  webView?.setBounds(bounds);
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

  ipcMain.on('web:set-bounds', (_event, bounds: Electron.Rectangle) => {
    setWebViewBounds(bounds);
  });

  ipcMain.on('web:navigate', (_event, input: string) => {
    ensureWebView().webContents.loadURL(normalizeUrl(input));
  });

  ipcMain.on('web:back', () => {
    if (webView?.webContents.canGoBack()) webView.webContents.goBack();
  });

  ipcMain.on('web:forward', () => {
    if (webView?.webContents.canGoForward()) webView.webContents.goForward();
  });

  ipcMain.on('web:reload', () => {
    webView?.webContents.reload();
  });
}
