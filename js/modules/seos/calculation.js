/*
 * seos/calculation.js — V5 pipeline orchestrator. Delegates the heavy
 * lifting to dedicated modules in this exact order:
 *   1 Veri Kontrolü (validation.js)         7 Ortalamalar (Ölçülen/İkame/
 *   2 Eksik Dakika Tamamlama (validation)      Nihai × N₂O/Debi/D)
 *   3-4 Proses Durumu + Sınıflandırma        8 Emisyon Hesapları
 *       (process.js)                         9 İkame Veri Etki Oranı
 *   5 Veri Kullanılabilirliği (availability) 10 Günlük/Aylık N2O
 *   6 İkame Veri (substitution.js)           11 CO2e (GWP N2O = 273, AR6)
 *
 * Every Proses Açık record ends the pipeline with `n2oKullanilan` /
 * `debiKullanilan` / `dKullanilan` (each independently resolved to the
 * measured value if that parameter passed its own check, the ikame value
 * if it was substituted, or null if it's still unresolved) — the single
 * source of truth every downstream module (report.js, ui.js, export.js)
 * reads instead of re-deriving "which value is in effect" itself.
 *
 * The emission for a given minute is driven ENTIRELY by D (kütlesel
 * debi = dakikalık N₂O kütlesi kaynağı, spec §21) — whether it counts as
 * "ölçülen" or "ikame" depends only on r.dGecerli, not on the row's
 * overall sınıf label (a sınıf 8 "İkame Veri" row whose only problem was
 * an invalid C still has a genuinely measured D, so its emission is
 * "ölçülen").
 */
