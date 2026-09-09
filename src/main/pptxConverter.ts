import { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ConvertResult {
  ok: boolean;
  pdfPath?: string;
  error?: string;
}

// PDF лягає поруч із самою презентацією (як просив вчитель), а не в окрему
// службову теку — так її видно й зрозуміло, звідки вона взялась.
function siblingPdfPath(sourcePath: string): string {
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(dir, `${base}.pdf`);
}

function isUpToDate(sourcePath: string, pdfPath: string): boolean {
  if (!fs.existsSync(pdfPath)) return false;
  return fs.statSync(pdfPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs;
}

function convertViaWindowsPowerPoint(sourcePath: string, destPath: string): Promise<ConvertResult> {
  // ppFixedFormatTypePDF = 2. WithWindow:=msoFalse (0) намагається уникнути
  // видимого вікна PowerPoint; -WindowStyle Hidden ховає й саме вікно
  // PowerShell. Використовується лише якщо PowerPoint вже встановлений —
  // нічого додатково не ставимо.
  const script = `
    $ErrorActionPreference = "Stop"
    $ppt = New-Object -ComObject PowerPoint.Application
    try {
      $pres = $ppt.Presentations.Open("${sourcePath.replace(/"/g, '""')}", $true, $false, $false)
      $pres.ExportAsFixedFormat("${destPath.replace(/"/g, '""')}", 2)
      $pres.Close()
    } finally {
      $ppt.Quit()
    }
  `;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { timeout: 60_000 },
      (err) => {
        if (err) {
          resolve({ ok: false, error: `PowerPoint COM: ${err.message}` });
          return;
        }
        if (!fs.existsSync(destPath)) {
          resolve({ ok: false, error: 'PowerPoint COM завершився без помилки, але PDF не створився' });
          return;
        }
        resolve({ ok: true, pdfPath: destPath });
      },
    );
  });
}

// Універсальний варіант, що не потребує НІЧОГО заздалегідь встановленого:
// рендеримо слайди в прихованому вікні Electron через @aiden0z/pptx-renderer
// (чистий JS, вбудований у застосунок), і друкуємо результат у PDF через
// власну функцію Chromium printToPDF — вона є в кожному Electron-застосунку.
// Мінус: анімації/переходи не відтворюються (лише статичні слайди).
function convertViaBundledRenderer(sourcePath: string, destPath: string): Promise<ConvertResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ConvertResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!win.isDestroyed()) win.destroy();
      resolve(result);
    };

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const timeoutId = setTimeout(() => {
      finish({ ok: false, error: 'Тайм-аут вбудованого рендерингу презентації' });
    }, 30_000);

    win.webContents.on('page-title-updated', async (_event, title) => {
      if (title === 'PPTX_PRINT_READY') {
        try {
          const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          });
          fs.writeFileSync(destPath, pdfBuffer);
          finish({ ok: true, pdfPath: destPath });
        } catch (err) {
          finish({ ok: false, error: `Вбудований рендер: ${(err as Error).message}` });
        }
      } else if (title.startsWith('PPTX_PRINT_ERROR:')) {
        finish({ ok: false, error: title.slice('PPTX_PRINT_ERROR:'.length) });
      }
    });

    win.webContents.on('did-fail-load', (_event, _code, desc) => {
      finish({ ok: false, error: `Вбудований рендер: не завантажився (${desc})` });
    });

    const harnessUrl = `file://${path.join(__dirname, '../../public/pptx-print/index.html')}?src=${encodeURIComponent(sourcePath)}`;
    win.loadURL(harnessUrl);
  });
}

export async function convertToPdf(sourcePath: string): Promise<ConvertResult> {
  const dest = siblingPdfPath(sourcePath);
  if (isUpToDate(sourcePath, dest)) {
    return { ok: true, pdfPath: dest };
  }

  if (process.platform === 'win32') {
    const viaPowerPoint = await convertViaWindowsPowerPoint(sourcePath, dest);
    if (viaPowerPoint.ok) return viaPowerPoint;
    // PowerPoint міг бути не встановлений — тихо переходимо до вбудованого
    // рендера, який працює завжди.
  }

  return convertViaBundledRenderer(sourcePath, dest);
}
