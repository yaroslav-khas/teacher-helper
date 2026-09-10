const logContent = document.getElementById('log-content');
const pathLabel = document.getElementById('path-label');
const copyFlash = document.getElementById('copy-flash');

async function refresh() {
  const [text, filePath] = await Promise.all([window.logsApi.read(), window.logsApi.getPath()]);
  logContent.textContent = text || '(порожньо)';
  pathLabel.textContent = filePath;
  pathLabel.title = filePath;
  // Найновіші записи внизу — одразу гортаємо туди, а не лишаємо вгорі архіву.
  logContent.scrollTop = logContent.scrollHeight;
}

document.getElementById('refresh').addEventListener('click', refresh);

document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(logContent.textContent);
    copyFlash.classList.add('show');
    setTimeout(() => copyFlash.classList.remove('show'), 1500);
  } catch {
    // Буфер обміну недоступний — не критично, текст і так видно на екрані.
  }
});

refresh();
