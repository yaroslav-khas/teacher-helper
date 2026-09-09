import { app } from 'electron';
import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface ConvertResult {
  ok: boolean;
  pdfPath?: string;
  error?: string;
}

function cacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'pdf-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cachedPdfPath(sourcePath: string): string {
  const stat = fs.statSync(sourcePath);
  const key = crypto
    .createHash('sha1')
    .update(`${sourcePath}:${stat.mtimeMs}:${stat.size}`)
    .digest('hex');
  return path.join(cacheDir(), `${key}.pdf`);
}

function convertViaWindowsPowerPoint(sourcePath: string, destPath: string): Promise<ConvertResult> {
  // ppFixedFormatTypePDF = 2. WithWindow:=msoFalse (0) намагається уникнути
  // видимого вікна PowerPoint, хоча деякі версії все одно на мить його показують.
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
      ['-NoProfile', '-NonInteractive', '-Command', script],
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

function convertViaLibreOffice(sourcePath: string, destPath: string): Promise<ConvertResult> {
  const outDir = path.dirname(destPath);
  return new Promise((resolve) => {
    execFile(
      'soffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', outDir, sourcePath],
      { timeout: 60_000 },
      (err) => {
        if (err) {
          resolve({ ok: false, error: `LibreOffice: ${err.message}` });
          return;
        }
        const producedName = `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`;
        const producedPath = path.join(outDir, producedName);
        if (!fs.existsSync(producedPath)) {
          resolve({ ok: false, error: 'LibreOffice завершився без помилки, але PDF не створився' });
          return;
        }
        fs.renameSync(producedPath, destPath);
        resolve({ ok: true, pdfPath: destPath });
      },
    );
  });
}

export async function convertToPdf(sourcePath: string): Promise<ConvertResult> {
  const dest = cachedPdfPath(sourcePath);
  if (fs.existsSync(dest)) {
    return { ok: true, pdfPath: dest };
  }

  if (process.platform === 'win32') {
    return convertViaWindowsPowerPoint(sourcePath, dest);
  }

  // На macOS/Linux (розробка/тест) немає прямого доступу до COM-автоматизації
  // PowerPoint. Пробуємо LibreOffice, якщо він встановлений; інакше — чесна
  // відмова, і виклик боку показує "Відкрити зовні" замість цього.
  return convertViaLibreOffice(sourcePath, dest);
}
