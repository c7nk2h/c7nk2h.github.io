/* ── IIFE: no globals leak ── */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'alcotrac_entries_';
  const SETTINGS_KEY = 'alcotrac_settings';
  const WATER_PREFIX = 'alcotrac_water_';
  const ETHANOL_DENSITY = 0.789;
  const GRAMS_PER_UNIT = 10;
  const BAC_DECAY_PER_HOUR = 0.15; // average elimination rate in ‰/h

  let pendingEntry = null;
  let pressTimer = null;
  let settings = loadSettings();
  let activeTab = 'today';
  let archiveDetailDate = null;
  let focusTrapTarget = null;

  /* ── DOM refs ── */
  const logList = document.getElementById('logList');
  const totalDrinksEl = document.getElementById('totalDrinks');
  const totalAlcoholEl = document.getElementById('totalAlcohol');
  const totalUnitsEl = document.getElementById('totalUnits');
  const bacValueEl = document.getElementById('bacValue');
  const bacStatEl = document.getElementById('bacStat');
  const todayDateEl = document.getElementById('todayDate');

  const todayView = document.getElementById('todayView');
  const archiveView = document.getElementById('archiveView');

  const archiveDrinksEl = document.getElementById('archiveDrinks');
  const archiveAlcoholEl = document.getElementById('archiveAlcohol');
  const archiveUnitsEl = document.getElementById('archiveUnits');
  const archiveDaysEl = document.getElementById('archiveDays');
  const archiveList = document.getElementById('archiveList');
  const archiveListSection = document.getElementById('archiveListSection');
  const archiveDetail = document.getElementById('archiveDetail');
  const archiveDayTitle = document.getElementById('archiveDayTitle');
  const archiveLogList = document.getElementById('archiveLogList');
  const archiveBackBtn = document.getElementById('archiveBackBtn');
  const deleteArchiveBtn = document.getElementById('deleteArchiveBtn');

  const tabs = document.getElementById('tabs');

  const editModal = document.getElementById('editModal');
  const editVol = document.getElementById('editVol');
  const editAbv = document.getElementById('editAbv');
  const editModalTitle = document.getElementById('editModalTitle');
  const editCancel = document.getElementById('editCancel');
  const editSave = document.getElementById('editSave');

  const deleteModal = document.getElementById('deleteModal');
  const deleteCancel = document.getElementById('deleteCancel');
  const deleteConfirm = document.getElementById('deleteConfirm');
  const resetBtn = document.getElementById('resetBtn');

  const deleteArchiveModal = document.getElementById('deleteArchiveModal');
  const deleteArchiveCancel = document.getElementById('deleteArchiveCancel');
  const deleteArchiveConfirm = document.getElementById('deleteArchiveConfirm');

  const onboardModal = document.getElementById('onboardModal');
  const onboardWeight = document.getElementById('onboardWeight');
  const onboardGender = document.getElementById('onboardGender');
  const onboardSave = document.getElementById('onboardSave');
  const onboardSkip = document.getElementById('onboardSkip');

  const progressHeader = document.getElementById('progressHeader');
  const progressRingFill = document.getElementById('progressRingFill');
  const progressRingLabel = document.getElementById('progressRingLabel');
  const levelBadge = document.getElementById('levelBadge');

  const statsView = document.getElementById('statsView');
  const levelName = document.getElementById('levelName');
  const levelDesc = document.getElementById('levelDesc');
  const levelProgressFill = document.getElementById('levelProgressFill');
  const levelProgressLabel = document.getElementById('levelProgressLabel');
  const weeklyChart = document.getElementById('weeklyChart');
  const chartPlaceholder = document.getElementById('chartPlaceholder');
  const chartBars = document.getElementById('chartBars');
  const chartBarLastFill = document.getElementById('chartBarLastFill');
  const chartBarCurrentFill = document.getElementById('chartBarCurrentFill');
  const chartBarLastValue = document.getElementById('chartBarLastValue');
  const chartBarCurrentValue = document.getElementById('chartBarCurrentValue');
  const chartArrow = document.getElementById('chartArrow');
  const chartAverage = document.getElementById('chartAverage');
  const waterWeeklyBars = document.getElementById('waterWeeklyBars');

  const totalWaterEl = document.getElementById('totalWater');
  const waterBtn = document.getElementById('waterBtn');
  const waterBtnDetail = document.getElementById('waterBtnDetail');

  const waterModal = document.getElementById('waterModal');
  const waterVol = document.getElementById('waterVol');
  const waterCancel = document.getElementById('waterCancel');
  const waterSave = document.getElementById('waterSave');

  const toastEl = document.getElementById('toast');

  /* ── Settings ── */
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      showToast('Speicher voll!');
    }
  }

  /* ── Date-based Storage ── */
  function todayKey() {
    const d = new Date();
    return STORAGE_PREFIX + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function keyToDate(key) {
    return key.replace(STORAGE_PREFIX, '');
  }

  function loadEntriesForDate(dateStr) {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_PREFIX + dateStr)) || [];
    } catch {
      return [];
    }
  }

  function loadEntries() {
    return loadEntriesForDate(keyToDate(todayKey()));
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem(todayKey(), JSON.stringify(entries));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        showToast('Speicher voll – alte Einträge wurden gelöscht');
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(STORAGE_PREFIX) && key !== todayKey()) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
          localStorage.setItem(todayKey(), JSON.stringify(entries));
        } catch (_) {
          showToast('Konnte nicht gespeichert werden');
        }
      } else {
        showToast('Fehler beim Speichern');
      }
    }
  }

  /* ── Archive ── */
  function getArchiveDays() {
    const days = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const dateStr = keyToDate(key);
        const entries = loadEntriesForDate(dateStr);
        if (entries.length > 0) {
          let totalGrams = 0;
          entries.forEach(e => { totalGrams += calcAlcoholGrams(e.vol, e.abv); });
          days.push({
            date: dateStr,
            count: entries.length,
            grams: totalGrams,
            units: totalGrams / GRAMS_PER_UNIT,
          });
        }
      }
    }
    // Sort newest first
    days.sort((a, b) => b.date.localeCompare(a.date));
    return days;
  }

  function renderArchive() {
    const days = getArchiveDays();

    // Total stats
    let totalDrinks = 0;
    let totalGrams = 0;
    days.forEach(d => {
      totalDrinks += d.count;
      totalGrams += d.grams;
    });

    archiveDrinksEl.textContent = totalDrinks;
    archiveAlcoholEl.textContent = formatGrams(totalGrams);
    archiveUnitsEl.textContent = (totalGrams / GRAMS_PER_UNIT).toFixed(1).replace('.', ',');
    archiveDaysEl.textContent = days.length;

    // Day list
    if (days.length === 0) {
      archiveList.innerHTML = '<li class="empty-msg">Noch kein Archiv vorhanden.</li>';
      return;
    }

    const maxDrinks = Math.max(...days.map(d => d.count));
    archiveList.innerHTML = '';

    days.forEach(day => {
      const li = document.createElement('li');
      li.className = 'archive-day';
      li.dataset.date = day.date;
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');

      const [year, month, dayNum] = day.date.split('-');
      const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      const monthLabel = monthNames[parseInt(month, 10) - 1];
      li.setAttribute('aria-label', dayNum + '. ' + monthLabel + ', ' + day.count + ' Getränke, ' + formatGrams(day.grams));

      const barWidth = maxDrinks > 0 ? Math.max(10, (day.count / maxDrinks) * 100) : 0;
      const barClass = barWidth > 80 ? 'danger' : barWidth > 50 ? 'warn' : '';

      const dateDiv = document.createElement('div');
      dateDiv.className = 'archive-day-date';

      const dayDiv = document.createElement('div');
      dayDiv.className = 'archive-day-day';
      dayDiv.textContent = dayNum;

      const monthDiv = document.createElement('div');
      monthDiv.className = 'archive-day-month';
      monthDiv.textContent = monthLabel;

      dateDiv.appendChild(dayDiv);
      dateDiv.appendChild(monthDiv);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'archive-day-info';

      const drinksDiv = document.createElement('div');
      drinksDiv.className = 'archive-day-drinks';
      drinksDiv.textContent = day.count + ' Geträn' + (day.count === 1 ? 'k' : 'ke');

      const detailDiv = document.createElement('div');
      detailDiv.className = 'archive-day-detail';
      detailDiv.textContent = formatGrams(day.grams) + ' · ' + day.units.toFixed(1).replace('.', ',') + ' Einh.';

      infoDiv.appendChild(drinksDiv);
      infoDiv.appendChild(detailDiv);

      const barDiv = document.createElement('div');
      barDiv.className = 'archive-day-bar';

      const barFill = document.createElement('div');
      barFill.className = 'archive-day-bar-fill' + (barClass ? ' ' + barClass : '');
      barFill.style.width = barWidth + '%';

      barDiv.appendChild(barFill);
      li.appendChild(dateDiv);
      li.appendChild(infoDiv);
      li.appendChild(barDiv);
      archiveList.appendChild(li);
    });
  }

  function renderArchiveDay(dateStr) {
    const entries = loadEntriesForDate(dateStr);
    const [year, month, dayNum] = dateStr.split('-');
    const dateObj = new Date(year, month - 1, parseInt(dayNum, 10));
    archiveDayTitle.textContent = dateObj.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    archiveListSection.style.display = 'none';
    archiveDetail.style.display = 'block';
    archiveDetailDate = dateStr;

    archiveLogList.innerHTML = '';
    if (entries.length === 0) {
      archiveLogList.innerHTML = '<li class="empty-msg">Keine Einträge.</li>';
      return;
    }

    const reversed = [...entries].reverse();
    reversed.forEach((entry) => {
      const grams = calcAlcoholGrams(entry.vol, entry.abv);
      archiveLogList.appendChild(createEntryElement(entry, grams, false));
    });
  }

  function showArchiveList() {
    archiveDetail.style.display = 'none';
    archiveListSection.style.display = 'block';
    archiveDetailDate = null;
  }

  /* ── Tab Switching ── */
  function switchTab(tab) {
    activeTab = tab;
    tabs.querySelectorAll('.tab').forEach(t => {
      const isActive = t.dataset.tab === tab;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });
    todayView.classList.toggle('hidden', tab !== 'today');
    statsView.classList.toggle('hidden', tab !== 'stats');
    archiveView.classList.toggle('hidden', tab !== 'archive');

    if (tab === 'stats') {
      renderStats();
    }
    if (tab === 'archive') {
      renderArchive();
      showArchiveList();
    }
  }

  tabs.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    switchTab(tab.dataset.tab);
  });

  /* ── Archive day click ── */
  archiveList.addEventListener('click', e => {
    const day = e.target.closest('.archive-day');
    if (!day) return;
    renderArchiveDay(day.dataset.date);
  });

  archiveList.addEventListener('keydown', e => {
    const day = e.target.closest('.archive-day');
    if (!day) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      renderArchiveDay(day.dataset.date);
    }
  });

  archiveBackBtn.addEventListener('click', () => {
    showArchiveList();
  });

  /* ── Archive delete ── */
  deleteArchiveBtn.addEventListener('click', () => {
    openModal(deleteArchiveModal, deleteArchiveBtn);
  });

  deleteArchiveCancel.addEventListener('click', () => {
    closeModal(deleteArchiveModal);
  });

  deleteArchiveModal.addEventListener('click', e => {
    if (e.target === deleteArchiveModal) closeModal(deleteArchiveModal);
  });

  deleteArchiveConfirm.addEventListener('click', () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
    // Also remove water keys
    const waterKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(WATER_PREFIX)) {
        waterKeys.push(key);
      }
    }
    waterKeys.forEach(k => localStorage.removeItem(k));
    renderArchive();
    showArchiveList();
    render();
    closeModal(deleteArchiveModal);
    showToast('Archiv gelöscht');
  });

  /* ── Toast ── */
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
  }

  /* ── BAC Calculation (Widmark Formula) ── */
  function calcBAC(entries) {
    if (!settings.weight || !settings.gender) return null;

    const r = settings.gender === 'female' ? 0.6 : 0.68;
    const weightKg = settings.weight;
    let totalGrams = 0;

    entries.forEach(e => {
      totalGrams += calcAlcoholGrams(e.vol, e.abv);
    });

    let bac = totalGrams / (weightKg * r);

    if (entries.length > 0) {
      const firstTs = entries[0].ts;
      const hoursSinceFirst = (Date.now() - firstTs) / (1000 * 60 * 60);
      bac -= hoursSinceFirst * BAC_DECAY_PER_HOUR;
    }

    return Math.max(0, bac);
  }

  /* ── Calculations ── */
  function calcAlcoholGrams(volMl, abv) {
    return volMl * (abv / 100) * ETHANOL_DENSITY;
  }

  function formatGrams(g) {
    return Math.round(g * 10) / 10 + ' g';
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatVolume(ml) {
    if (ml >= 1000) return (ml / 1000).toFixed(1).replace('.', ',') + 'l';
    return ml + 'ml';
  }

  /* ── Focus Trapping for Modals ── */
  function trapFocus(modal) {
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    modal.addEventListener('keydown', function onTab(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  trapFocus(editModal);
  trapFocus(deleteModal);
  trapFocus(deleteArchiveModal);
  trapFocus(onboardModal);

  /* ── Modal helpers (focus restoration) ── */
  function openModal(modalEl, triggerEl) {
    focusTrapTarget = triggerEl || document.activeElement;
    modalEl.classList.remove('hidden');
  }

  function closeModal(modalEl) {
    modalEl.classList.add('hidden');
    if (focusTrapTarget) {
      focusTrapTarget.focus();
      focusTrapTarget = null;
    }
  }

  /* ── Shared Entry DOM ── */
  function createEntryElement(entry, grams, showDelete) {
    const li = document.createElement('li');
    li.className = 'log-entry';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'entry-emoji';
    emojiSpan.textContent = entry.emoji;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'entry-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'entry-name';
    nameDiv.textContent = entry.type;

    const detailDiv = document.createElement('div');
    detailDiv.className = 'entry-detail';
    detailDiv.textContent = formatVolume(entry.vol) + ' · ' + entry.abv + '%';

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(detailDiv);

    const alcoholSpan = document.createElement('span');
    alcoholSpan.className = 'entry-alcohol';
    alcoholSpan.textContent = formatGrams(grams);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'entry-time';
    timeSpan.textContent = formatTime(entry.ts);

    li.appendChild(emojiSpan);
    li.appendChild(infoDiv);
    li.appendChild(alcoholSpan);
    li.appendChild(timeSpan);

    if (showDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-entry';
      deleteBtn.dataset.id = entry.id;
      deleteBtn.setAttribute('aria-label', entry.type + ' löschen');
      deleteBtn.textContent = '✕';
      li.appendChild(deleteBtn);
    }

    return li;
  }

  /* ── BAC Update ── */
  function updateBAC() {
    if (!settings.weight) return;
    const entries = loadEntries();
    if (entries.length === 0) return;
    const bac = calcBAC(entries);
    if (bac !== null) {
      bacValueEl.textContent = bac.toFixed(2).replace('.', ',');
      bacValueEl.className = 'stat-value';
      if (bac < 0.3) bacValueEl.classList.add('bac-safe');
      else if (bac < 0.8) bacValueEl.classList.add('bac-warn');
      else bacValueEl.classList.add('bac-danger');
    }
  }

  /* ── Render Today ── */
  function render() {
    const entries = loadEntries();

    todayDateEl.textContent = new Date().toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    let totalGrams = 0;
    entries.forEach(e => {
      totalGrams += calcAlcoholGrams(e.vol, e.abv);
    });

    totalDrinksEl.textContent = entries.length;
    totalAlcoholEl.textContent = formatGrams(totalGrams);
    totalUnitsEl.textContent = (totalGrams / GRAMS_PER_UNIT).toFixed(1).replace('.', ',');

    renderWaterCount();
    renderProgressRing();
    renderLevelBadge();

    const bac = calcBAC(entries);
    if (bac !== null) {
      bacValueEl.textContent = bac.toFixed(2).replace('.', ',');
      bacValueEl.className = 'stat-value';
      if (bac < 0.3) bacValueEl.classList.add('bac-safe');
      else if (bac < 0.8) bacValueEl.classList.add('bac-warn');
      else bacValueEl.classList.add('bac-danger');
    } else {
      bacValueEl.textContent = '—';
      bacValueEl.className = 'stat-value';
    }

    if (entries.length === 0) {
      logList.innerHTML = '<li class="empty-msg">Noch nichts getrunken. Prost! 🍻</li>';
      return;
    }

    logList.innerHTML = '';
    const reversed = [...entries].reverse();
    reversed.forEach((entry) => {
      const grams = calcAlcoholGrams(entry.vol, entry.abv);
      logList.appendChild(createEntryElement(entry, grams, true));
    });
  }

  /* ── Water Storage ── */
  function loadWaterForDate(dateStr) {
    try {
      return JSON.parse(localStorage.getItem(WATER_PREFIX + dateStr)) || [];
    } catch {
      return [];
    }
  }

  function loadWater() {
    return loadWaterForDate(keyToDate(todayKey()));
  }

  function saveWater(water) {
    try {
      localStorage.setItem(WATER_PREFIX + keyToDate(todayKey()), JSON.stringify(water));
    } catch (e) {
      showToast('Speicher voll!');
    }
  }

  /* ── Week Utilities ── */
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  function dateToKey(date) {
    const d = new Date(date);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getWeekUnits(weekStart) {
    let totalUnits = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = dateToKey(d);
      const entries = loadEntriesForDate(key);
      entries.forEach(e => {
        totalUnits += calcAlcoholGrams(e.vol, e.abv) / GRAMS_PER_UNIT;
      });
    }
    return totalUnits;
  }

  function getCompletedWeeks() {
    const weeks = [];
    const now = new Date();
    const thisWeekStart = getWeekStart(now);

    // Go back up to 52 weeks
    for (let w = 1; w <= 52; w++) {
      const weekStart = new Date(thisWeekStart);
      weekStart.setDate(weekStart.getDate() - (w * 7));
      const units = getWeekUnits(weekStart);
      if (units > 0) {
        weeks.push({ start: weekStart, units });
      }
    }
    return weeks;
  }

  function getCurrentWeekUnits() {
    const weekStart = getWeekStart(new Date());
    return getWeekUnits(weekStart);
  }

  function getLastWeekUnits() {
    const weekStart = getWeekStart(new Date());
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    return getWeekUnits(lastWeekStart);
  }

  function getRollingAverage() {
    const weeks = getCompletedWeeks();
    if (weeks.length === 0) return null;
    const total = weeks.reduce((sum, w) => sum + w.units, 0);
    return total / weeks.length;
  }

  /* ── Level System ── */
  const LEVELS = [
    { name: 'Neuling', desc: 'Du hast angefangen zu tracken', minWeeks: 0 },
    { name: 'Achtsamer', desc: '2 Wochen Daten gesammelt', minWeeks: 2 },
    { name: 'Fortschrittler', desc: 'Eine Woche unter dem Durchschnitt', minWeeks: 1, underAvg: 1 },
    { name: 'Mäßiger', desc: '2 Wochen unter dem Durchschnitt', minWeeks: 2, underAvg: 2 },
    { name: 'Meister', desc: '4 Wochen unter dem Durchschnitt', minWeeks: 4, underAvg: 4 },
    { name: 'Vorbild', desc: '8 Wochen unter dem Durchschnitt', minWeeks: 8, underAvg: 8 },
  ];

  function getConsecutiveWeeksUnderAvg() {
    const avg = getRollingAverage();
    if (!avg) return 0;

    let count = 0;
    const now = new Date();
    for (let w = 1; w <= 52; w++) {
      const weekStart = new Date(getWeekStart(now));
      weekStart.setDate(weekStart.getDate() - (w * 7));
      const units = getWeekUnits(weekStart);
      if (units > 0 && units < avg) {
        count++;
      } else if (units > 0) {
        break;
      }
    }
    return count;
  }

  function getCurrentLevel() {
    const completedWeeks = getCompletedWeeks().length;
    const consecutiveUnder = getConsecutiveWeeksUnderAvg();

    let level = LEVELS[0];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      const l = LEVELS[i];
      if (completedWeeks >= l.minWeeks) {
        if (!l.underAvg || consecutiveUnder >= l.underAvg) {
          level = l;
          break;
        }
      }
    }
    return level;
  }

  function getLevelProgress() {
    const current = getCurrentLevel();
    const currentIdx = LEVELS.indexOf(current);
    if (currentIdx >= LEVELS.length - 1) return { next: null, progress: 100 };

    const next = LEVELS[currentIdx + 1];
    const completedWeeks = getCompletedWeeks().length;
    const consecutiveUnder = getConsecutiveWeeksUnderAvg();

    if (next.underAvg) {
      return {
        next: next.name,
        progress: Math.min(100, (consecutiveUnder / next.underAvg) * 100),
      };
    }
    return {
      next: next.name,
      progress: Math.min(100, (completedWeeks / next.minWeeks) * 100),
    };
  }

  /* ── Render Progress Ring ── */
  const CIRCUMFERENCE = 2 * Math.PI * 20; // ~125.66

  function renderProgressRing() {
    const avg = getRollingAverage();
    const currentWeek = getCurrentWeekUnits();

    if (!avg || avg === 0) {
      progressRingFill.style.strokeDashoffset = CIRCUMFERENCE;
      progressRingFill.style.stroke = 'var(--text-dim)';
      progressRingLabel.textContent = '?';
      return;
    }

    const ratio = currentWeek / avg;
    const offset = CIRCUMFERENCE - Math.min(ratio, 1) * CIRCUMFERENCE;
    progressRingFill.style.strokeDashoffset = offset;

    if (ratio < 0.8) {
      progressRingFill.style.stroke = 'var(--safe)';
    } else if (ratio < 1) {
      progressRingFill.style.stroke = 'var(--accent)';
    } else {
      progressRingFill.style.stroke = 'var(--danger)';
    }

    progressRingLabel.textContent = Math.round(ratio * 100) + '%';
  }

  /* ── Render Level Badge ── */
  function renderLevelBadge() {
    const level = getCurrentLevel();
    levelBadge.textContent = level.name;
  }

  /* ── Render Stats Tab ── */
  function renderStats() {
    const level = getCurrentLevel();
    const progress = getLevelProgress();

    levelName.textContent = level.name;
    levelDesc.textContent = level.desc;
    levelProgressFill.style.width = progress.progress + '%';
    levelProgressLabel.textContent = progress.next ? Math.round(progress.progress) + '% zu ' + progress.next : 'Max Level!';

    // Weekly chart
    const avg = getRollingAverage();
    if (!avg || avg === 0) {
      chartPlaceholder.classList.remove('hidden');
      chartBars.classList.add('hidden');
      chartArrow.classList.add('hidden');
      chartAverage.textContent = '';
    } else {
      const lastWeek = getLastWeekUnits();
      const currentWeek = getCurrentWeekUnits();
      const maxVal = Math.max(lastWeek, currentWeek, avg);

      chartPlaceholder.classList.add('hidden');
      chartBars.classList.remove('hidden');

      const lastH = maxVal > 0 ? (lastWeek / maxVal) * 100 : 0;
      const currH = maxVal > 0 ? (currentWeek / maxVal) * 100 : 0;

      chartBarLastFill.style.height = lastH + '%';
      chartBarLastFill.className = 'chart-bar-fill' + (lastWeek < avg ? ' below' : ' above');
      chartBarLastValue.textContent = lastWeek.toFixed(1).replace('.', ',') + ' E.';

      chartBarCurrentFill.style.height = currH + '%';
      chartBarCurrentFill.className = 'chart-bar-fill' + (currentWeek < avg ? ' below' : ' above');
      chartBarCurrentValue.textContent = currentWeek.toFixed(1).replace('.', ',') + ' E.';

      // Arrow
      if (currentWeek < lastWeek) {
        chartArrow.textContent = '↓';
        chartArrow.className = 'chart-arrow down';
        chartArrow.classList.remove('hidden');
      } else if (currentWeek > lastWeek) {
        chartArrow.textContent = '↑';
        chartArrow.className = 'chart-arrow up';
        chartArrow.classList.remove('hidden');
      } else {
        chartArrow.textContent = '→';
        chartArrow.className = 'chart-arrow even';
        chartArrow.classList.remove('hidden');
      }

      chartAverage.textContent = 'Ø ' + avg.toFixed(1).replace('.', ',') + ' E./Woche';
    }

    // Water weekly
    renderWaterWeekly();
  }

  /* ── Render Water Weekly ── */
  function renderWaterWeekly() {
    const weekStart = getWeekStart(new Date());
    const today = new Date();
    const todayStr = dateToKey(today);

    const dayIds = ['waterDayMoCount', 'waterDayDiCount', 'waterDayMiCount', 'waterDayDoCount', 'waterDayFrCount', 'waterDaySaCount', 'waterDaySoCount'];
    const dayBarIds = ['waterDayMo', 'waterDayDi', 'waterDayMi', 'waterDayDo', 'waterDayFr', 'waterDaySa', 'waterDaySo'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = dateToKey(d);
      const water = loadWaterForDate(dateStr);
      const count = water.length;

      const el = document.getElementById(dayIds[i]);
      if (el) el.textContent = count;

      const barEl = document.getElementById(dayBarIds[i]);
      if (barEl) {
        barEl.classList.toggle('today', dateStr === todayStr);
      }
    }
  }

  /* ── Render Water Count ── */
  function renderWaterCount() {
    const water = loadWater();
    totalWaterEl.textContent = water.length;
    waterBtnDetail.textContent = '+1 Glas (250ml)';
  }

  /* ── Water Button ── */
  waterBtn.addEventListener('click', e => {
    if (pressWaterTimer) {
      clearTimeout(pressWaterTimer);
      pressWaterTimer = null;
      return;
    }
    addWater(250);
    vibrate();
  });

  let pressWaterTimer = null;

  waterBtn.addEventListener('pointerdown', e => {
    pressWaterTimer = setTimeout(() => {
      openWaterModal();
      pressWaterTimer = null;
    }, 500);
  });

  waterBtn.addEventListener('pointerup', () => {
    if (pressWaterTimer) {
      clearTimeout(pressWaterTimer);
      pressWaterTimer = null;
    }
  });

  waterBtn.addEventListener('pointerleave', () => {
    if (pressWaterTimer) {
      clearTimeout(pressWaterTimer);
      pressWaterTimer = null;
    }
  });

  function addWater(ml) {
    const water = loadWater();
    water.push({ ml, ts: Date.now() });
    saveWater(water);
    renderWaterCount();
  }

  function openWaterModal() {
    waterVol.value = 250;
    openModal(waterModal, waterBtn);
    setTimeout(() => waterVol.focus(), 100);
  }

  waterCancel.addEventListener('click', () => {
    closeModal(waterModal);
  });

  waterModal.addEventListener('click', e => {
    if (e.target === waterModal) closeModal(waterModal);
  });

  waterSave.addEventListener('click', () => {
    const ml = parseInt(waterVol.value, 10);
    if (!ml || ml <= 0) return;
    addWater(ml);
    closeModal(waterModal);
  });

  waterVol.addEventListener('keydown', e => {
    if (e.key === 'Enter') waterSave.click();
  });

  // Focus trap for water modal
  trapFocus(waterModal);

  /* ── Drink Button Flow ── */
  document.querySelector('.drink-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.drink-btn');
    if (!btn) return;

    const type = btn.dataset.type;
    const emoji = btn.dataset.emoji;
    const vol = parseInt(btn.dataset.vol, 10);
    const abv = parseFloat(btn.dataset.abv);

    addDrink(type, emoji, vol, abv);
    vibrate();
  });

  function addDrink(type, emoji, vol, abv) {
    const entries = loadEntries();
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      emoji,
      vol,
      abv,
      ts: Date.now(),
    };
    entries.push(entry);
    saveEntries(entries);
    render();
  }

  /* ── Delete single entry ── */
  logList.addEventListener('click', e => {
    const btn = e.target.closest('.delete-entry');
    if (!btn) return;

    const id = btn.dataset.id;
    const entries = loadEntries().filter(en => en.id !== id);
    saveEntries(entries);
    render();
    vibrate();
  });

  /* ── Reset (delete all today) ── */
  resetBtn.addEventListener('click', () => {
    openModal(deleteModal, resetBtn);
  });

  deleteCancel.addEventListener('click', () => {
    closeModal(deleteModal);
  });

  deleteModal.addEventListener('click', e => {
    if (e.target === deleteModal) closeModal(deleteModal);
  });

  deleteConfirm.addEventListener('click', () => {
    saveEntries([]);
    render();
    closeModal(deleteModal);
    vibrate();
  });

  /* ── Edit Modal (long-press to adjust) ── */
  document.querySelector('.drink-buttons').addEventListener('pointerdown', e => {
    const btn = e.target.closest('.drink-btn');
    if (!btn) return;

    pressTimer = setTimeout(() => {
      openEditModal(btn);
      pressTimer = null;
    }, 500);
  });

  document.querySelector('.drink-buttons').addEventListener('pointerup', () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });

  document.querySelector('.drink-buttons').addEventListener('pointerleave', () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });

  function openEditModal(btn) {
    pendingEntry = {
      type: btn.dataset.type,
      emoji: btn.dataset.emoji,
    };
    editVol.value = btn.dataset.vol;
    editAbv.value = btn.dataset.abv;
    editModalTitle.textContent = pendingEntry.emoji + ' ' + pendingEntry.type;
    openModal(editModal, btn);
    setTimeout(() => editVol.focus(), 100);
  }

  editCancel.addEventListener('click', () => {
    closeModal(editModal);
    pendingEntry = null;
  });

  editModal.addEventListener('click', e => {
    if (e.target === editModal) {
      closeModal(editModal);
      pendingEntry = null;
    }
  });

  editSave.addEventListener('click', () => {
    const vol = parseInt(editVol.value, 10);
    const abv = parseFloat(editAbv.value);
    if (!vol || !abv || vol <= 0 || abv <= 0) return;

    addDrink(pendingEntry.type, pendingEntry.emoji, vol, abv);
    closeModal(editModal);
    pendingEntry = null;
  });

  editVol.addEventListener('keydown', e => {
    if (e.key === 'Enter') editSave.click();
  });

  editAbv.addEventListener('keydown', e => {
    if (e.key === 'Enter') editSave.click();
  });

  /* ── Onboarding ── */
  function initOnboarding() {
    if (settings.onboarded) {
      closeModal(onboardModal);
      return;
    }
    openModal(onboardModal, null);
  }

  onboardSave.addEventListener('click', () => {
    const weight = parseInt(onboardWeight.value, 10);
    const gender = onboardGender.value;
    if (!weight || weight < 30 || weight > 250) return;

    settings.onboarded = true;
    settings.weight = weight;
    settings.gender = gender;
    saveSettings();
    closeModal(onboardModal);
    render();
  });

  onboardSkip.addEventListener('click', () => {
    settings.onboarded = true;
    saveSettings();
    closeModal(onboardModal);
  });

  onboardWeight.addEventListener('keydown', e => {
    if (e.key === 'Enter') onboardSave.click();
  });

  /* ── Vibrate ── */
  function vibrate() {
    if (navigator.vibrate) navigator.vibrate(15);
  }

  /* ── BAC auto-refresh every 30s ── */
  setInterval(updateBAC, 30000);

  /* ── Init ── */
  initOnboarding();
  render();
  renderWaterCount();
  renderProgressRing();
  renderLevelBadge();
})();
