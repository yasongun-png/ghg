/*
 * seos/data.js — Excel ingestion (SheetJS), column-mapping heuristics, and
 * LocalStorage persistence for the SEÖS N2O module.
 *
 * IMPORTANT: unlike the rest of the app, SEÖS data does NOT go through
 * Store/Firestore — a year of minute-level readings is ~525,600 rows,
 * which would be far too expensive/slow to sync as Firestore documents.
 * Everything here lives in the browser only (LocalStorage), per the
 * explicit "local storage olsun" requirement. If the processed dataset is
 * too big for LocalStorage's ~5-10MB quota, we fall back to keeping it in
 * memory for the current session only and warn the user via toast.
 */
(function () {
  window.Seos = window.Seos || {};

  const KEY_DATASET = 'seos_dataset_v1';
  const KEY_SETTINGS = 'seos_settings_v1';

  let memoryFallback = null;
  let usingMemoryFallback = false;

  function two(n) { return String(n).padStart(2, '0'); }

  // Canonical timestamp: UTC-based epoch ms built from the wall-clock
  // components as they appear in the spreadsheet — we deliberately never
  // touch the host machine's timezone, since a SEÖS export is always a
  // naive "plant local clock" series, not a real timezone-aware instant.
  function toCanonicalTs(y, mo, d, h, mi, s) {
    const ts = Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0);
    return Math.round(ts / 60000) * 60000; // snap to the minute
  }

  function parseDateTimeCell(val) {
    if (val === null || val === undefined || val === '') return null;
    if (val instanceof Date) {
      return toCanonicalTs(val.getUTCFullYear(), val.getUTCMonth() + 1, val.getUTCDate(), val.getUTCHours(), val.getUTCMinutes(), val.getUTCSeconds());
    }
    if (typeof val === 'number') {
      // Excel serial date (days since 1899-12-30).
      const ms = Date.UTC(1899, 11, 30) + Math.round(val * 86400000);
      return Math.round(ms / 60000) * 60000;
    }
    const str = String(val).trim();
    let m = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/); // DD.MM.YYYY HH:mm[:ss]
    if (m) return toCanonicalTs(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
    m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/); // YYYY-MM-DD HH:mm[:ss]
    if (m) return toCanonicalTs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
    const d = new Date(str);
    if (!isNaN(d.getTime())) return toCanonicalTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    return null;
  }

  function dateStr(ts) { const d = new Date(ts); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`; }
  function timeStr(ts) { const d = new Date(ts); return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; }
  function dateTimeStr(ts) { return dateStr(ts) + ' ' + timeStr(ts); }
  function monthStr(ts) { const d = new Date(ts); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}`; }

  function parseNum(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Proses Durumu (column F) is tolerant of however the plant's SEÖS export
  // spells it — "Açık"/"Acik"/"Open"/"1"/"Evet"/true all mean running,
  // everything else (including a genuinely blank cell) means Kapalı. When
  // the column isn't mapped at all, the caller (buildRecords) leaves
  // prosesDurumu null and process.js falls back to inferring it from
  // C/E — see process.js header comment.
  function parseProsesDurumu(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v ? 'Açık' : 'Kapalı';
    const s = String(v).trim().toLocaleLowerCase('tr-TR');
    if (['açık', 'acik', 'open', '1', 'evet', 'true', 'on', 'çalışıyor', 'calisiyor'].includes(s)) return 'Açık';
    return 'Kapalı';
  }

  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          resolve(XLSX.read(data, { type: 'array', cellDates: true }));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
      reader.readAsArrayBuffer(file);
    });
  }

  function sheetToAOA(workbook, sheetName) {
    const ws = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  }

  // Best-effort column auto-detection from Turkish header text — the user
  // always confirms/corrects these in the mapping step, this is just a
  // convenience default so most files need zero manual clicks.
  function guessMapping(headers) {
    const norm = h => String(h || '').toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    let tsCol = -1, cCol = -1, dCol = -1, eCol = -1, fCol = -1;
    headers.forEach((h, i) => {
      const n = norm(h);
      if (tsCol < 0 && (n.includes('tarih') || n.includes('zaman'))) tsCol = i;
      if (cCol < 0 && n.includes('konsantrasyon')) cCol = i;
      if (dCol < 0 && (n.includes('kutlesel') || (n.includes('debi') && n.includes('kg')))) dCol = i;
      if (eCol < 0 && (n.includes('baca') || (n.includes('debi') && !n.includes('kg')))) eCol = i;
      if (fCol < 0 && (n.includes('proses') || n.includes('durum'))) fCol = i;
    });
    return { tsCol, cCol, dCol, eCol, fCol };
  }

  // Converts the raw sheet (header row + data rows) into normalized minute
  // records using the confirmed column mapping. Fully blank rows are
  // skipped; rows whose date/time cell can't be parsed are counted as
  // parseErrors and skipped (surfaced to the user before calculation runs).
  function buildRecords(aoa, mapping) {
    const rows = aoa.slice(1);
    const out = [];
    let parseErrors = 0;
    rows.forEach(row => {
      if (!row || row.every(c => c === undefined || c === null || c === '')) return;
      const ts = parseDateTimeCell(row[mapping.tsCol]);
      if (ts === null) { parseErrors++; return; }
      out.push({
        ts, dateStr: dateStr(ts), timeStr: timeStr(ts),
        c: parseNum(row[mapping.cCol]),
        d: mapping.dCol >= 0 ? parseNum(row[mapping.dCol]) : null,
        e: parseNum(row[mapping.eCol]),
        // null when column F isn't mapped (or the cell is blank) — process.js
        // treats null as "infer from C/E" rather than assuming Kapalı, so a
        // file without a Proses Durumu column still works exactly like it
        // did before this column existed.
        prosesDurumuGirilen: mapping.fCol >= 0 ? parseProsesDurumu(row[mapping.fCol]) : null
      });
    });
    // V5: whether the file actually provides a measured D (kütlesel debi)
    // column matters for how process.js treats a blank D cell — see
    // process.js's dColumnMapped comment.
    return { records: out, parseErrors, dColumnMapped: mapping.dCol >= 0 };
  }

  function estimateBytes(obj) {
    try { return new Blob([JSON.stringify(obj)]).size; } catch (err) { return 0; }
  }

  // Tries to persist the full dataset (incl. per-minute records) to
  // LocalStorage. If the quota is exceeded, retries without the bulky
  // per-minute array (aggregates only survive a refresh) and keeps the
  // full payload in memory for the rest of this session.
  function saveDataset(payload) {
    try {
      localStorage.setItem(KEY_DATASET, JSON.stringify(payload));
      usingMemoryFallback = false;
      memoryFallback = null;
      return { ok: true, droppedRaw: false };
    } catch (err) {
      try {
        const trimmed = JSON.parse(JSON.stringify(payload));
        if (trimmed.result) trimmed.result.records = undefined;
        localStorage.setItem(KEY_DATASET, JSON.stringify(trimmed));
        memoryFallback = payload;
        usingMemoryFallback = true;
        return { ok: true, droppedRaw: true };
      } catch (err2) {
        memoryFallback = payload;
        usingMemoryFallback = true;
        return { ok: false, droppedRaw: true, error: err2.message };
      }
    }
  }

  function loadDataset() {
    if (usingMemoryFallback && memoryFallback) return memoryFallback;
    try {
      const raw = localStorage.getItem(KEY_DATASET);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  function hasSavedDataset() {
    if (usingMemoryFallback && memoryFallback) return true;
    try { return !!localStorage.getItem(KEY_DATASET); } catch (err) { return false; }
  }

  function clearDataset() {
    memoryFallback = null;
    usingMemoryFallback = false;
    try { localStorage.removeItem(KEY_DATASET); } catch (err) { /* ignore */ }
  }

  function saveSettings(s) {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); } catch (err) { /* ignore */ }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  window.Seos.Data = {
    readWorkbook, sheetToAOA, guessMapping, buildRecords, parseDateTimeCell, parseProsesDurumu,
    dateStr, timeStr, dateTimeStr, monthStr, parseNum, estimateBytes,
    saveDataset, loadDataset, hasSavedDataset, clearDataset, saveSettings, loadSettings
  };
})();
