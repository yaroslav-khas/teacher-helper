(() => {
  let rootFolder = null;
  let currentFolder = null;

  function extIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['pptx', 'ppt', 'key', 'odp'].includes(ext)) return '📊';
    if (ext === 'pdf') return '📕';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
    return '📄';
  }

  function pathSegments(p) {
    return p.split(/[\\/]/).filter(Boolean);
  }

  function isViewableAsPdf(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ext === 'pdf' || ext === 'pptx' || ext === 'ppt';
  }

  function renderChooseRoot(container) {
    container.innerHTML = '<div class="file-empty"></div>';
    const empty = container.querySelector('.file-empty');

    const btn = document.createElement('button');
    btn.className = 'big-plus-tile';

    const icon = document.createElement('span');
    icon.className = 'big-plus-icon';
    icon.textContent = '+';

    const label = document.createElement('span');
    label.textContent = 'Обрати папку з презентаціями';

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', async () => {
      const root = await window.boardApi.presentation.chooseRoot();
      if (root) {
        rootFolder = root;
        currentFolder = root;
        renderFolder(container);
      }
    });

    empty.appendChild(btn);
  }

  async function renderFolder(container) {
    const result = await window.boardApi.presentation.list(currentFolder);
    const entries = result.ok ? result.entries : [];

    container.innerHTML = `
      <div class="file-browser">
        <div class="file-crumbs"></div>
        <div class="file-grid"></div>
      </div>
    `;

    const crumbsEl = container.querySelector('.file-crumbs');
    const rootName = pathSegments(rootFolder).pop() || rootFolder;
    const relative = pathSegments(currentFolder.slice(rootFolder.length));

    let acc = rootFolder;
    const segments = [{ label: rootName, path: rootFolder }];
    for (const part of relative) {
      acc = `${acc}/${part}`;
      segments.push({ label: part, path: acc });
    }

    segments.forEach((seg, i) => {
      const crumbBtn = document.createElement('button');
      crumbBtn.className = 'crumb';
      crumbBtn.textContent = seg.label;
      crumbBtn.addEventListener('click', () => {
        currentFolder = seg.path;
        renderFolder(container);
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
      const root = await window.boardApi.presentation.chooseRoot();
      if (root) {
        rootFolder = root;
        currentFolder = root;
        renderFolder(container);
      }
    });
    crumbsEl.appendChild(changeRootBtn);

    const gridEl = container.querySelector('.file-grid');

    const addBtn = document.createElement('button');
    addBtn.className = 'file-tile file-tile-add';
    addBtn.innerHTML = '<span class="file-tile-icon">+</span><span class="file-tile-name">Додати файл</span>';
    addBtn.addEventListener('click', async () => {
      await window.boardApi.presentation.addFile(currentFolder);
      renderFolder(container);
    });
    gridEl.appendChild(addBtn);

    entries.forEach((entry) => {
      const tile = document.createElement('button');
      tile.className = 'file-tile';

      const iconEl = document.createElement('span');
      iconEl.className = 'file-tile-icon';
      iconEl.textContent = entry.isDirectory ? '📁' : extIcon(entry.name);

      const nameEl = document.createElement('span');
      nameEl.className = 'file-tile-name';
      nameEl.textContent = entry.name;

      tile.appendChild(iconEl);
      tile.appendChild(nameEl);
      tile.addEventListener('click', () => {
        if (entry.isDirectory) {
          currentFolder = entry.fullPath;
          renderFolder(container);
        } else if (isViewableAsPdf(entry.name)) {
          window.renderPdfViewer(container, entry.fullPath, () => renderFolder(container));
        } else {
          window.boardApi.presentation.openFile(entry.fullPath);
        }
      });

      gridEl.appendChild(tile);
    });
  }

  window.boardModes.presentation = {
    icon: '📊',
    label: 'Презентація',
    render: async (container) => {
      const root = await window.boardApi.presentation.getRoot();
      if (!root) {
        renderChooseRoot(container);
        return;
      }
      rootFolder = root;
      if (!currentFolder || !currentFolder.startsWith(root)) currentFolder = root;
      renderFolder(container);
    },
    onDeactivate: () => {
      window.disposePdfViewer?.();
      document.body.classList.remove('web-fullscreen');
    },
  };
})();
