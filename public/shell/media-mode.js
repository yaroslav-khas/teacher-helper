(() => {
  const state = { root: null, current: null };
  const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];

  function extOf(name) {
    return (name.split('.').pop() || '').toLowerCase();
  }

  window.boardModes.media = {
    icon: '▶️',
    label: 'Медіа',
    render: (container) => {
      window.renderFileLibrary(container, {
        api: window.boardApi.media,
        state,
        chooseLabel: 'Обрати папку з відео',
        extensions: VIDEO_EXTS,
        onOpenFile: (entry, siblings, goBackToFolder) => {
          const ext = extOf(entry.name);
          if (VIDEO_EXTS.includes(ext)) {
            const videos = siblings.filter((e) => VIDEO_EXTS.includes(extOf(e.name)));
            window.renderVideoViewer(container, entry.fullPath, videos, goBackToFolder);
          } else {
            window.boardApi.media.openFile(entry.fullPath);
          }
        },
      });
    },
    onDeactivate: () => {
      window.disposeVideoViewer?.();
      document.body.classList.remove('web-fullscreen');
    },
  };
})();
