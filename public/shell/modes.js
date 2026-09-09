window.boardModes = {
  home: {
    label: '',
    render: (container) => {
      container.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'home-grid';

      const tiles = [
        { id: 'overlay', icon: '✏️', label: 'Малювання' },
        { id: 'web', icon: '🌐', label: 'Веб' },
        { id: 'presentation', icon: '📊', label: 'Презентація' },
        { id: 'image', icon: '🖼️', label: 'Зображення' },
      ];

      tiles.forEach((tile) => {
        const btn = document.createElement('button');
        btn.className = 'home-tile';
        btn.innerHTML = `<span class="home-tile-icon">${tile.icon}</span><span class="home-tile-label">${tile.label}</span>`;
        btn.addEventListener('click', () => window.activateMode(tile.id));
        grid.appendChild(btn);
      });

      container.appendChild(grid);
    },
  },

  overlay: {
    icon: '✏️',
    label: 'Малювання',
    onActivate: () => window.boardApi.overlay.show(),
    onDeactivate: () => window.boardApi.overlay.hide(),
    render: (container) => {
      container.innerHTML =
        '<div class="placeholder">Малювання активне на весь екран.<br>Плаваюча панель інструментів — зверху.<br>Ctrl+Alt+D повертає малювання, якщо увімкнено «пропускати кліки».</div>';
    },
  },

  web: {
    icon: '🌐',
    label: 'Веб',
    render: (container) => {
      container.innerHTML = '<div class="placeholder">Режим «Веб / YouTube» — скоро.</div>';
    },
  },

  presentation: {
    icon: '📊',
    label: 'Презентація',
    render: (container) => {
      container.innerHTML = '<div class="placeholder">Режим «Презентація» — скоро.</div>';
    },
  },

  image: {
    icon: '🖼️',
    label: 'Зображення',
    render: (container) => {
      container.innerHTML = '<div class="placeholder">Режим «Зображення / PDF» — скоро.</div>';
    },
  },
};
