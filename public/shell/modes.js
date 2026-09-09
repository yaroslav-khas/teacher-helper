const STUDENT_TOOLS = [
  { icon: '🧩', label: 'Wordwall', url: 'https://wordwall.net' },
  { icon: '📘', label: 'LearningApps', url: 'https://learningapps.org' },
  { icon: '🎮', label: 'Kahoot', url: 'https://kahoot.com' },
  { icon: '📝', label: 'Quizlet', url: 'https://quizlet.com' },
  { icon: '🧠', label: 'Blooket', url: 'https://www.blooket.com' },
];

const BOARD_TOOLS = [
  { icon: '🖥️', label: 'Classroomscreen', url: 'https://classroomscreen.com' },
  { icon: '🎡', label: 'Wheel of Names', url: 'https://wheelofnames.com' },
  { icon: '⏱️', label: 'Таймер', url: 'https://www.online-stopwatch.com' },
  { icon: '🎲', label: 'Random Name Picker', url: 'https://www.classtools.net/random-name-picker/' },
  { icon: '📌', label: 'Padlet', url: 'https://padlet.com' },
];

function renderLinkRow(title, items) {
  const section = document.createElement('section');
  section.className = 'home-links-section';

  const heading = document.createElement('h2');
  heading.className = 'home-links-title';
  heading.textContent = title;
  section.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'home-links-row';

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'home-link-tile';
    btn.innerHTML = `<span class="home-link-icon">${item.icon}</span><span class="home-link-label">${item.label}</span>`;
    btn.addEventListener('pointerdown', () => window.openWebLinkInNewTab(item.url));
    row.appendChild(btn);
  });

  section.appendChild(row);
  return section;
}

window.boardModes = {
  home: {
    label: '',
    render: (container) => {
      container.innerHTML = '';

      const grid = document.createElement('div');
      grid.className = 'home-grid';

      const tiles = [
        { id: 'web', icon: '🌐', label: 'Веб' },
        { id: 'media', icon: '▶️', label: 'Медіа' },
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

      const scroller = document.createElement('div');
      scroller.className = 'home-screen';
      scroller.appendChild(grid);
      scroller.appendChild(renderLinkRow('Інтерактивні тулзи для учнів', STUDENT_TOOLS));
      scroller.appendChild(renderLinkRow('Інструменти для роботи з дошкою', BOARD_TOOLS));
      container.appendChild(scroller);
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
