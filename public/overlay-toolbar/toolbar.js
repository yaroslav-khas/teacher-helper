// =====================================================================
// Панель кнопок оверлею малювання — окреме непрозоре вікно (toolbarWindow).
// Сама не малює нічого: кожна дія лише повідомляє main через toolbarApi,
// а main пересилає команду в canvasWindow (public/overlay/).
// =====================================================================

// pointerdown, а не click — на тачскріні дає миттєву реакцію без затримки
// на можливий подвійний тап (як і скрізь в основному вікні застосунку).
document.querySelectorAll('.swatch').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    window.toolbarApi.setColor(btn.dataset.color);
    window.toolbarApi.setErasing(false);
    document.getElementById('eraser').classList.remove('active');
    document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b === btn));
    // На тачскріні кнопка інакше лишається візуально "натиснутою"/у фокусі
    // назавжди — тут немає миші, яка природньо зняла б цей стан.
    e.currentTarget.blur();
  });
});

document.getElementById('width').addEventListener('input', (e) => {
  window.toolbarApi.setWidth(Number(e.target.value));
});

let erasing = false;
document.getElementById('eraser').addEventListener('pointerdown', (e) => {
  erasing = !erasing;
  window.toolbarApi.setErasing(erasing);
  e.currentTarget.classList.toggle('active', erasing);
  e.currentTarget.blur();
});

document.getElementById('clear').addEventListener('pointerdown', (e) => {
  window.toolbarApi.requestClear();
  e.currentTarget.blur();
});

const clickThroughBtn = document.getElementById('click-through');
clickThroughBtn.addEventListener('pointerdown', () => {
  window.toolbarApi.togglePassThrough();
});
// Стан може змінитись і не з цієї кнопки (глобальний Ctrl+Alt+D) — слухаємо
// джерело правди з main, а не тримаємо власний локальний прапорець.
window.toolbarApi.onPassThroughChanged((enabled) => {
  clickThroughBtn.classList.toggle('active', enabled);
});

document.getElementById('close').addEventListener('pointerdown', () => {
  window.toolbarApi.close();
});
