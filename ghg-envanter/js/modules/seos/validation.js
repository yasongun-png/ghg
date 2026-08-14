/*
 * seos/validation.js — pipeline steps 1-2 (Veri Kontrolü, Eksik Veri
 * Tamamlama) plus the QA/QC anomaly detectors from section 9 (negatif,
 * aykırı değer, sensör sıçraması, sabit kalan sensör). Duplicate/negative/
 * empty/missing counts also feed the "Veri Kalite Raporu"; spike/stuck/
 * outlier feed the "QA/QC Raporu" — both are exposed as `issues` with a
 * computed risk level so report.js can render them without re-deriving.
 */
(function () {
  window.Seos = window.Seos || {};
  const Stat = () => window.Seos.Statistics;
  const D = () => window.Seos.Data;

  const MINUTE = 60000;
  const STUCK_MIN_MINUTES = 15; // consecutive identical readings to flag a "stuck" sensor

  function risk(count, total, mediumPct, highPct) {
    if (!count) return null;
    const pct = total ? (count / total) * 100 : 100;
    if (pct >= highPct) return 'Yüksek';
    if (pct >= mediumPct) return 'Orta';
    return 'Düşük';
  }

  // Step 1 — Veri Kontrolü: chronological order, duplicate timestamps,
  // per-column negative/empty values (spec §27 wants Boş C/D/E ve Negatif
  // C/D/E ayrı ayrı izlenebilsin). Returns a sorted, de-duplicated array
  // with each record's initial status ('ok' | 'invalid') plus the issue
  // list for the Veri Kalite Raporu.
  //
  // dColumnMapped: when the source file has NO D (N₂O Kütlesel Debisi)
  // column at all, every row's r.d is null before process.js derives it
  // from C×E — that's expected, not a data quality problem, so D is only
  // checked here (negative/empty) when the user actually mapped a D column.
  function runDataChecks(rawRecords, dColumnMapped) {
    const issues = [];
    const original = rawRecords.slice();
    const sorted = rawRecords.slice().sort((a, b) => a.ts - b.ts);

    const wasOrdered = original.every((r, i) => i === 0 || r.ts >= original[i - 1].ts);
    if (!wasOrdered) {
      issues.push({ group: 'kalite', id: 'order', title: 'Tarih Sıralaması', severity: 'Orta',
        description: 'Yüklenen dosyadaki kayıtlar kronolojik sırada değildi; hesaplama öncesi otomatik olarak sıralandı.', count: 1 });
    }

    const seen = new Map();
    let duplicateCount = 0;
    const deduped = [];
    sorted.forEach(r => {
      if (seen.has(r.ts)) { duplicateCount++; return; }
      seen.set(r.ts, true);
      deduped.push(r);
    });
    if (duplicateCount) {
      issues.push({ group: 'kalite', id: 'duplicate', title: 'Yinelenen Kayıt', severity: risk(duplicateCount, sorted.length, 0.5, 2),
        description: `${duplicateCount} adet aynı zaman damgasına sahip yinelenen kayıt tespit edildi; ilk kayıt korunarak sonrakiler elendi.`, count: duplicateCount });
    }

    let negC = 0, negD = 0, negE = 0, emptyC = 0, emptyD = 0, emptyE = 0;
    deduped.forEach(r => {
      r.flags = {};
      let rowNegative = false;
      if (r.c !== null && r.c < 0) { negC++; r.c = null; rowNegative = true; }
      if (dColumnMapped && r.d !== null && r.d < 0) { negD++; r.d = null; rowNegative = true; }
      if (r.e !== null && r.e < 0) { negE++; r.e = null; rowNegative = true; }
      if (r.c === null) emptyC++;
      if (dColumnMapped && r.d === null) emptyD++;
      if (r.e === null) emptyE++;
      r.flags.negative = rowNegative;
      r.flags.empty = r.c === null || r.e === null || (dColumnMapped && r.d === null);
      r.status = r.flags.empty ? 'invalid' : 'ok';
    });
    const negativeCount = negC + negD + negE, emptyCount = emptyC + emptyD + emptyE;
    const negIssue = (count, label, id) => count && issues.push({ group: 'kalite', id, title: `Negatif Değer (${label})`, severity: risk(count, deduped.length, 0.5, 2),
      description: `${count} kayıtta negatif ${label} değeri bulundu; ilgili alan geçersiz kabul edilip boşa çevrildi.`, count });
    negIssue(negC, 'N₂O Konsantrasyonu (C)', 'negative-c');
    negIssue(negD, 'N₂O Kütlesel Debisi (D)', 'negative-d');
    negIssue(negE, 'Baca Gazı Debisi (E)', 'negative-e');
    const emptyIssue = (count, label, id) => count && issues.push({ group: 'kalite', id, title: `Boş Hücre (${label})`, severity: risk(count, deduped.length, 1, 5),
      description: `${count} kayıtta ${label} boş; ilgili alan geçersiz kabul edildi.`, count });
    emptyIssue(emptyC, 'N₂O Konsantrasyonu (C)', 'empty-c');
    if (dColumnMapped) emptyIssue(emptyD, 'N₂O Kütlesel Debisi (D)', 'empty-d');
    emptyIssue(emptyE, 'Baca Gazı Debisi (E)', 'empty-e');

    return { records: deduped, issues, duplicateCount, negativeCount, emptyCount, negC, negD, negE, emptyC, emptyD, emptyE };
  }

  // Step 2 — Eksik Veri Tamamlama: walks the full 1-minute grid between the
  // first and last reading and inserts a red-flagged "Eksik Veri" row for
  // every gap, with C/D/E forced to 0 per the spec. These rows go straight
  // to sınıf 7 (Eksik Veri) here — process.js never touches them, since a
  // missing row has no column-F value either, so we have no basis to guess
  // whether the process was open or closed during that gap. V5 change: an
  // inserted row's Proses Durumu is explicitly "Eksik Veri", not "Çalışıyor"
  // — per spec §31 the availability denominator is ONLY F=Çalışıyor rows,
  // so these are excluded from both numerator and denominator in
  // availability.js (a reversal of V4's "count them conservatively" choice,
  // now that the spec is explicit). They are never substituted (only sınıf
  // 3/4/5/6 — the granular invalid-parameter classes — get upgraded to
  // sınıf 8 by substitution.js).
  function fillMissingMinutes(records) {
    if (!records.length) return { records: [], insertedCount: 0 };
    const byTs = new Map(records.map(r => [r.ts, r]));
    const start = records[0].ts, end = records[records.length - 1].ts;
    const out = [];
    let insertedCount = 0;
    for (let ts = start; ts <= end; ts += MINUTE) {
      const existing = byTs.get(ts);
      if (existing) { out.push(existing); continue; }
      out.push({
        ts, dateStr: D().dateStr(ts), timeStr: D().timeStr(ts), c: 0, d: 0, e: 0, flags: {}, isInserted: true,
        status: 'missing', prosesDurumu: 'Eksik Veri', sinif: 7, sinifAdi: 'Eksik Veri'
      });
      insertedCount++;
    }
    if (insertedCount) {
      const issue = { group: 'kalite', id: 'missing', title: 'Eksik Dakika', severity: risk(insertedCount, out.length, 1, 5),
        description: `${insertedCount} dakikalık kayıt dosyada yoktu; otomatik olarak "Eksik Veri" satırı eklendi (C/D/E = 0).`, count: insertedCount };
      return { records: out, insertedCount, issue };
    }
    return { records: out, insertedCount: 0, issue: null };
  }

  // QA/QC — sensör sıçraması: ardışık dakikalar arasında ani ve büyük bir
  // konsantrasyon zıplaması. Sadece gerçekten ardışık ("ok") dakikalar
  // karşılaştırılır; eksik/geçersiz aradaki boşluklar atlanır.
  function detectSpikes(records) {
    const okC = records.filter(r => r.status === 'ok' && r.c !== null).map(r => r.c);
    const sd = Stat().stddev(okC);
    const threshold = Math.max(3 * sd, 20);
    const episodes = [];
    for (let i = 1; i < records.length; i++) {
      const cur = records[i], prev = records[i - 1];
      if (cur.status !== 'ok' || prev.status !== 'ok' || cur.c === null || prev.c === null) continue;
      if (cur.ts - prev.ts !== MINUTE) continue;
      if (Math.abs(cur.c - prev.c) > threshold) episodes.push({ ts: cur.ts, from: prev.c, to: cur.c, jump: cur.c - prev.c });
    }
    if (!episodes.length) return null;
    return { group: 'qaqc', id: 'spike', title: 'Sensör Sıçraması', severity: risk(episodes.length, records.length, 0.2, 1),
      description: `${episodes.length} noktada ardışık dakikalar arasında olağandışı ani değişim tespit edildi (eşik: ±${threshold.toFixed(1)} mg/Nm³).`,
      count: episodes.length, samples: episodes.slice(0, 8).map(e => ({ ts: e.ts, detail: `${D().dateTimeStr(e.ts)}: ${e.from.toFixed(1)} → ${e.to.toFixed(1)} mg/Nm³` })) };
  }

  // QA/QC — sabit kalan sensör: N dakika üst üste tamamen aynı değer.
  function detectStuckSensor(records) {
    const episodes = [];
    let runStart = null, runValue = null, runLen = 0, runStartIdx = null;
    function closeRun(endIdx) {
      if (runLen >= STUCK_MIN_MINUTES) {
        episodes.push({ startTs: records[runStartIdx].ts, endTs: records[endIdx].ts, value: runValue, minutes: runLen });
      }
    }
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const continuous = i > 0 && r.ts - records[i - 1].ts === MINUTE;
      if (r.status === 'ok' && r.c !== null && continuous && r.c === runValue) {
        runLen++;
      } else {
        closeRun(i - 1);
        if (r.status === 'ok' && r.c !== null) { runValue = r.c; runLen = 1; runStartIdx = i; }
        else { runValue = null; runLen = 0; runStartIdx = null; }
      }
    }
    closeRun(records.length - 1);
    if (!episodes.length) return null;
    const totalStuckMinutes = episodes.reduce((s, e) => s + e.minutes, 0);
    return { group: 'qaqc', id: 'stuck', title: 'Sabit Kalan Sensör', severity: risk(totalStuckMinutes, records.length, 1, 5),
      description: `${episodes.length} ayrı bölümde sensör en az ${STUCK_MIN_MINUTES} dakika boyunca aynı değerde sabit kaldı (toplam ${totalStuckMinutes} dakika).`,
      count: episodes.length, samples: episodes.slice(0, 8).map(e => ({ ts: e.startTs, detail: `${D().dateTimeStr(e.startTs)} – ${D().dateTimeStr(e.endTs)}: sabit ${e.value.toFixed(1)} mg/Nm³ (${e.minutes} dk)` })) };
  }

  // QA/QC — aykırı değer: IQR kuralına göre istatistiksel olarak sıra dışı
  // konsantrasyon okumaları (gerçek sensör arızasından çok istatistiksel
  // anomaliyi yakalar; sıçrama/sabit sensör kontrolleriyle örtüşebilir).
  function detectOutliers(records) {
    const okRecords = records.filter(r => r.status === 'ok' && r.c !== null);
    const { lowerBound, upperBound, outlierIndices } = Stat().outliersIQR(okRecords.map(r => r.c));
    if (!outlierIndices.length) return null;
    const samples = outlierIndices.slice(0, 8).map(i => ({ ts: okRecords[i].ts, detail: `${D().dateTimeStr(okRecords[i].ts)}: ${okRecords[i].c.toFixed(1)} mg/Nm³ (beklenen aralık: ${lowerBound.toFixed(1)}–${upperBound.toFixed(1)})` }));
    return { group: 'qaqc', id: 'outlier', title: 'Aykırı Değer', severity: risk(outlierIndices.length, okRecords.length, 1, 5),
      description: `IQR yöntemine göre ${outlierIndices.length} kayıt istatistiksel olağan aralığın (${lowerBound.toFixed(1)}–${upperBound.toFixed(1)} mg/Nm³) dışında.`,
      count: outlierIndices.length, samples, lowerBound, upperBound };
  }

  window.Seos.Validation = { runDataChecks, fillMissingMinutes, detectSpikes, detectStuckSensor, detectOutliers, risk, STUCK_MIN_MINUTES };
})();
