// =====================================================================
// Харчування — облік того, скільки батьки здали грошей і що дитина їла
// щодня. Уся бізнес-логіка й дані живуть на сервері (oop-poruch-bot,
// meals-api.js); цей файл лише малює екрани й реагує на дії вчительки.
//
// Структура: екран прив'язки пристрою (поки немає токена) → вкладки
// «День» / «Баланси» / «Учні й тариф», плюс картка учня (ledger) як
// drill-down з балансів. Той самий підхід до "застарілого" async-рендеру,
// що й у file-library.js/schedule-mode.js: window.getRenderGeneration()
// ловить перемикання на інший режим ЗАСТОСУНКУ, локальний viewToken —
// швидке перемикання вкладок ВСЕРЕДИНІ цього режиму.
// =====================================================================

(() => {
  // --- дрібні хелпери ----------------------------------------------------

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);
  }

  function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayIso() {
    return toIsoDate(new Date());
  }

  function shiftIsoDate(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return toIsoDate(dt);
  }

  function formatIsoDateHuman(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    try {
      return new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' }).format(dt);
    } catch {
      return iso;
    }
  }

  function mealsErrorMessage(err) {
    if (!(err instanceof window.mealsApi.MealsApiError)) return 'Сталася помилка';
    switch (err.code) {
      case 'network_error':
        return 'Немає з’єднання з сервером';
      case 'not_found':
        return 'Код невірний або вже використаний';
      case 'expired':
        return 'Код прострочений — згенеруйте новий у боті';
      case 'access_revoked':
        return 'Немає доступу — зверніться до власника бота';
      case 'no_token':
      case 'invalid_token':
        return 'Пристрій не прив’язано';
      case 'pupil_not_found':
        return 'Учня не знайдено';
      case 'bad_date':
        return 'Некоректна дата';
      case 'bad_amount':
        return 'Некоректна сума';
      case 'bad_pupil_ids':
      case 'bad_pupil_id':
        return 'Оберіть хоча б одного учня';
      case 'bad_entries':
        return 'Заповніть поле';
      case 'empty_patch':
        return 'Немає що зберігати';
      default:
        return `Помилка: ${err.code}`;
    }
  }

  function flashError(host, msg) {
    const el = host.querySelector('.meals-inline-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => {
      el.hidden = true;
    }, 4000);
  }

  // --- модальне вікно (форми поповнень/списань/учнів/тарифу) -------------

  function openModal({ title, bodyHtml, submitLabel = 'Зберегти', onSubmit, onMount }) {
    const overlay = document.createElement('div');
    overlay.className = 'meals-modal-overlay';
    overlay.innerHTML = `
      <div class="meals-modal-card">
        <div class="meals-modal-header">
          <span>${title}</span>
          <button class="meals-modal-close" title="Закрити">✖️</button>
        </div>
        <div class="meals-modal-body">${bodyHtml}</div>
        <div class="meals-modal-status"></div>
        <div class="meals-modal-actions">
          ${onSubmit ? `<button class="meals-modal-submit settings-btn settings-btn-blue">${submitLabel}</button>` : ''}
          <button class="meals-modal-cancel settings-btn settings-btn-neutral">Скасувати</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const card = overlay.querySelector('.meals-modal-card');
    const statusEl = overlay.querySelector('.meals-modal-status');
    const close = () => overlay.remove();
    const setStatus = (msg) => {
      statusEl.textContent = msg || '';
    };

    overlay.querySelector('.meals-modal-close').addEventListener('pointerdown', close);
    overlay.querySelector('.meals-modal-cancel').addEventListener('pointerdown', close);
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close();
    });

    onMount?.({ card, close, setStatus });

    const submitBtn = overlay.querySelector('.meals-modal-submit');
    if (submitBtn && onSubmit) {
      submitBtn.addEventListener('pointerdown', async () => {
        submitBtn.disabled = true;
        setStatus('');
        try {
          await onSubmit({ card, close, setStatus });
        } catch (err) {
          setStatus(mealsErrorMessage(err));
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    return { card, close, setStatus };
  }

  function confirmModal(title, bodyText, onConfirm, submitLabel = 'Видалити') {
    openModal({
      title,
      bodyHtml: `<p>${escapeHtml(bodyText)}</p>`,
      submitLabel,
      onSubmit: async ({ close }) => {
        await onConfirm();
        close();
      },
    });
  }

  // --- стан ----------------------------------------------------------------

  let mountedContainer = null;
  let viewBodyEl = null;
  let modeGeneration = 0;
  let viewToken = 0;

  const state = {
    view: 'day',
    date: todayIso(),
    selectedPupilId: null,
    balances: null, // кеш для списку учнів у формі "списання групі"
    ledger: null,
  };

  function isStale(gen, vt) {
    return window.getRenderGeneration() !== gen || viewToken !== vt;
  }

  function switchView(view) {
    state.view = view;
    if (view !== 'pupil') state.selectedPupilId = null;
    viewToken += 1;
    renderCurrentView();
  }

  function refreshAfterLedgerChange() {
    if (!viewBodyEl) return;
    if (state.view === 'pupil') loadLedger(viewBodyEl);
    else if (state.view === 'balances') loadBalances(viewBodyEl);
  }

  // --- екран прив'язки пристрою ---------------------------------------------

  function renderPairing(container) {
    container.innerHTML = `
      <div class="meals-pairing">
        <div class="meals-pairing-card">
          <h2>🍲 Харчування</h2>
          <p>У боті: «🍲 Харчування» → «🔗 Прив'язати пристрій» — отримайте одноразовий код (дійсний 10 хв) і введіть його тут.</p>
          <input id="meals-pair-code" type="text" maxlength="8" placeholder="Код (8 символів)" autocomplete="off" />
          <input id="meals-pair-label" type="text" placeholder="Назва пристрою, напр. «Клас 2-А» (необов'язково)" autocomplete="off" />
          <button id="meals-pair-submit" class="settings-btn settings-btn-blue">Прив'язати</button>
          <div class="meals-pairing-status"></div>
        </div>
      </div>
    `;

    const codeInput = container.querySelector('#meals-pair-code');
    const labelInput = container.querySelector('#meals-pair-label');
    const submitBtn = container.querySelector('#meals-pair-submit');
    const statusEl = container.querySelector('.meals-pairing-status');

    codeInput.addEventListener('input', () => {
      const pos = codeInput.selectionStart;
      codeInput.value = codeInput.value.toUpperCase().replace(/\s+/g, '');
      codeInput.setSelectionRange(pos, pos);
    });

    const submit = async () => {
      const code = codeInput.value.trim();
      if (!code) return;
      submitBtn.disabled = true;
      statusEl.textContent = '';
      try {
        await window.mealsApi.pair(code, labelInput.value.trim() || undefined);
        if (mountedContainer !== container) return; // режим уже покинули, поки чекали відповідь
        // Скидаємо на "День" явно (а не через switchView(), який тут ще
        // нічого не зробив би — viewBodyEl з'являється лише всередині
        // renderShell нижче): після повторної прив'язки не варто лишати
        // старий selectedPupilId/вкладку від сесії до відкликання токена.
        state.view = 'day';
        state.selectedPupilId = null;
        viewToken += 1;
        renderShell(container);
      } catch (err) {
        statusEl.textContent = mealsErrorMessage(err);
      } finally {
        submitBtn.disabled = false;
      }
    };

    submitBtn.addEventListener('pointerdown', submit);
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  // --- каркас з вкладками ----------------------------------------------------

  const TABS = [
    { id: 'day', label: '📅 День' },
    { id: 'balances', label: '💰 Баланси' },
    { id: 'settings', label: '⚙️ Учні й тариф' },
  ];

  function renderShell(container) {
    container.innerHTML = `
      <div class="meals-shell">
        <div class="meals-subnav">
          ${TABS.map((t) => `<button class="meals-tab" data-view="${t.id}">${t.label}</button>`).join('')}
          <span class="meals-teacher-name"></span>
        </div>
        <div class="meals-view-body"></div>
      </div>
    `;

    container.querySelectorAll('.meals-tab').forEach((btn) => {
      btn.addEventListener('pointerdown', () => switchView(btn.dataset.view));
    });

    viewBodyEl = container.querySelector('.meals-view-body');

    window.mealsApi.getTeacherName().then((name) => {
      const el = container.querySelector('.meals-teacher-name');
      if (el && name) el.textContent = `👤 ${name}`;
    });

    renderCurrentView();
  }

  function updateTabsActive() {
    mountedContainer?.querySelectorAll('.meals-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === state.view);
    });
  }

  function renderCurrentView() {
    if (!mountedContainer || !viewBodyEl) return;
    updateTabsActive();

    if (state.view === 'balances') renderBalancesView(viewBodyEl);
    else if (state.view === 'pupil') renderPupilView(viewBodyEl);
    else if (state.view === 'settings') renderSettingsView(viewBodyEl);
    else renderDayView(viewBodyEl);
  }

  // --- вкладка "День" ----------------------------------------------------

  function renderDayView(host) {
    host.innerHTML = `
      <div class="meals-day-header">
        <button class="meals-date-nav" data-dir="-1" title="Попередній день">◀</button>
        <span class="meals-date-label"></span>
        <button class="meals-date-nav" data-dir="1" title="Наступний день">▶</button>
        <button class="meals-today-btn">Сьогодні</button>
        <span class="meals-day-totals"></span>
      </div>
      <div class="meals-inline-error" hidden></div>
      <div class="meals-day-table-wrap">
        <table class="meals-day-table">
          <thead>
            <tr>
              <th class="meals-col-num">№</th>
              <th class="meals-col-name">ПІБ</th>
              <th>Перше</th>
              <th>М'ясне</th>
              <th>Гарнір</th>
              <th>Позначка</th>
              <th>Сума</th>
              <th>Пресети</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    host.querySelectorAll('.meals-date-nav').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        state.date = shiftIsoDate(state.date, Number(btn.dataset.dir));
        loadDayData(host);
      });
    });
    host.querySelector('.meals-today-btn').addEventListener('pointerdown', () => {
      state.date = todayIso();
      loadDayData(host);
    });

    loadDayData(host);
  }

  async function loadDayData(host) {
    const gen = modeGeneration;
    const vt = viewToken;
    host.querySelector('.meals-date-label').textContent = formatIsoDateHuman(state.date);
    const tbody = host.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="meals-loading">Завантаження…</td></tr>';

    let data;
    try {
      data = await window.mealsApi.getDay(state.date);
    } catch (err) {
      if (isStale(gen, vt)) return;
      tbody.innerHTML = `<tr><td colspan="8" class="meals-error">${escapeHtml(mealsErrorMessage(err))}</td></tr>`;
      return;
    }
    if (isStale(gen, vt)) return;

    renderDayTable(host, data);
  }

  function renderDayTable(host, data) {
    host.querySelector('.meals-day-totals').textContent =
      `Σ ${data.totals.total} грн · їли ${data.totals.ate} · не їли ${data.totals.absent}`;

    const tbody = host.querySelector('tbody');
    tbody.innerHTML = '';

    if (data.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="meals-empty">Немає учнів — додайте їх у вкладці «Учні й тариф»</td></tr>';
      return;
    }

    data.rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="meals-col-num">${index + 1}</td>
        <td class="meals-col-name">${escapeHtml(row.fullName)}</td>
        <td class="meals-col-check"><input type="checkbox" data-flag="first" ${row.first ? 'checked' : ''} /></td>
        <td class="meals-col-check"><input type="checkbox" data-flag="main" ${row.main ? 'checked' : ''} /></td>
        <td class="meals-col-check"><input type="checkbox" data-flag="side" ${row.side ? 'checked' : ''} /></td>
        <td class="meals-mark">${escapeHtml(row.mark || 'Н')}</td>
        <td class="meals-amount">${row.amount} грн</td>
        <td class="meals-presets">
          <button data-preset="first" title="Перше">І</button>
          <button data-preset="main-side" title="М'ясне+гарнір">ІІ</button>
          <button data-preset="all" title="Усе">І+ІІ</button>
          <button data-preset="none" title="Нічого">Н</button>
        </td>
      `;

      const readFlags = () => ({
        first: tr.querySelector('[data-flag="first"]').checked,
        main: tr.querySelector('[data-flag="main"]').checked,
        side: tr.querySelector('[data-flag="side"]').checked,
      });

      const commit = async (next) => {
        tr.classList.add('meals-row-saving');
        try {
          const updated = await window.mealsApi.setDay(state.date, [{ pupilId: row.pupilId, ...next }]);
          if (isStale(modeGeneration, viewToken)) return;
          renderDayTable(host, updated);
        } catch (err) {
          if (isStale(modeGeneration, viewToken)) return;
          renderDayTable(host, data); // відкат чекбоксів до останнього відомого стану з сервера
          flashError(host, mealsErrorMessage(err));
        }
      };

      tr.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => commit(readFlags()));
      });

      tr.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('pointerdown', () => {
          const preset = btn.dataset.preset;
          const next =
            preset === 'first'
              ? { first: true, main: false, side: false }
              : preset === 'main-side'
                ? { first: false, main: true, side: true }
                : preset === 'all'
                  ? { first: true, main: true, side: true }
                  : { first: false, main: false, side: false };
          commit(next);
        });
      });

      tbody.appendChild(tr);
    });
  }

  // --- вкладка "Баланси" ----------------------------------------------------

  function renderBalancesView(host) {
    host.innerHTML = `
      <div class="meals-balances-header">
        <button id="meals-add-topup" class="settings-btn settings-btn-blue">➕ Поповнення</button>
        <button id="meals-add-deduction" class="settings-btn settings-btn-neutral">➖ Списання групі</button>
      </div>
      <div class="meals-inline-error" hidden></div>
      <div class="meals-balances-list"><div class="meals-loading">Завантаження…</div></div>
    `;

    host.querySelector('#meals-add-topup').addEventListener('pointerdown', () => openTopupModal());
    host.querySelector('#meals-add-deduction').addEventListener('pointerdown', () => openDeductionModal());

    loadBalances(host);
  }

  async function loadBalances(host) {
    const gen = modeGeneration;
    const vt = viewToken;
    const listEl = host.querySelector('.meals-balances-list');

    let data, pupilsData;
    try {
      // /balances сортує за боргом (боржники першими) — зручно для іншого
      // сценарію, але тут учителька читає список так само, як паперовий
      // журнал, тож переставляємо в порядок класу за /pupils (position).
      // Той самий стан (state.balances) далі використовує й форма
      // групового списання — вона так само має бути в порядку класу.
      [data, pupilsData] = await Promise.all([window.mealsApi.getBalances(), window.mealsApi.listPupils()]);
    } catch (err) {
      if (isStale(gen, vt)) return;
      listEl.innerHTML = `<div class="meals-error">${escapeHtml(mealsErrorMessage(err))}</div>`;
      return;
    }
    if (isStale(gen, vt)) return;

    const positionById = new Map(pupilsData.pupils.map((p) => [p.id, p.position]));
    const sortedPupils = [...data.pupils].sort(
      (a, b) => (positionById.get(a.pupilId) ?? 0) - (positionById.get(b.pupilId) ?? 0),
    );
    data = { ...data, pupils: sortedPupils };

    state.balances = data;
    listEl.innerHTML = '';

    if (data.pupils.length === 0) {
      listEl.innerHTML = '<div class="meals-empty">Немає учнів</div>';
      return;
    }

    data.pupils.forEach((p) => {
      const row = document.createElement('button');
      row.className = 'meals-balance-row';
      row.innerHTML = `
        <span class="meals-balance-name">${escapeHtml(p.fullName)}</span>
        <span class="meals-balance-amount${p.balance < 0 ? ' meals-negative' : ''}">${p.balance} грн</span>
      `;
      row.addEventListener('pointerdown', () => {
        state.selectedPupilId = p.pupilId;
        switchView('pupil');
      });
      listEl.appendChild(row);
    });
  }

  // --- картка учня (ledger) --------------------------------------------------

  function renderPupilView(host) {
    host.innerHTML = `
      <div class="meals-pupil-header">
        <button id="meals-pupil-back" class="settings-icon-btn" title="Назад до балансів">←</button>
        <span class="meals-pupil-name"></span>
        <span class="meals-pupil-balance"></span>
        <button id="meals-pupil-topup" class="settings-btn settings-btn-blue">➕ Поповнення</button>
      </div>
      <div class="meals-inline-error" hidden></div>
      <div class="meals-pupil-body"><div class="meals-loading">Завантаження…</div></div>
    `;

    host.querySelector('#meals-pupil-back').addEventListener('pointerdown', () => switchView('balances'));
    host.querySelector('#meals-pupil-topup').addEventListener('pointerdown', () => {
      openTopupModal(state.selectedPupilId, state.ledger?.fullName);
    });

    loadLedger(host);
  }

  async function loadLedger(host) {
    const gen = modeGeneration;
    const vt = viewToken;
    const pupilId = state.selectedPupilId;
    const bodyEl = host.querySelector('.meals-pupil-body');

    let data;
    try {
      data = await window.mealsApi.getLedger(pupilId);
    } catch (err) {
      if (isStale(gen, vt)) return;
      bodyEl.innerHTML = `<div class="meals-error">${escapeHtml(mealsErrorMessage(err))}</div>`;
      return;
    }
    if (isStale(gen, vt)) return;

    state.ledger = data;

    host.querySelector('.meals-pupil-name').textContent = data.fullName;
    const balEl = host.querySelector('.meals-pupil-balance');
    balEl.textContent = `${data.balance} грн`;
    balEl.classList.toggle('meals-negative', data.balance < 0);

    const mealsRows = (data.meals || [])
      .map((m) => `<tr><td>${escapeHtml(m.date)}</td><td>${escapeHtml(m.mark || '')}</td><td>-${m.amount} грн</td></tr>`)
      .join('');
    const topupRows = (data.topups || [])
      .map(
        (t) => `
        <tr>
          <td>${escapeHtml(t.date)}</td>
          <td>+${t.amount} грн</td>
          <td>${escapeHtml(t.note || '')}</td>
          <td class="meals-row-actions">
            <button class="meals-icon-btn-small" data-action="edit-topup" data-id="${t.id}" title="Редагувати">✏️</button>
            <button class="meals-icon-btn-small" data-action="delete-topup" data-id="${t.id}" title="Видалити">🗑️</button>
          </td>
        </tr>`,
      )
      .join('');
    const deductionRows = (data.deductions || [])
      .map(
        (d) => `
        <tr>
          <td>${escapeHtml(d.date)}</td>
          <td>-${d.amount} грн</td>
          <td>${escapeHtml(d.reason || '')}${d.batchId ? ' <span class="meals-batch-badge" title="Частина групового списання">👥</span>' : ''}</td>
          <td class="meals-row-actions">
            <button class="meals-icon-btn-small" data-action="edit-deduction" data-id="${d.id}" title="Редагувати">✏️</button>
            <button class="meals-icon-btn-small" data-action="delete-deduction" data-id="${d.id}" title="Видалити">🗑️</button>
          </td>
        </tr>`,
      )
      .join('');

    bodyEl.innerHTML = `
      <section class="meals-ledger-section">
        <h3>Харчування</h3>
        <table class="meals-ledger-table"><tbody>${mealsRows || '<tr><td class="meals-empty">Немає записів</td></tr>'}</tbody></table>
      </section>
      <section class="meals-ledger-section">
        <h3>Поповнення</h3>
        <table class="meals-ledger-table"><tbody>${topupRows || '<tr><td class="meals-empty">Немає записів</td></tr>'}</tbody></table>
      </section>
      <section class="meals-ledger-section">
        <h3>Списання</h3>
        <table class="meals-ledger-table"><tbody>${deductionRows || '<tr><td class="meals-empty">Немає записів</td></tr>'}</tbody></table>
      </section>
    `;

    bodyEl.querySelectorAll('[data-action="edit-topup"]').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        const t = data.topups.find((x) => String(x.id) === btn.dataset.id);
        if (t) openTopupModal(pupilId, data.fullName, t);
      });
    });
    bodyEl.querySelectorAll('[data-action="delete-topup"]').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        confirmModal('Видалити поповнення?', 'Дію не можна скасувати.', async () => {
          await window.mealsApi.deleteTopup(btn.dataset.id);
          refreshAfterLedgerChange();
        });
      });
    });
    bodyEl.querySelectorAll('[data-action="edit-deduction"]').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        const d = data.deductions.find((x) => String(x.id) === btn.dataset.id);
        if (d) openDeductionEditModal(d);
      });
    });
    bodyEl.querySelectorAll('[data-action="delete-deduction"]').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        confirmModal('Видалити списання?', 'Дію не можна скасувати.', async () => {
          await window.mealsApi.deleteDeduction(btn.dataset.id);
          refreshAfterLedgerChange();
        });
      });
    });
  }

  // --- форми поповнення / списання ------------------------------------------

  function openTopupModal(pupilId, pupilName, existing) {
    const isEdit = Boolean(existing);
    const needsPupilPicker = !pupilId;
    const pupilOptions = needsPupilPicker
      ? (state.balances?.pupils || [])
          .map((p) => `<option value="${p.pupilId}">${escapeHtml(p.fullName)}</option>`)
          .join('')
      : '';

    openModal({
      title: isEdit ? 'Редагувати поповнення' : 'Нове поповнення',
      submitLabel: isEdit ? 'Зберегти' : 'Додати',
      bodyHtml: `
        ${
          needsPupilPicker
            ? `<label>Учень<select id="meals-topup-pupil">${pupilOptions}</select></label>`
            : `<div class="meals-modal-subject">${escapeHtml(pupilName || '')}</div>`
        }
        <label>Дата<input id="meals-topup-date" type="date" value="${existing?.date || todayIso()}" /></label>
        <label>Сума (грн)<input id="meals-topup-amount" type="number" min="0" step="1" value="${existing?.amount ?? ''}" /></label>
        <label>Примітка<input id="meals-topup-note" type="text" value="${escapeHtml(existing?.note || '')}" /></label>
      `,
      onSubmit: async ({ card, close }) => {
        const date = card.querySelector('#meals-topup-date').value;
        const amount = Number(card.querySelector('#meals-topup-amount').value);
        const note = card.querySelector('#meals-topup-note').value.trim();
        const targetPupilId = needsPupilPicker ? card.querySelector('#meals-topup-pupil').value : pupilId;

        if (!targetPupilId) throw new window.mealsApi.MealsApiError('bad_pupil_ids', 400);
        if (!date) throw new window.mealsApi.MealsApiError('bad_date', 400);
        if (!Number.isFinite(amount) || amount <= 0) throw new window.mealsApi.MealsApiError('bad_amount', 400);

        if (isEdit) {
          await window.mealsApi.patchTopup(existing.id, { date, amount, note: note || undefined });
        } else {
          await window.mealsApi.addTopup(targetPupilId, date, amount, note || undefined);
        }
        close();
        refreshAfterLedgerChange();
      },
    });
  }

  function openDeductionModal() {
    const pupils = state.balances?.pupils || [];
    const checkboxRows = pupils
      .map(
        (p) => `
        <label class="meals-checkbox-row">
          <input type="checkbox" value="${p.pupilId}" />
          ${escapeHtml(p.fullName)}
        </label>`,
      )
      .join('');

    openModal({
      title: 'Списання групі',
      submitLabel: 'Списати',
      bodyHtml: `
        <div class="meals-checkbox-list-actions">
          <button type="button" class="meals-select-all">Обрати всіх</button>
          <button type="button" class="meals-select-none">Зняти всіх</button>
        </div>
        <div class="meals-checkbox-list">${checkboxRows || '<p>Немає учнів</p>'}</div>
        <label>Дата<input id="meals-deduct-date" type="date" value="${todayIso()}" /></label>
        <label>Сума на учня (грн)<input id="meals-deduct-amount" type="number" min="0" step="1" /></label>
        <label>Причина<input id="meals-deduct-reason" type="text" placeholder="напр. Екскурсія" /></label>
      `,
      // 30 окремих дотиків для "уся група" — типовий сценарій (екскурсія
      // всім класом) — не мало сенсу; select all/none, а решту вручну
      // зняти/додати (напр. відсутніх).
      onMount: ({ card }) => {
        card.querySelector('.meals-select-all').addEventListener('pointerdown', () => {
          card.querySelectorAll('.meals-checkbox-list input[type="checkbox"]').forEach((cb) => {
            cb.checked = true;
          });
        });
        card.querySelector('.meals-select-none').addEventListener('pointerdown', () => {
          card.querySelectorAll('.meals-checkbox-list input[type="checkbox"]').forEach((cb) => {
            cb.checked = false;
          });
        });
      },
      onSubmit: async ({ card, close, setStatus }) => {
        const date = card.querySelector('#meals-deduct-date').value;
        const amount = Number(card.querySelector('#meals-deduct-amount').value);
        const reason = card.querySelector('#meals-deduct-reason').value.trim();
        const pupilIds = Array.from(card.querySelectorAll('.meals-checkbox-list input:checked')).map((i) => i.value);

        if (pupilIds.length === 0) throw new window.mealsApi.MealsApiError('bad_pupil_ids', 400);
        if (!date) throw new window.mealsApi.MealsApiError('bad_date', 400);
        if (!Number.isFinite(amount) || amount <= 0) throw new window.mealsApi.MealsApiError('bad_amount', 400);
        if (!reason) throw new window.mealsApi.MealsApiError('bad_entries', 400);

        const result = await window.mealsApi.addDeduction(pupilIds, date, amount, reason);
        refreshAfterLedgerChange();

        // MEALS_INTEGRATION.md прямо підказує цей сценарій для batchId:
        // "скасувати всю операцію" = DELETE кожного рядка з тим самим
        // batchId. Сервер не дає списку "рядки за batchId" напряму, але
        // саме зараз pupilIds цієї партії вже під рукою (дешевше й
        // надійніше, ніж шукати їх пізніше по всьому класу) — тож даємо
        // миттєве "скасувати", поки форма ще відкрита.
        card.querySelector('.meals-modal-body').innerHTML =
          `<p>Списано ${amount} грн на ${pupilIds.length} учнів (${escapeHtml(reason)}).</p>`;
        card.querySelector('.meals-modal-actions').innerHTML = `
          <button class="meals-modal-undo settings-btn settings-btn-red">↩️ Скасувати всю операцію</button>
          <button class="meals-modal-done settings-btn settings-btn-neutral">Готово</button>
        `;
        card.querySelector('.meals-modal-done').addEventListener('pointerdown', close);
        card.querySelector('.meals-modal-undo').addEventListener('pointerdown', async () => {
          setStatus('Скасовую…');
          try {
            await Promise.all(
              pupilIds.map(async (pid) => {
                const ledger = await window.mealsApi.getLedger(pid);
                const match = (ledger.deductions || []).find((d) => d.batchId === result.batchId);
                if (match) await window.mealsApi.deleteDeduction(match.id);
              }),
            );
            close();
            refreshAfterLedgerChange();
          } catch (err) {
            setStatus(mealsErrorMessage(err));
          }
        });
      },
    });
  }

  // Редагування ОДНОГО рядка групового списання — стосується лише цієї
  // дитини, не всієї групи (сервер не приймає зміну складу групи в PATCH).
  function openDeductionEditModal(existing) {
    openModal({
      title: 'Редагувати списання',
      submitLabel: 'Зберегти',
      bodyHtml: `
        <p class="meals-modal-hint">Зміна стосується лише цього запису, не всієї групи.</p>
        <label>Дата<input id="meals-deduct-date" type="date" value="${existing.date}" /></label>
        <label>Сума (грн)<input id="meals-deduct-amount" type="number" min="0" step="1" value="${existing.amount}" /></label>
        <label>Причина<input id="meals-deduct-reason" type="text" value="${escapeHtml(existing.reason || '')}" /></label>
      `,
      onSubmit: async ({ card, close }) => {
        const date = card.querySelector('#meals-deduct-date').value;
        const amount = Number(card.querySelector('#meals-deduct-amount').value);
        const reason = card.querySelector('#meals-deduct-reason').value.trim();

        if (!date) throw new window.mealsApi.MealsApiError('bad_date', 400);
        if (!Number.isFinite(amount) || amount <= 0) throw new window.mealsApi.MealsApiError('bad_amount', 400);
        if (!reason) throw new window.mealsApi.MealsApiError('bad_entries', 400);

        await window.mealsApi.patchDeduction(existing.id, { date, amount, reason });
        close();
        refreshAfterLedgerChange();
      },
    });
  }

  // --- вкладка "Учні й тариф" -------------------------------------------------

  function renderSettingsView(host) {
    host.innerHTML = `
      <div class="meals-inline-error" hidden></div>
      <section class="meals-settings-section">
        <h3>Тариф харчування (грн/день)</h3>
        <div class="meals-prices-form">
          <label>Перше<input id="meals-price-first" type="number" min="0" step="1" /></label>
          <label>М'ясне<input id="meals-price-main" type="number" min="0" step="1" /></label>
          <label>Гарнір<input id="meals-price-side" type="number" min="0" step="1" /></label>
          <button id="meals-prices-save" class="settings-btn settings-btn-blue">Зберегти тариф</button>
        </div>
        <div class="meals-prices-meta"></div>
      </section>
      <section class="meals-settings-section">
        <h3>Учні</h3>
        <div class="meals-pupils-list"><div class="meals-loading">Завантаження…</div></div>
        <div class="meals-add-pupil-row">
          <input id="meals-new-pupil-name" type="text" placeholder="ПІБ нового учня" />
          <button id="meals-add-pupil-btn" class="settings-btn settings-btn-blue">➕ Додати учня</button>
        </div>
      </section>
    `;

    host.querySelector('#meals-prices-save').addEventListener('pointerdown', async () => {
      const first = Number(host.querySelector('#meals-price-first').value);
      const main = Number(host.querySelector('#meals-price-main').value);
      const side = Number(host.querySelector('#meals-price-side').value);
      if (![first, main, side].every((n) => Number.isFinite(n) && n >= 0)) {
        flashError(host, 'Некоректний тариф');
        return;
      }
      try {
        await window.mealsApi.setPrices(first, main, side);
        loadPrices(host);
      } catch (err) {
        flashError(host, mealsErrorMessage(err));
      }
    });

    host.querySelector('#meals-add-pupil-btn').addEventListener('pointerdown', async () => {
      const input = host.querySelector('#meals-new-pupil-name');
      const fullName = input.value.trim();
      if (!fullName) return;
      try {
        await window.mealsApi.addPupil(fullName);
        input.value = '';
        loadPupilsList(host);
      } catch (err) {
        flashError(host, mealsErrorMessage(err));
      }
    });

    loadPrices(host);
    loadPupilsList(host);
  }

  async function loadPrices(host) {
    const gen = modeGeneration;
    const vt = viewToken;
    let data;
    try {
      data = await window.mealsApi.getPrices();
    } catch (err) {
      if (isStale(gen, vt)) return;
      flashError(host, mealsErrorMessage(err));
      return;
    }
    if (isStale(gen, vt)) return;

    host.querySelector('#meals-price-first').value = data.first;
    host.querySelector('#meals-price-main').value = data.main;
    host.querySelector('#meals-price-side').value = data.side;
    // updatedBy — це числовий Telegram id, а не ім'я (MEALS_INTEGRATION.md),
    // показувати його вчительці немає сенсу — натомість дата останньої зміни.
    const metaEl = host.querySelector('.meals-prices-meta');
    if (metaEl) {
      metaEl.textContent = data.updatedAt ? `Востаннє змінено: ${new Date(data.updatedAt).toLocaleString('uk-UA')}` : '';
    }
  }

  // GET /pupils повертає ЛИШЕ активних учнів (MEALS_INTEGRATION.md: "Активні
  // учні, у порядку списку") — вибулий учень зникає з цього списку і звідси
  // його вже нічим не повернути (немає ендпоінту "список вибулих"), тому
  // "Позначити вибулим" — по суті необоротна дія з погляду цього екрана, і
  // варта підтвердження. Історія вибулого лишається доступною через
  // /pupil/:id/ledger, просто не з цього списку.
  async function loadPupilsList(host) {
    const gen = modeGeneration;
    const vt = viewToken;
    let data;
    try {
      data = await window.mealsApi.listPupils();
    } catch (err) {
      if (isStale(gen, vt)) return;
      host.querySelector('.meals-pupils-list').innerHTML =
        `<div class="meals-error">${escapeHtml(mealsErrorMessage(err))}</div>`;
      return;
    }
    if (isStale(gen, vt)) return;

    const listEl = host.querySelector('.meals-pupils-list');
    listEl.innerHTML = '';

    if (data.pupils.length === 0) {
      listEl.innerHTML = '<div class="meals-empty">Ще немає учнів</div>';
      return;
    }

    data.pupils.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'meals-pupil-row';
      row.innerHTML = `
        <span class="meals-pupil-row-name">${escapeHtml(p.fullName)}</span>
        <button class="settings-icon-btn" data-action="rename" title="Перейменувати">✏️</button>
        <button class="settings-icon-btn" data-action="withdraw" title="Позначити вибулим">🚫</button>
      `;
      row.querySelector('[data-action="rename"]').addEventListener('pointerdown', () => openRenamePupilModal(p, host));
      row.querySelector('[data-action="withdraw"]').addEventListener('pointerdown', () => {
        confirmModal(
          'Позначити вибулим?',
          `${p.fullName} зникне зі списків дня/балансів. Історію можна буде знайти лише за прямим посиланням на картку учня.`,
          async () => {
            await window.mealsApi.updatePupil(p.id, { active: false });
            loadPupilsList(host);
          },
          'Позначити вибулим',
        );
      });
      listEl.appendChild(row);
    });
  }

  function openRenamePupilModal(pupil, host) {
    openModal({
      title: 'Перейменувати учня',
      bodyHtml: `<label>ПІБ<input id="meals-rename-input" type="text" value="${escapeHtml(pupil.fullName)}" /></label>`,
      onSubmit: async ({ card, close }) => {
        const fullName = card.querySelector('#meals-rename-input').value.trim();
        if (!fullName) throw new window.mealsApi.MealsApiError('bad_entries', 400);
        await window.mealsApi.updatePupil(pupil.id, { fullName });
        close();
        loadPupilsList(host);
      },
    });
  }

  // --- реєстрація режиму -------------------------------------------------

  // 401/403 можуть прийти в будь-яку мить (роль забрали в боті поки вчителька
  // саме на цьому екрані) — а не лише при явному запиті. Показуємо екран
  // прив'язки заново одразу, а не залишаємо застосунок висіти на неробочому
  // екрані з даними, які сервер більше не визнає.
  window.mealsApi.setOnAuthInvalid(() => {
    if (!mountedContainer) return;
    renderPairing(mountedContainer);
  });

  window.boardModes.meals = {
    icon: '🍲',
    label: 'Харчування',
    render: async (container) => {
      mountedContainer = container;
      viewBodyEl = null;
      modeGeneration = window.getRenderGeneration();
      container.innerHTML = '<div class="placeholder">Завантаження…</div>';

      const hasToken = await window.mealsApi.hasToken();
      if (window.getRenderGeneration() !== modeGeneration) return;

      if (hasToken) renderShell(container);
      else renderPairing(container);
    },
    onDeactivate: () => {
      mountedContainer = null;
      viewBodyEl = null;
    },
  };
})();
