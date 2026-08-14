/*
 * validation.js — data quality + automatic control/warning engine (section 19, 21, 22).
 */
(function (global) {

  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  function facilities() { return Store.getAll('facilityData'); }

  function monthlyTotals(dataArr, year, valueField) {
    // returns {facilityId: {month: sum}}
    const out = {};
    dataArr.filter(d => Number(d.year) === Number(year)).forEach(d => {
      out[d.facilityId] = out[d.facilityId] || {};
      out[d.facilityId][d.month] = (out[d.facilityId][d.month] || 0) + (Number(d[valueField]) || 0);
    });
    return out;
  }

  function runChecks(year) {
    const alerts = [];
    let seq = 1;
    const push = (severity, category, message, extra) => {
      alerts.push(Object.assign({ id: seq++, severity, category, message, year }, extra || {}));
    };

    const production = Store.getAll('productionData').filter(d => Number(d.year) === Number(year));
    const energy = Store.getAll('energyData').filter(d => Number(d.year) === Number(year));
    const scope1 = Store.getAll('scope1Data').filter(d => Number(d.year) === Number(year));
    const scope2 = Store.getAll('scope2Data').filter(d => Number(d.year) === Number(year));
    const scope3 = Store.getAll('scope3Data').filter(d => Number(d.year) === Number(year));
    const fx = Store.getAll('emissionFactors');
    const gwp = Store.getAll('gwpFactors');

    const facs = facilities().filter(f => f.active !== false);

    // 1. Eksik aylık üretim / enerji verisi
    facs.forEach(f => {
      for (let m = 1; m <= 12; m++) {
        const hasProd = production.some(p => p.facilityId == f.id && p.month == m);
        const hasEnergy = energy.some(e => e.facilityId == f.id && e.month == m);
        if (f.isProduction !== false && !hasProd && m <= currentReportMonth(year)) {
          push('medium', 'Eksik Üretim Verisi', `${f.name} tesisi için ${MONTHS[m-1]} ${year} üretim verisi girilmemiş.`, { facilityId: f.id, month: m });
        }
        if (!hasEnergy && m <= currentReportMonth(year)) {
          push('medium', 'Eksik Enerji Verisi', `${f.name} tesisi için ${MONTHS[m-1]} ${year} enerji verisi girilmemiş.`, { facilityId: f.id, month: m });
        }
      }
    });

    // 2. Sıfır tüketim
    energy.forEach(e => {
      if (Number(e.consumption) === 0) {
        push('low', 'Sıfır Tüketim', `${MONTHS[e.month-1]} ${year} - ${e.energyType} tüketimi 0 olarak girilmiş.`, { facilityId: e.facilityId, month: e.month, recordId: e.id });
      }
    });

    // 3. Önceki aya göre %50'den fazla anormal değişim (enerji, tür bazlı)
    const energyByType = {};
    energy.forEach(e => {
      const key = e.facilityId + '|' + e.energyType;
      energyByType[key] = energyByType[key] || {};
      energyByType[key][e.month] = (energyByType[key][e.month] || 0) + (Number(e.consumption) || 0);
    });
    Object.keys(energyByType).forEach(key => {
      const [facilityId, type] = key.split('|');
      for (let m = 2; m <= 12; m++) {
        const prev = energyByType[key][m-1];
        const cur = energyByType[key][m];
        if (prev && cur !== undefined) {
          const change = Math.abs(cur - prev) / prev;
          if (change > 0.5) {
            push('high', 'Anormal Değişim', `Kontrol edilmesi gereken anormal veri: ${type} tüketimi ${MONTHS[m-2]}->${MONTHS[m-1]} arasında %${Math.round(change*100)} değişti.`, { facilityId, month: m });
          }
        }
      }
    });

    // 4. Üretim var enerji yok / enerji var üretim yok
    facs.forEach(f => {
      for (let m = 1; m <= 12; m++) {
        const prodSum = production.filter(p => p.facilityId == f.id && p.month == m).reduce((s,p)=>s+(Number(p.quantity)||0),0);
        const energySum = energy.filter(e => e.facilityId == f.id && e.month == m).reduce((s,e)=>s+(Number(e.consumption)||0),0);
        if (prodSum > 0 && energySum === 0) {
          push('high', 'Üretim/Enerji Tutarsızlığı', `${f.name}: ${MONTHS[m-1]} ${year} üretim var ancak enerji tüketimi girilmemiş.`, { facilityId: f.id, month: m });
        }
        if (prodSum === 0 && energySum > 0) {
          push('medium', 'Üretim/Enerji Tutarsızlığı', `${f.name}: ${MONTHS[m-1]} ${year} enerji tüketimi var ancak üretim verisi girilmemiş.`, { facilityId: f.id, month: m });
        }
      }
    });

    // 5. Eksik Scope 1/2/3
    if (scope1.length === 0) push('high', 'Eksik Scope 1', `${year} yılı için hiç Scope 1 verisi girilmemiş.`, {});
    if (scope2.length === 0) push('high', 'Eksik Scope 2', `${year} yılı için hiç Scope 2 verisi girilmemiş.`, {});
    if (scope3.length === 0) push('low', 'Eksik Scope 3', `${year} yılı için hiç Scope 3 verisi girilmemiş.`, {});

    // 6. Eksik emisyon faktörü / GWP / faktör uyumsuzluğu
    [].concat(scope1, scope2, scope3).forEach(rec => {
      if (!rec.factorId) {
        push('high', 'Eksik Emisyon Faktörü', `Kayıt #${rec.id} (${rec.category || rec.energyType || ''}) için emisyon faktörü seçilmemiş.`, { recordId: rec.id });
      } else {
        const f = Store.getById('emissionFactors', rec.factorId);
        if (!f) push('high', 'Faktör Uyumsuzluğu', `Kayıt #${rec.id} referans verdiği emisyon faktörü (#${rec.factorId}) bulunamıyor.`, { recordId: rec.id });
        else if (f.active === false) push('medium', 'Faktör Uyumsuzluğu', `Kayıt #${rec.id} pasif bir emisyon faktörü kullanıyor.`, { recordId: rec.id });
      }
      if (!rec.gwpSet) push('medium', 'Eksik GWP', `Kayıt #${rec.id} için GWP seti belirtilmemiş.`, { recordId: rec.id });
    });

    if (fx.length === 0) push('high', 'Eksik Emisyon Faktörü', 'Emisyon faktörü veritabanı boş.', {});
    if (gwp.length === 0) push('high', 'Eksik GWP', 'GWP veritabanı boş.', {});

    // Not persisted: this recomputes on every dashboard/controls render, and
    // nothing else reads it back — writing it to Firestore on every render
    // would both be wasteful and (via the live-sync listener) risk a
    // write -> re-render -> write render loop.
    return alerts;
  }

  function currentReportMonth(year) {
    const now = new Date();
    if (Number(year) < now.getFullYear()) return 12;
    if (Number(year) > now.getFullYear()) return 0;
    return now.getMonth() + 1;
  }

  // completion % per month for a given year, based on production + energy expected vs entered
  function completionByMonth(year) {
    const facs = facilities().filter(f => f.active !== false);
    const production = Store.getAll('productionData').filter(d => Number(d.year) === Number(year));
    const energy = Store.getAll('energyData').filter(d => Number(d.year) === Number(year));
    const result = [];
    for (let m = 1; m <= 12; m++) {
      let expected = facs.length * 2; // production + energy per facility
      let filled = 0;
      facs.forEach(f => {
        if (production.some(p => p.facilityId == f.id && p.month == m)) filled++;
        if (energy.some(e => e.facilityId == f.id && e.month == m)) filled++;
      });
      result.push({ month: m, label: MONTHS[m-1], pct: expected ? Math.round((filled/expected)*100) : 100 });
    }
    return result;
  }

  function overallCompletion(year) {
    const cm = completionByMonth(year);
    const relevant = cm.filter(c => c.month <= currentReportMonth(year));
    if (!relevant.length) return 0;
    return Math.round(relevant.reduce((s,c)=>s+c.pct,0) / relevant.length);
  }

  global.Validation = { MONTHS, runChecks, completionByMonth, overallCompletion, currentReportMonth };
})(window);
