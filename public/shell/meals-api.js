// =====================================================================
// Харчування — тонкий клієнт готового серверного API (Cloudflare Worker,
// репозиторій oop-poruch-bot). Teacher Helper не зберігає бізнес-дані
// локально, лише токен прив'язки пристрою (через window.boardApi.store,
// як і решта налаштувань застосунку) — сервер завжди джерело істини.
//
// CORS на сервері відкритий з будь-якого походження, тож викликаємо fetch()
// напряму з рендерера, без проксі через main-процес чи додаткового IPC.
// =====================================================================

(() => {
  const BASE_URL = 'https://oop-poruch-bot.slavkokomandir.workers.dev';
  const TOKEN_KEY = 'meals:token';
  const TEACHER_NAME_KEY = 'meals:teacherName';

  // Кеш у пам'яті — щоб не ходити в electron-store (async IPC) перед КОЖНИМ
  // запитом; store лишається джерелом істини між перезапусками застосунку.
  let cachedToken;

  async function getToken() {
    if (cachedToken === undefined) {
      cachedToken = (await window.boardApi.store.get(TOKEN_KEY)) || null;
    }
    return cachedToken;
  }

  async function setToken(token, teacherName) {
    cachedToken = token;
    await window.boardApi.store.set(TOKEN_KEY, token);
    if (teacherName !== undefined) {
      await window.boardApi.store.set(TEACHER_NAME_KEY, teacherName);
    }
  }

  async function clearToken() {
    cachedToken = null;
    await window.boardApi.store.set(TOKEN_KEY, null);
  }

  // Помилка, що прийшла у форматі { error: "код" } від сервера — status разом
  // з кодом дає виклику достатньо, щоб показати доречне повідомлення.
  class MealsApiError extends Error {
    constructor(code, status) {
      super(code);
      this.name = 'MealsApiError';
      this.code = code;
      this.status = status;
    }
  }

  // КРИТИЧНО за специфікацією: право пристрою перевіряється живим статусом
  // людини на кожен запит, а не фактом існування токена — той самий токен
  // може стати недійсним будь-якої миті (власник забрав роль у боті).
  // 401/403 на БУДЬ-ЯКОМУ запиті означає "токен недійсний" — чистимо його й
  // повідомляємо підписника (meals-mode.js), щоб показати екран прив'язки
  // заново, а не зависнути чи мовчки нічого не показати.
  let onAuthInvalid = null;
  function setOnAuthInvalid(callback) {
    onAuthInvalid = callback;
  }

  async function request(method, path, body) {
    const token = await getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new MealsApiError('network_error', 0);
    }

    if (res.status === 401 || res.status === 403) {
      const payload = await res.json().catch(() => ({}));
      await clearToken();
      onAuthInvalid?.();
      throw new MealsApiError(payload.error || 'invalid_token', res.status);
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new MealsApiError(payload.error || 'unknown_error', res.status);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  window.mealsApi = {
    MealsApiError,
    setOnAuthInvalid,
    hasToken: async () => Boolean(await getToken()),
    getTeacherName: async () => (await window.boardApi.store.get(TEACHER_NAME_KEY)) || '',
    forgetDevice: clearToken,

    pair: async (code, label) => {
      const result = await request('POST', '/api/meals/pair', { code, label });
      await setToken(result.token, result.teacherName);
      return result;
    },

    listPupils: () => request('GET', '/api/meals/pupils'),
    addPupil: (fullName) => request('POST', '/api/meals/pupils', { fullName }),
    updatePupil: (id, patch) => request('PATCH', `/api/meals/pupils/${encodeURIComponent(id)}`, patch),

    getPrices: () => request('GET', '/api/meals/prices'),
    setPrices: (first, main, side) => request('PUT', '/api/meals/prices', { first, main, side }),

    getDay: (date) => request('GET', `/api/meals/day?date=${encodeURIComponent(date)}`),
    // Числові поля з DOM (select.value, checkbox.value) завжди приходять
    // рядками, навіть коли в атрибут писали число — Number(...) тут, в
    // одному місці для всіх викликів, а не в кожному місці meals-mode.js,
    // де pupilId міг узятись із такого джерела. Сервер вимагає саме number.
    setDay: (date, entries) =>
      request('PUT', '/api/meals/day', { date, entries: entries.map((e) => ({ ...e, pupilId: Number(e.pupilId) })) }),

    getBalances: () => request('GET', '/api/meals/balances'),
    getLedger: (pupilId) => request('GET', `/api/meals/pupil/${encodeURIComponent(pupilId)}/ledger`),

    addTopup: (pupilId, date, amount, note) =>
      request('POST', '/api/meals/topups', { pupilId: Number(pupilId), date, amount, note: note || undefined }),
    patchTopup: (id, patch) => request('PATCH', `/api/meals/topups/${encodeURIComponent(id)}`, patch),
    deleteTopup: (id) => request('DELETE', `/api/meals/topups/${encodeURIComponent(id)}`),

    addDeduction: (pupilIds, date, amount, reason) =>
      request('POST', '/api/meals/deductions', { pupilIds: pupilIds.map(Number), date, amount, reason }),
    patchDeduction: (id, patch) => request('PATCH', `/api/meals/deductions/${encodeURIComponent(id)}`, patch),
    deleteDeduction: (id) => request('DELETE', `/api/meals/deductions/${encodeURIComponent(id)}`),
  };
})();
