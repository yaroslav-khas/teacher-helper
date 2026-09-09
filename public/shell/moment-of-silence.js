(() => {
  const DURATION_SECONDS = 60;
  const SALUTE_SECONDS = 10;

  let clockInterval = null;
  let saluteTimeout = null;
  let audioCtx = null;
  let escHandler = null;
  let secondsElapsed = 0;
  let previousMode = null;

  // Синтезований клац секундної стрілки через Web Audio — без потреби тягнути
  // в застосунок аудіофайл ліцензійного походження. Вища частота й короткий
  // спад дають дзвінкий "тік" замість глухого писку.
  function playTick() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1600;
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.045);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.045);
    } catch {
      // Web Audio недоступний (напр. автоплей-політика) — тиша не критична.
    }
  }

  function buildClockFace() {
    const marks = [];
    for (let i = 0; i < 60; i += 1) {
      const angle = (i * 6 * Math.PI) / 180;
      const isHour = i % 5 === 0;
      const r1 = isHour ? 82 : 88;
      const r2 = 92;
      const x1 = 100 + r1 * Math.sin(angle);
      const y1 = 100 - r1 * Math.cos(angle);
      const x2 = 100 + r2 * Math.sin(angle);
      const y2 = 100 - r2 * Math.cos(angle);
      marks.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#1d2026" stroke-width="${isHour ? 2.4 : 1}" />`,
      );
    }

    const numbers = [];
    for (let n = 1; n <= 12; n += 1) {
      const angle = (n * 30 * Math.PI) / 180;
      const x = 100 + 68 * Math.sin(angle);
      const y = 100 - 68 * Math.cos(angle);
      numbers.push(
        `<text x="${x.toFixed(2)}" y="${(y + 6).toFixed(2)}" text-anchor="middle" font-size="14" font-weight="600" fill="#1d2026">${n}</text>`,
      );
    }

    return `
      <svg id="silence-clock" viewBox="0 0 200 200" class="silence-clock-svg">
        <circle cx="100" cy="100" r="96" fill="#f4f4f2" stroke="#1d2026" stroke-width="3" />
        ${marks.join('')}
        ${numbers.join('')}
        <line id="hand-hour" x1="100" y1="100" x2="100" y2="58" stroke="#1d2026" stroke-width="5" stroke-linecap="round" transform="rotate(270 100 100)" />
        <line id="hand-min" x1="100" y1="100" x2="100" y2="34" stroke="#1d2026" stroke-width="3.5" stroke-linecap="round" />
        <line id="hand-sec" x1="100" y1="112" x2="100" y2="26" stroke="#c0392b" stroke-width="1.5" stroke-linecap="round" />
        <circle cx="100" cy="100" r="4" fill="#c0392b" />
      </svg>
    `;
  }

  // Годинна й хвилинна стрілки завжди показують рівно 9:00 (символічний
  // момент початку хвилини мовчання) — рухається лише секундна, і саме вона
  // й є таймером: один повний оберт за ці 60 секунд.
  function setSecondHand(container, seconds) {
    const angle = (seconds % 60) * 6;
    container.querySelector('#hand-sec').setAttribute('transform', `rotate(${angle} 100 100)`);
  }

  window.boardModes['moment-of-silence'] = {
    icon: '🕯️',
    label: 'Хвилина мовчання',
    render: (container) => {
      container.innerHTML = `
        <div class="silence-view">
          <div id="silence-clock-phase" class="silence-clock-phase">
            <div class="silence-clock-wrap">${buildClockFace()}</div>
            <div class="silence-caption">Хвилина мовчання</div>
            <div class="silence-countdown" id="silence-countdown">${DURATION_SECONDS}</div>
          </div>
          <div id="silence-salute" class="silence-salute" hidden>
            <div>Слава Україні!</div>
            <div>Героям слава!</div>
          </div>
          <button id="silence-exit" class="pdf-exit-fullscreen">✕ Закрити (Esc)</button>
        </div>
      `;

      document.body.classList.add('web-fullscreen');
      window.boardApi.window.isFullscreen().then((isFs) => {
        if (!isFs) window.boardApi.window.toggleFullscreen();
      });

      secondsElapsed = 0;
      const clockPhaseEl = container.querySelector('#silence-clock-phase');
      const saluteEl = container.querySelector('#silence-salute');
      const countdownEl = container.querySelector('#silence-countdown');
      setSecondHand(container, 0);

      function finish() {
        if (clockInterval) {
          clearInterval(clockInterval);
          clockInterval = null;
        }
        if (saluteTimeout) {
          clearTimeout(saluteTimeout);
          saluteTimeout = null;
        }
        document.body.classList.remove('web-fullscreen');
        window.activateMode(previousMode && window.boardModes[previousMode] ? previousMode : 'home');
      }

      function showSalute() {
        clockPhaseEl.hidden = true;
        saluteEl.hidden = false;
        saluteTimeout = setTimeout(finish, SALUTE_SECONDS * 1000);
      }

      clockInterval = setInterval(() => {
        secondsElapsed += 1;
        setSecondHand(container, secondsElapsed);
        playTick();
        countdownEl.textContent = String(Math.max(0, DURATION_SECONDS - secondsElapsed));
        if (secondsElapsed >= DURATION_SECONDS) {
          clearInterval(clockInterval);
          clockInterval = null;
          showSalute();
        }
      }, 1000);

      container.querySelector('#silence-exit').addEventListener('pointerdown', finish);

      escHandler = (e) => {
        if (e.key === 'Escape') finish();
      };
      window.addEventListener('keydown', escHandler);
    },
    onDeactivate: () => {
      if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
      }
      if (saluteTimeout) {
        clearTimeout(saluteTimeout);
        saluteTimeout = null;
      }
      if (escHandler) {
        window.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
      document.body.classList.remove('web-fullscreen');
    },
  };

  // Викликається з банера-сповіщення або кнопки в налаштуваннях. Пам'ятаємо
  // попередній режим, щоб після 60с автоматично повернутись саме туди, а не
  // завжди на головний екран.
  window.triggerMomentOfSilence = function triggerMomentOfSilence() {
    previousMode = window.currentBoardMode ? window.currentBoardMode() : null;
    window.activateMode('moment-of-silence');
  };
})();
