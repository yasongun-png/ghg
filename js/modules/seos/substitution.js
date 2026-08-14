/*
 * seos/substitution.js — İkame Veri step of the V5 spec. Only triggered
 * when Veri Kullanılabilirliği is below the configured threshold (default
 * %80). Default/only-implemented method: "Günlük Ortalama"; the other six
 * spec'd methods are named/stubbed here so the UI can list them (disabled,
 * "Yakında") without a structural rewrite.
 *
 * V5 change from V4: substitution is now PER-PARAMETER, not per-row. A
 * sınıf 3/4/5/6 row (Proses Açık + at least one of C/E/D invalid) gets
 * ONLY its actually-invalid parameter(s) replaced — a row that fails only
 * on D (sınıf 5) keeps its measured C and E untouched and gets an ikame D
 * value; a row failing on all three (sınıf 6) gets all three substituted
 * independently, each from that parameter's own daily average pool. This
 * matches spec §15-17, which describe N₂O/Debi/D ikame as three separate
 * tracks with their own Ölçülen/İkame/Kullanılan columns — not one
 * "replace the whole row" operation.
 *
 * Each parameter's substitution pool is built ONLY from Proses Açık rows
 * where THAT SPECIFIC parameter passed its own threshold (not from
 * fully-valid sınıf-2 rows only) — a row that failed on E but had a good
 * C reading still contributes to the N₂O daily-average pool. A day with no
 * valid source data for a parameter falls back to that parameter's
 * whole-period average, so no row is ever left without a substituted
 * value. Sınıf 7 (Eksik Veri) rows are deliberately left alone forever —
 * we don't even know if the process was open during that gap, so imputing
 * a value would be fabricating data with no basis.
 */
(function () {
  window.Seos = window.Seos || {};
  const Stat = () => window.Seos.Statistics;

  const METHODS = {
    'daily-average': 'Günlük Ortalama',
    'last-valid': 'Son Geçerli Değer',
    'last-24h-avg': 'Son 24 Saat Ortalaması',
    'last-7d-avg': 'Son 7 Gün Ortalaması',
    'same-hour-prev-day': 'Aynı Saat Önceki Gün',
    'max-value': 'Maksimum Değer',
    'user-defined': 'Kullanıcı Tanımlı Değer'
  };
  const IMPLEMENTED = ['daily-average'];
  const NEEDS_SUB = new Set([3, 4, 5, 6]);

  function dailyAverage(records) {
    const byDayC = {}, byDayE = {}, byDayD = {};
    const allC = [], allE = [], allD = [];
    records.forEach(r => {
      if (r.prosesDurumu !== 'Açık') return;
      if (r.n2oGecerli) { (byDayC[r.dateStr] = byDayC[r.dateStr] || []).push(r.c); allC.push(r.c); }
      if (r.debiGecerli) { (byDayE[r.dateStr] = byDayE[r.dateStr] || []).push(r.e); allE.push(r.e); }
      if (r.dGecerli) { (byDayD[r.dateStr] = byDayD[r.dateStr] || []).push(r.d); allD.push(r.d); }
    });
    const overallC = Stat().mean(allC), overallE = Stat().mean(allE), overallD = Stat().mean(allD);
    const dayOrOverall = (byDay, day, overall) => (byDay[day] && byDay[day].length) ? Stat().mean(byDay[day]) : overall;

    const substitutionLog = [];
    records.forEach(r => {
      if (!NEEDS_SUB.has(r.sinif)) return;
      const entry = { ts: r.ts, dateStr: r.dateStr, timeStr: r.timeStr, substituted: [] };
      if (!r.n2oGecerli) {
        r.olculenC = r.c;
        r.ikameC = dayOrOverall(byDayC, r.dateStr, overallC);
        entry.olculenC = r.olculenC; entry.ikameC = r.ikameC; entry.substituted.push('N₂O');
      }
      if (!r.debiGecerli) {
        r.olculenE = r.e;
        r.ikameE = dayOrOverall(byDayE, r.dateStr, overallE);
        entry.olculenE = r.olculenE; entry.ikameE = r.ikameE; entry.substituted.push('Debi');
      }
      if (!r.dGecerli) {
        r.olculenD = r.d;
        r.ikameD = dayOrOverall(byDayD, r.dateStr, overallD);
        entry.olculenD = r.olculenD; entry.ikameD = r.ikameD; entry.substituted.push('D');
      }
      r.sinif = 8;
      r.sinifAdi = window.Seos.Process.SINIF_ADI[8];
      substitutionLog.push(entry);
    });
    return substitutionLog;
  }

  function run(records, method) {
    const key = IMPLEMENTED.includes(method) ? method : 'daily-average';
    if (key !== method) console.warn(`SEÖS: "${method}" ikame yöntemi bu sürümde henüz desteklenmiyor, "Günlük Ortalama" kullanıldı.`);
    const substitutionLog = dailyAverage(records);
    return { records, substitutionLog, methodUsed: key, methodLabel: METHODS[key] };
  }

  window.Seos.Substitution = { run, dailyAverage, METHODS, IMPLEMENTED };
})();
