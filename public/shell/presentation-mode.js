(() => {
  const state = { root: null, current: null };

  // Живий перегляд у застосунку вміє лише сучасний OOXML-формат (.pptx/.ppsx —
  // це той самий ZIP/XML під капотом, .ppsx просто позначений як "показ").
  // Легасі .ppt, .pps, а також .odp (OpenDocument) і .key (Keynote) — зовсім
  // інші формати файлів, для них лишається "відкрити зовні".
  function isOoxml(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ext === 'pptx' || ext === 'ppsx';
  }

  window.boardModes.presentation = {
    icon: '📊',
    label: 'Презентація',
    render: (container) => {
      window.renderFileLibrary(container, {
        api: window.boardApi.presentation,
        state,
        chooseLabel: 'Обрати папку з презентаціями',
        extensions: ['pptx', 'ppt', 'ppsx', 'pps', 'odp', 'key'],
        onOpenFile: (entry, _siblings, goBackToFolder) => {
          if (isOoxml(entry.name)) {
            window.renderPptxViewer(container, entry.fullPath, goBackToFolder);
          } else {
            window.boardApi.presentation.openFile(entry.fullPath);
          }
        },
      });
    },
    onDeactivate: () => {
      window.disposePptxViewer?.();
      document.body.classList.remove('web-fullscreen');
    },
  };
})();
