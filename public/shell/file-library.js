function fileLibPathSegments(p) {
  return p.split(/[\\/]/).filter(Boolean);
}

function fileLibExtOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

function fileLibExtIcon(name) {
  const ext = fileLibExtOf(name);
  if (['pptx', 'ppt', 'ppsx', 'pps', 'key', 'odp'].includes(ext)) return '📊';
  if (ext === 'pdf') return '📕';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'].includes(ext)) return '🎬';
  return '📄';
}

// Спільна файлова бібліотека (вибір кореневої папки, хлібні крихти, сітка
// файлів, велика кнопка "+") — використовується і "Презентацією", і
// "Зображеннями", кожна зі своїм api-неймспейсом і власним станом.
window.renderFileLibrary = async function renderFileLibrary(container, config) {
  const { api, state } = config;
  // Фіксуємо "покоління" на момент запуску: якщо користувач встигне
  // перемкнутись на інший режим, поки тут ще триває await (повільний диск,
  // мережева тека), усі подальші записи в DOM з цього виклику скасовуються.
  const myGeneration = window.getRenderGeneration();
  const isStale = () => window.getRenderGeneration() !== myGeneration;

  function renderChooseRoot() {
    if (isStale()) return;
    container.innerHTML = '<div class="file-empty"></div>';
    const empty = container.querySelector('.file-empty');

    const btn = document.createElement('button');
    btn.className = 'big-plus-tile';

    const icon = document.createElement('span');
    icon.className = 'big-plus-icon';
    icon.textContent = '+';

    const label = document.createElement('span');
    label.textContent = config.chooseLabel;

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', async () => {
      const root = await api.chooseRoot();
      if (root) {
        state.root = root;
        state.current = root;
        renderFolder();
      }
    });

    empty.appendChild(btn);
  }

  async function renderFolder() {
    const result = await api.list(state.current);
    if (isStale()) return;
    const allEntries = result.ok ? result.entries : [];
    // Папки завжди показуємо (для навігації); файли — тільки релевантного для
    // цього режиму типу, якщо задано список розширень, щоб "Медіа" не
    // засмічувалось презентаціями з тієї ж теки, і навпаки.
    const entries = config.extensions
      ? allEntries.filter((e) => e.isDirectory || config.extensions.includes(fileLibExtOf(e.name)))
      : allEntries;

    container.innerHTML = `
      <div class="file-browser">
        <div class="file-crumbs"></div>
        <div class="file-grid"></div>
      </div>
    `;

    const crumbsEl = container.querySelector('.file-crumbs');
    const rootName = fileLibPathSegments(state.root).pop() || state.root;
    const relative = fileLibPathSegments(state.current.slice(state.root.length));

    let acc = state.root;
    const segments = [{ label: rootName, path: state.root }];
    for (const part of relative) {
      acc = `${acc}/${part}`;
      segments.push({ label: part, path: acc });
    }

    segments.forEach((seg, i) => {
      const crumbBtn = document.createElement('button');
      crumbBtn.className = 'crumb';
      crumbBtn.textContent = seg.label;
      crumbBtn.addEventListener('click', () => {
        state.current = seg.path;
        renderFolder();
      });
      crumbsEl.appendChild(crumbBtn);

      if (i < segments.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = '/';
        crumbsEl.appendChild(sep);
      }
    });

    const changeRootBtn = document.createElement('button');
    changeRootBtn.className = 'crumb-change';
    changeRootBtn.title = 'Обрати іншу папку';
    changeRootBtn.textContent = 'Змінити папку';
    changeRootBtn.addEventListener('click', async () => {
      const root = await api.chooseRoot();
      if (root) {
        state.root = root;
        state.current = root;
        renderFolder();
      }
    });
    crumbsEl.appendChild(changeRootBtn);

    const gridEl = container.querySelector('.file-grid');

    const addBtn = document.createElement('button');
    addBtn.className = 'file-tile file-tile-add';
    addBtn.innerHTML = '<span class="file-tile-icon">+</span><span class="file-tile-name">Додати файл</span>';
    addBtn.addEventListener('click', async () => {
      await api.addFile(state.current);
      renderFolder();
    });
    gridEl.appendChild(addBtn);

    const PREVIEWABLE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

    entries.forEach((entry) => {
      const tile = document.createElement('button');
      tile.className = 'file-tile';

      // Фото показуємо як справжнє мініпревʼю замість іконки — набагато
      // легше впізнати потрібний файл серед купи однаково підписаних сканів.
      if (!entry.isDirectory && PREVIEWABLE_EXTS.includes(fileLibExtOf(entry.name))) {
        const previewEl = document.createElement('img');
        previewEl.className = 'file-tile-preview';
        previewEl.src = `file://${entry.fullPath}`;
        previewEl.alt = '';
        previewEl.loading = 'lazy';
        tile.appendChild(previewEl);
      } else {
        const iconEl = document.createElement('span');
        iconEl.className = 'file-tile-icon';
        iconEl.textContent = entry.isDirectory ? '📁' : fileLibExtIcon(entry.name);
        tile.appendChild(iconEl);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'file-tile-name';
      nameEl.textContent = entry.name;

      tile.appendChild(nameEl);
      tile.addEventListener('click', () => {
        if (entry.isDirectory) {
          state.current = entry.fullPath;
          renderFolder();
        } else {
          const siblingFiles = entries.filter((e) => !e.isDirectory);
          config.onOpenFile(entry, siblingFiles, renderFolder);
        }
      });

      gridEl.appendChild(tile);
    });
  }

  const root = await api.getRoot();
  if (isStale()) return;
  if (!root) {
    renderChooseRoot();
    return;
  }
  state.root = root;
  if (!state.current || !state.current.startsWith(root)) state.current = root;
  renderFolder();
};