(function () {
  window.Seos = window.Seos || {};

  const GWP_N2O_AR6 = 273;
  const ACIK_NOT_KAPALI_NOT_EKSIK = (r) => r.sinif !== 1 && r.sinif !== 7;

  function runFullPipeline(rawRecords, options) {
    const opts = Object.assign({ availabilityThreshold: 80, substitutionMethod: 'daily-average', gwp: GWP_N2O_AR6, dColumnMapped: true }, options || {});
    const V = window.Seos.Validation, Proc = window.Seos.Process, Avail = window.Seos.Availability,
      Sub = window.Seos.Substitution, Stat = window.Seos.Statistics, D = window.Seos.Data;

    const step1 = V.runDataChecks(rawRecords, opts.dColumnMapped); // Step 1
    const step2 = V.fillMissingMinutes(step1.records);             // Step 2 (assigns sınıf 7 directly)
    let records = step2.records;

    // QA/QC anomaly detection runs on the raw pre-classification series so
    // synthetic substituted values can never mask a genuine sensor problem.
    const qaqcFindings = [V.detectSpikes(records), V.detectStuckSensor(records), V.detectOutliers(records)].filter(Boolean);

    Proc.classify(records, opts.dColumnMapped);             // Steps 6-11: Proses Durumu + C/E/D geçerlilik + Sınıflandırma
    const availability = Avail.compute(records);            // Veri Kullanılabilirliği (only F=Çalışıyor rows)

    let substitutionLog = [], substitutionMethodLabel = null;
    const substitutionUsed = availability.pct < opts.availabilityThreshold;
    if (substitutionUsed) {
      const subResult = Sub.run(records, opts.substitutionMethod); // İkame Veri — upgrades sınıf 3/4/5/6 → 8, per-parameter
      records = subResult.records;
      substitutionLog = subResult.substitutionLog;
      substitutionMethodLabel = subResult.methodLabel;
    }

    // Per-row "kullanılan" resolution + per-minute emission. Kept split by
    // source (ölçülen/ikame) so a verification body can always see exactly
    // how much of the reported emission was actually measured vs imputed
    // (İkame Veri Etki Oranı).
    records.forEach(r => {
      if (!ACIK_NOT_KAPALI_NOT_EKSIK(r)) {
        r.n2oKullanilan = null; r.debiKullanilan = null; r.dKullanilan = null;
        r.olculenN2oKg = 0; r.ikameN2oKg = 0;
      } else {
        r.n2oKullanilan = r.n2oGecerli ? r.c : (r.ikameC !== undefined ? r.ikameC : null);
        r.debiKullanilan = r.debiGecerli ? r.e : (r.ikameE !== undefined ? r.ikameE : null);
        r.dKullanilan = r.dGecerli ? r.d : (r.ikameD !== undefined ? r.ikameD : null);
        if (r.dKullanilan === null || r.dKullanilan === undefined) {
          r.olculenN2oKg = 0; r.ikameN2oKg = 0;
        } else if (r.dGecerli) {
          r.olculenN2oKg = r.dKullanilan / 60; r.ikameN2oKg = 0;
        } else {
          r.olculenN2oKg = 0; r.ikameN2oKg = r.dKullanilan / 60;
        }
      }
      r.n2oKg = r.olculenN2oKg + r.ikameN2oKg;
      r.co2eKg = r.n2oKg * opts.gwp;
    });

    // Step 7 — Ortalamalar: Ölçülen / İkame / Nihai, ayrı ayrı, N₂O / Debi
    // / D için (spec §18). "Ölçülen" havuzu her parametre için KENDİ
    // geçerlilik bayrağına göre seçilir (örn. yalnızca E geçersiz olan bir
    // satırın C değeri hâlâ "ölçülen N₂O" havuzuna girer).
    const acikRecords = records.filter(ACIK_NOT_KAPALI_NOT_EKSIK);
    const triad = (validField, measuredField, ikameField, kullanilanField) => {
      const olculenVals = acikRecords.filter(r => r[validField]).map(r => r[measuredField]);
      const ikameVals = acikRecords.filter(r => !r[validField] && r[ikameField] !== undefined).map(r => r[ikameField]);
      const nihaiVals = acikRecords.filter(r => r[kullanilanField] !== null && r[kullanilanField] !== undefined).map(r => r[kullanilanField]);
      return {
        olculen: Stat.mean(olculenVals), ikame: Stat.mean(ikameVals), nihai: Stat.mean(nihaiVals),
        olculenVals, nihaiVals
      };
    };
    const n2oTriad = triad('n2oGecerli', 'c', 'ikameC', 'n2oKullanilan');
    const debiTriad = triad('debiGecerli', 'e', 'ikameE', 'debiKullanilan');
    const dTriad = triad('dGecerli', 'd', 'ikameD', 'dKullanilan');

    const avgN2O = n2oTriad.nihai, avgFlow = debiTriad.nihai;
    const minN2O = Stat.min(n2oTriad.nihaiVals), maxN2O = Stat.max(n2oTriad.nihaiVals), stdDevN2O = Stat.stddev(n2oTriad.nihaiVals);

    // Parametre bazlı veri kullanılabilirliği (spec §19) — N2O analizörü,
    // debi ölçüm sistemi ve D (kütlesel debi) sinyali birbirinden BAĞIMSIZ
    // izlenir; payda Genel Veri Kullanılabilirliği ile aynıdır
    // (availability.prosesAcikDakika = F=Çalışıyor kayıt sayısı).
    const denom = availability.prosesAcikDakika;
    const n2oGecerliVeriYuzde = denom ? (acikRecords.filter(r => r.n2oGecerli).length / denom) * 100 : 0;
    const debiGecerliVeriYuzde = denom ? (acikRecords.filter(r => r.debiGecerli).length / denom) * 100 : 0;
    const dGecerliVeriYuzde = denom ? (acikRecords.filter(r => r.dGecerli).length / denom) * 100 : 0;

    // Step 8 — Emisyon Hesapları. Çalışma Dakikası (spec §20) = TÜM
    // F=Çalışıyor kayıt sayısı, veri geçerliliğinden bağımsız — bir dakika
    // proses çalışırken geçtiyse çalışma süresine sayılır, o dakikanın
    // emisyona katkısı olsun ya da olmasın.
    const workingMinutes = availability.prosesAcikDakika;
    const workingHours = workingMinutes / 60;
    const totalOlculenN2OKg = records.reduce((s, r) => s + r.olculenN2oKg, 0);
    const totalIkameN2OKg = records.reduce((s, r) => s + r.ikameN2oKg, 0);
    const totalN2OKg = totalOlculenN2OKg + totalIkameN2OKg;

    // Step 9 — İkame Veri Etki Oranı.
    const ikameEtkiOrani = totalN2OKg ? (totalIkameN2OKg / totalN2OKg) * 100 : 0;

    // Step 10 — Günlük/Aylık N2O (ölçülen + ikame kept side by side).
    const dailyMap = {};
    records.forEach(r => {
      const bucket = dailyMap[r.dateStr] || (dailyMap[r.dateStr] = { date: r.dateStr, month: D.monthStr(r.ts), olculenKg: 0, ikameKg: 0, workingMinutes: 0, flowSum: 0, flowCount: 0 });
      bucket.olculenKg += r.olculenN2oKg;
      bucket.ikameKg += r.ikameN2oKg;
      if (r.dKullanilan !== null && r.dKullanilan !== undefined) {
        bucket.workingMinutes++;
        if (r.debiKullanilan !== null && r.debiKullanilan !== undefined) { bucket.flowSum += r.debiKullanilan; bucket.flowCount++; }
      }
    });
    const dailyAgg = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      date: d.date, month: d.month, workingMinutes: d.workingMinutes, workingHours: d.workingMinutes / 60,
      avgFlow: d.flowCount ? d.flowSum / d.flowCount : 0,
      olculenKg: d.olculenKg, ikameKg: d.ikameKg, toplamKg: d.olculenKg + d.ikameKg,
      co2eTon: (d.olculenKg + d.ikameKg) * opts.gwp / 1000,
      olculenCo2eTon: d.olculenKg * opts.gwp / 1000, ikameCo2eTon: d.ikameKg * opts.gwp / 1000
    }));

    const monthlyMap = {};
    dailyAgg.forEach(d => {
      const bucket = monthlyMap[d.month] || (monthlyMap[d.month] = { month: d.month, olculenKg: 0, ikameKg: 0, workingMinutes: 0, dayCount: 0 });
      bucket.olculenKg += d.olculenKg; bucket.ikameKg += d.ikameKg; bucket.workingMinutes += d.workingMinutes; bucket.dayCount++;
    });
    const monthlyAgg = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      month: m.month, dayCount: m.dayCount, workingMinutes: m.workingMinutes, workingHours: m.workingMinutes / 60,
      olculenKg: m.olculenKg, ikameKg: m.ikameKg, toplamKg: m.olculenKg + m.ikameKg,
      co2eTon: (m.olculenKg + m.ikameKg) * opts.gwp / 1000,
      olculenCo2eTon: m.olculenKg * opts.gwp / 1000, ikameCo2eTon: m.ikameKg * opts.gwp / 1000
    }));

    // Step 11 — CO2e (IPCC AR6, GWP N2O = 273).
    const totalCO2eKg = totalN2OKg * opts.gwp;
    const totalCO2eTon = totalCO2eKg / 1000;
    const totalOlculenCO2eTon = totalOlculenN2OKg * opts.gwp / 1000;
    const totalIkameCO2eTon = totalIkameN2OKg * opts.gwp / 1000;

    // Proses Açık/Kapalı Süreleri (its own report).
    const prosesSureleri = {
      acikDakika: availability.prosesAcikDakika, kapaliDakika: availability.prosesKapaliDakika,
      acikSaat: availability.prosesAcikDakika / 60, kapaliSaat: availability.prosesKapaliDakika / 60
    };

    const issues = [...step1.issues];
    if (step2.issue) issues.push(step2.issue);
    issues.push(...qaqcFindings);
    issues.push({
      group: 'qaqc', id: 'integrity', title: 'Veri Bütünlüğü',
      severity: availability.pct >= 95 ? 'Düşük' : (availability.pct >= 80 ? 'Orta' : 'Yüksek'),
      description: `1 dakikalık zaman ızgarası eksiksiz tamamlandı (${availability.expected} kayıt). F=Çalışıyor dakikalar içinde geçerli ölçüm oranı %${availability.pct.toFixed(1)}.`,
      count: availability.eksikOlcum
    });

    return {
      generatedAt: Date.now(), options: opts, records, issues, availability, prosesSureleri,
      substitutionUsed, substitutionLog, substitutionMethodLabel,
      workingMinutes, workingHours, avgFlow, avgN2O, minN2O, maxN2O, stdDevN2O,
      debiGecerliVeriYuzde, n2oGecerliVeriYuzde, dGecerliVeriYuzde,
      olculenN2OOrtalama: n2oTriad.olculen, ikameN2OOrtalama: n2oTriad.ikame, nihaiN2OOrtalama: n2oTriad.nihai,
      olculenDebiOrtalama: debiTriad.olculen, ikameDebiOrtalama: debiTriad.ikame, nihaiDebiOrtalama: debiTriad.nihai,
      olculenDOrtalama: dTriad.olculen, ikameDOrtalama: dTriad.ikame, nihaiDOrtalama: dTriad.nihai,
      totalOlculenN2OKg, totalIkameN2OKg, totalN2OKg, ikameEtkiOrani,
      totalCO2eKg, totalCO2eTon, totalOlculenCO2eTon, totalIkameCO2eTon,
      dailyAgg, monthlyAgg
    };
  }

  window.Seos.Calculation = { runFullPipeline, GWP_N2O_AR6 };
})();
