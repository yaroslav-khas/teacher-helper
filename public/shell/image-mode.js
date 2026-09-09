(() => {
  const state = { root: null, current: null };
  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

  function extOf(name) {
    return (name.split('.').pop() || '').toLowerCase();
  }

  window.boardModes.image = {
    icon: '🖼️',
    label: 'Зображення',
    render: (container) => {
      window.renderFileLibrary(container, {
        api: window.boardApi.image,
        state,
        chooseLabel: 'Обрати папку із зображеннями й підручниками',
        extensions: [...IMAGE_EXTS, 'pdf'],
        onOpenFile: (entry, siblings, goBackToFolder) => {
          const ext = extOf(entry.name);
          if (ext === 'pdf') {
            window.renderPdfViewer(container, entry.fullPath, goBackToFolder);
          } else if (IMAGE_EXTS.includes(ext)) {
            const images = siblings.filter((e) => IMAGE_EXTS.includes(extOf(e.name)));
            window.renderImageViewer(container, entry.fullPath, images, goBackToFolder);
          } else {
            window.boardApi.image.openFile(entry.fullPath);
          }
        },
      });
    },
    onDeactivate: () => {
      window.disposePdfViewer?.();
      window.disposeImageViewer?.();
      document.body.classList.remove('web-fullscreen');
    },
  };
})();
