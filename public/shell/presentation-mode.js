(() => {
  const state = { root: null, current: null };

  function isPptx(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ext === 'pptx' || ext === 'ppt';
  }

  window.boardModes.presentation = {
    icon: '📊',
    label: 'Презентація',
    render: (container) => {
      window.renderFileLibrary(container, {
        api: window.boardApi.presentation,
        state,
        chooseLabel: 'Обрати папку з презентаціями',
        extensions: ['pptx', 'ppt'],
        onOpenFile: (entry, _siblings, goBackToFolder) => {
          if (isPptx(entry.name)) {
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
