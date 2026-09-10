(() => {
  const NOTES_KEY = 'schedule:notes';

  const DAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця"];
  window.SCHEDULE_DAYS = DAYS;

  // "Режим роботи 2 класи" — початок/кінець кожного уроку.
  const DEFAULT_TIMES = [
    '8:30–9:10',
    '9:25–10:05',
    '10:20–11:00',
    '11:30–12:10',
    '12:25–13:05',
    '13:15–13:55',
    '14:00–14:40',
    '14:50–15:30',
  ];

  // 2-А, Івашків В.О.
  const DEFAULT_SUBJECTS = {
    Понеділок: [
      'Ранкова зустр.',
      'Математика',
      'Англ.I/укр.мова II',
      'Англ II/укр.мова I',
      'ЯДС',
      'Прогул./Тихе чит.',
      'ТПЗ "Умільчик"',
      'ЯДС',
    ],
    Вівторок: [
      'Ранкова зустр.',
      'Фіз.вих.I/укр.мов. II',
      'Фіз.вихII/укр.мов.I',
      'ЯДС',
      'Музика',
      'ЯДС. Укр.мова // I+II',
      'Прогул./Тихе чит.',
      'ТПЗ "Логіка"',
    ],
    Середа: [
      'Ранкова зустр.',
      'Математика',
      'ТПЗ "Хореограф."',
      'Англ.I/укр.мова II',
      'Англ II/укр.мова I',
      'ТПЗ "Барви"',
      'Прогул./Тихе чит.',
      'ЯДС. Укр.мова // I+II',
    ],
    Четвер: [
      'Англ.I/укр.мова II',
      'Англ II/укр.мова I',
      'Ранкова зустр.',
      'Математика',
      'ЯДС',
      'Фіз.виховання',
      'Прогул./Тихе чит.',
      'ЯДС',
    ],
    "П'ятниця": [
      'Ранкова зустр.',
      'Фіз.вих.I/укр.мов. II',
      'Фіз.вихII/укр.мов.I',
      'Христ.етика',
      'Образотв. мистецтв.',
      'ЯДС',
      'Прогул./Тихе чит.',
      'ТПЗ "Фін.грамот."',
    ],
  };

  // Те саме кольорове кодування, що й на паперовому розкладі — тримає
  // таблицю однаково легкою для сприйняття з відстані дошки.
  function subjectColorClass(text) {
    const t = text.toLowerCase();
    if (t.includes('ранков')) return 'schedule-cell-yellow';
    if (t.includes('прогул') || t.includes('тихе чит')) return 'schedule-cell-blue';
    if (t.includes('тпз')) return 'schedule-cell-green';
    return '';
  }

  // Розклад фіксований (редагування навмисно вимкнене — випадковий дотик по
  // клітинці міг зіпсувати час уроку), тож ніякого store тут більше немає:
  // завжди саме ці дані, без ризику застряглого биту "pppp" в часі уроку.
  function loadTimes() {
    return DEFAULT_TIMES;
  }

  function loadSubjects() {
    return DEFAULT_SUBJECTS;
  }

  async function loadNotes() {
    const saved = await window.boardApi.store.get(NOTES_KEY);
    return saved && typeof saved === 'object' ? saved : {};
  }

  // Спільна логіка "що зараз коїться за розкладом" — використовується і тут
  // (підсвітка таблиці), і глобально в shell.js (сповіщення "10 хв до кінця"
  // мають спрацьовувати незалежно від того, яка вкладка зараз відкрита).
  function parseRange(range) {
    const [start, end] = String(range).split(/[–—-]/).map((s) => s.trim());
    const toMinutes = (t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    return { start: toMinutes(start), end: toMinutes(end) };
  }

  function computeStatus(times, subjects, now = new Date()) {
    const dayIndex = now.getDay() - 1; // Пн=0 .. Пт=4; Нд/Сб — поза діапазоном
    if (dayIndex < 0 || dayIndex > 4) return { dayName: null };

    const dayName = DAYS[dayIndex];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const ranges = times.map(parseRange);
    const daySubjects = subjects[dayName] || [];

    for (let i = 0; i < ranges.length; i += 1) {
      const r = ranges[i];
      if (r.start == null || r.end == null) continue;
      if (nowMin >= r.start && nowMin < r.end) {
        return {
          dayName,
          periodIndex: i,
          subject: daySubjects[i] || '',
          remainingMinutes: r.end - nowMin,
          onBreak: false,
        };
      }
      const next = ranges[i + 1];
      if (next && next.start != null && nowMin >= r.end && nowMin < next.start) {
        return {
          dayName,
          onBreak: true,
          afterPeriodIndex: i,
          nextPeriodIndex: i + 1,
          nextSubject: daySubjects[i + 1] || '',
          minutesToNext: next.start - nowMin,
        };
      }
    }
    return { dayName, periodIndex: null, onBreak: false };
  }

  window.loadScheduleData = async () => {
    const [times, subjects] = await Promise.all([loadTimes(), loadSubjects()]);
    return { times, subjects };
  };
  window.computeScheduleStatus = computeStatus;

  function statusHeroHtml(status) {
    if (!status.dayName) {
      return `<div class="schedule-hero schedule-hero-off"><span class="schedule-hero-title">Сьогодні вихідний 🎉</span></div>`;
    }
    if (status.onBreak) {
      return `
        <div class="schedule-hero schedule-hero-break">
          <span class="schedule-hero-badge">☕ Перерва</span>
          <span class="schedule-hero-title">Далі: ${status.nextSubject || '—'}</span>
          <span class="schedule-hero-time">через ${status.minutesToNext} хв</span>
        </div>
      `;
    }
    if (status.periodIndex != null) {
      const soon = status.remainingMinutes <= 10;
      return `
        <div class="schedule-hero schedule-hero-live${soon ? ' schedule-hero-soon' : ''}">
          <span class="schedule-hero-badge"><span class="schedule-live-dot"></span> Зараз</span>
          <span class="schedule-hero-title">${status.subject || '—'}</span>
          <span class="schedule-hero-time">${soon ? '⏰ ' : '⏱ '}залишилось ${status.remainingMinutes} хв</span>
        </div>
      `;
    }
    return `<div class="schedule-hero schedule-hero-off"><span class="schedule-hero-title">Уроки на сьогодні ще не почались або вже завершились</span></div>`;
  }

  window.boardModes.schedule = {
    icon: '🗓️',
    label: 'Розклад',
    render: async (container) => {
      container.innerHTML = '<div class="placeholder">Завантаження розкладу…</div>';
      // Той самий захист від "застарілого" рендеру, що й у файлових
      // бібліотеках — якщо вчитель встигне перемкнутись на інший режим,
      // поки store.get ще в польоті, цей рендер не повинен нічого дописати.
      const myGeneration = window.getRenderGeneration();
      const isStale = () => window.getRenderGeneration() !== myGeneration;

      const [times, subjects, notes] = await Promise.all([loadTimes(), loadSubjects(), loadNotes()]);
      if (isStale()) return;

      container.innerHTML = `
        <div class="schedule-view">
          <div id="schedule-hero"></div>
          <table class="schedule-table">
            <thead>
              <tr>
                <th class="schedule-time-col">Час</th>
                ${DAYS.map((d) => `<th data-day="${d}">${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;

      const heroEl = container.querySelector('#schedule-hero');
      const tbody = container.querySelector('tbody');

      function saveNote(key, text) {
        notes[key] = text;
        if (!text) delete notes[key];
        window.boardApi.store.set(NOTES_KEY, notes);
      }

      for (let period = 0; period < 8; period += 1) {
        const row = document.createElement('tr');
        row.dataset.period = String(period);

        // Час рядком не влазить у вузьку колонку фіксованої ширини (вилазив
        // за межі клітинки) — розбиваємо початок/кінець на два рядки.
        const [startT, endT] = String(times[period] ?? '').split(/[–—-]/).map((s) => s.trim());
        const timeCell = document.createElement('td');
        timeCell.className = 'schedule-time-cell';
        timeCell.innerHTML = `
          <span class="schedule-period-num">${period + 1}</span>
          <span class="schedule-time-value">
            <span class="schedule-time-start">${startT ?? ''}</span>
            <span class="schedule-time-end">${endT ?? ''}</span>
          </span>
        `;
        row.appendChild(timeCell);

        DAYS.forEach((day) => {
          const text = (subjects[day] && subjects[day][period]) || '';
          const key = `${day}-${period}`;
          const hasNote = Boolean(notes[key]);

          const cell = document.createElement('td');
          cell.className = `schedule-cell ${subjectColorClass(text)}`;
          cell.dataset.day = day;
          cell.dataset.period = String(period);
          cell.innerHTML = `
            <div class="schedule-subject">${text}</div>
            <button class="schedule-note-btn${hasNote ? ' has-note' : ''}" title="Нотатка до уроку">🗨️</button>
            <textarea class="schedule-note-box" placeholder="Нотатка…" hidden>${notes[key] ?? ''}</textarea>
          `;

          const noteBtn = cell.querySelector('.schedule-note-btn');
          const noteBox = cell.querySelector('.schedule-note-box');
          noteBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            noteBox.hidden = !noteBox.hidden;
            if (!noteBox.hidden) noteBox.focus();
          });
          noteBox.addEventListener('blur', () => {
            const text = noteBox.value.trim();
            saveNote(key, text);
            noteBtn.classList.toggle('has-note', Boolean(text));
          });

          row.appendChild(cell);
        });

        tbody.appendChild(row);
      }

      // Підсвічуємо сьогоднішній день і "живий" урок/перерву, і оновлюємо
      // це кожні 20с, поки вкладка розкладу відкрита — той самий цикл, що
      // й у топбарного годинника.
      function refreshLiveState() {
        const status = computeStatus(times, subjects);
        heroEl.innerHTML = statusHeroHtml(status);

        container.querySelectorAll('th[data-day]').forEach((th) => {
          th.classList.toggle('schedule-today', th.dataset.day === status.dayName);
        });
        container.querySelectorAll('.schedule-cell').forEach((cell) => {
          const isCurrent =
            status.dayName === cell.dataset.day &&
            !status.onBreak &&
            String(status.periodIndex) === cell.dataset.period;
          cell.classList.toggle('schedule-cell-current', isCurrent);
        });
        container.querySelectorAll('.schedule-time-cell').forEach((tc) => {
          const row = tc.closest('tr');
          const isCurrentRow =
            status.dayName != null && !status.onBreak && String(status.periodIndex) === row.dataset.period;
          tc.classList.toggle('schedule-time-current', isCurrentRow);
        });
      }

      refreshLiveState();
      const liveInterval = setInterval(refreshLiveState, 20_000);
      window.boardModes.schedule.__liveInterval = liveInterval;
    },
    onDeactivate: () => {
      if (window.boardModes.schedule.__liveInterval) {
        clearInterval(window.boardModes.schedule.__liveInterval);
        window.boardModes.schedule.__liveInterval = null;
      }
    },
  };
})();
