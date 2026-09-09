import { PptxViewer } from '@aiden0z/pptx-renderer';

async function main() {
  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  if (!src) throw new Error('Не передано шлях до файлу');

  const resp = await fetch(`file://${src}`);
  if (!resp.ok) throw new Error(`Не вдалося прочитати файл (${resp.status})`);
  const buffer = await resp.arrayBuffer();

  const scratch = document.createElement('div');
  scratch.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(scratch);

  // renderMode:'slide' рендерить лише поточний слайд у scratch — нам це не
  // треба, реальні сторінки рендеримо самі нижче через renderSlideToContainer,
  // маючи повний контроль над розміром і розбивкою на PDF-сторінки.
  const viewer = await PptxViewer.open(buffer, scratch, { renderMode: 'slide' });
  const { slideCount, slideWidth, slideHeight } = viewer;
  if (!slideCount) throw new Error('У файлі немає слайдів');
  scratch.remove();

  const style = document.createElement('style');
  style.textContent = `
    @page { size: ${slideWidth}px ${slideHeight}px; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      height: ${slideHeight * slideCount}px;
      overflow: hidden;
    }
    #root { margin: 0; padding: 0; }
    .print-slide {
      width: ${slideWidth}px;
      height: ${slideHeight}px;
      overflow: hidden;
      position: relative;
      break-after: page;
      page-break-after: always;
    }
    .print-slide:last-child { break-after: auto; page-break-after: auto; }
  `;
  document.head.appendChild(style);

  const root = document.getElementById('root');
  const handles = [];
  for (let i = 0; i < slideCount; i += 1) {
    const slideDiv = document.createElement('div');
    slideDiv.className = 'print-slide';
    root.appendChild(slideDiv);
    handles.push(viewer.renderSlideToContainer(i, slideDiv));
  }

  await Promise.all(handles.map((h) => h.ready));

  // Немає preload/IPC у цьому прихованому вікні — сигналізуємо головному
  // процесу через заголовок сторінки (він слухає page-title-updated).
  document.title = 'PPTX_PRINT_READY';
}

main().catch((err) => {
  document.title = `PPTX_PRINT_ERROR:${err?.message ?? String(err)}`;
});
