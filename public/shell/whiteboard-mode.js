window.boardModes.whiteboard = {
  icon: '🗒️',
  label: 'Чистий аркуш',
  // Ніякого окремого інструменту малювання — просто білий фон, а малює той
  // самий оверлей (з тією ж панеллю кольорів/ластика), що й скрізь інде.
  onActivate: () => window.boardApi.overlay.show(),
  onDeactivate: () => window.boardApi.overlay.hide(),
  render: (container) => {
    container.innerHTML = '<div class="whiteboard-blank"></div>';
  },
};
