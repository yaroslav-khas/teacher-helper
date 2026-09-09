window.boardWidgets = {
  clock: {
    label: '🕒 Годинник',
    create: () => {
      const el = document.createElement('div');
      el.className = 'widget widget-clock';
      el.innerHTML = '<span class="widget-time"></span>';
      const timeEl = el.querySelector('.widget-time');

      const tick = () => {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
      };
      tick();
      const intervalId = setInterval(tick, 1000);
      el.dataset.intervalId = String(intervalId);

      return el;
    },
    destroy: (el) => clearInterval(Number(el.dataset.intervalId)),
  },
};

function makeDraggable(el, onDragEnd) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    el.style.left = `${e.clientX - offsetX}px`;
    el.style.top = `${e.clientY - offsetY}px`;
  });

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    onDragEnd(el.offsetLeft, el.offsetTop);
  };

  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

window.mountWidget = async function mountWidget(id) {
  const def = window.boardWidgets[id];
  if (!def) return null;

  const el = def.create();
  el.style.position = 'absolute';

  const savedPos = await window.boardApi.store.get(`widget:${id}:pos`);
  el.style.left = `${savedPos?.x ?? 24}px`;
  el.style.top = `${savedPos?.y ?? 24}px`;

  makeDraggable(el, (x, y) => window.boardApi.store.set(`widget:${id}:pos`, { x, y }));

  document.getElementById('widget-layer').appendChild(el);
  return el;
};

window.unmountWidget = function unmountWidget(id, el) {
  window.boardWidgets[id]?.destroy?.(el);
  el.remove();
};
