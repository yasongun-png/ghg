/*
 * scope1.js — section 10 & 11: Scope 1 (Sabit Yakma, Mobil Yakma, Proses, Kaçak).
 * Sabit Yakma is fed automatically from the Enerji Verileri ledger (energy.js).
 * Proses ve Kaçak emisyonları are entered on their own dedicated screens
 * (processEmissions.js / fugitiveEmissions.js) and rolled up here for the
 * consolidated Scope 1 picture.
 */
(function () {
  window.Modules = window.Modules || {};

  // Emisyon Faktörü alanı formda zorunlu değil (kullanıcı boş bırakabilir) —
  // bu durumda yakıt türüne göre otomatik varsayılan faktör kullanılır,
  // aksi halde faktör seçilmeyen kayıtlar sessizce 0 tCO2e üretip Scope 1
  // toplamına hiç katkı vermiyormuş gibi görünüyordu. Kimlikler
  // emissionFactorsSeed.js'deki "Mobil Yakma" satırlarıyla eşleşir (6/7/8).
  const MOBILE_FUEL_DEFAULT_FACTOR = { 'Motorin': 6, 'Benzin': 7, 'LPG': 8 };

  function runMobileCalc(rec) {
    Calc.runAndStore({
      sourceKey: 'scope1Data', sourceId: rec.id, module: 'scope1-mobile', scope: 1,
      category: `Mobil Yakma - ${rec.vehicleType} (${rec.fuelType})`,
      year: rec.year, month: rec.month, facilityId: rec.facilityId, departmentId: rec.departmentId,
      activityValue: rec.consumption, activityUnit: rec.unit,
      factorId: rec.factorId || MOBILE_FUEL_DEFAULT_FACTOR[rec.fuelType], gwpSet: rec.gwpSet || 'AR5', method: 'Emisyon Faktörü Bazlı'
    });
  }

  // One-time-per-load backfill: recalculates every existing mobile combustion
  // record so ones entered before this fix (with no factor picked, and thus
  // stuck at 0 tCO2e) start contributing correctly — safe to call every
  // session load, it's just a targeted recalculation, not a data rewrite.
  function recalcAllMobile() {
    Store.getAll('scope1Data').filter(r => r.category === 'mobile').forEach(runMobileCalc);
  }

  const mobileCrud = CrudBuilder({
    key: 'scope1Data', title: 'Mobil Yakma (Araçlar)', icon: 'fa-truck', showCalcDetail: true,
    filter: r => r.category === 'mobile',
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'vehicleType', label: 'Araç Türü' }, { field: 'fuelType', label: 'Yakıt' },
      { field: 'consumption', label: 'Tüketim', render: r => `${Utils.fmt(r.consumption)} ${r.unit||''}` },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'vehicleType', label: 'Araç Türü', type: 'select', required: true, colSize: 6, options: [
        {value:'Binek Araç', label:'Binek Araç'}, {value:'Kamyon', label:'Kamyon'}, {value:'İş Makinesi', label:'İş Makinesi'},
        {value:'Forklift', label:'Forklift'}, {value:'Römorkör', label:'Römorkör'}, {value:'Diğer', label:'Diğer Araç'}] },
      { name: 'fuelType', label: 'Yakıt Türü', type: 'select', required: true, colSize: 6, options: [
        {value:'Motorin', label:'Motorin'}, {value:'Benzin', label:'Benzin'}, {value:'LPG', label:'LPG'}] },
      { name: 'plateNo', label: 'Plaka / Ekipman No', colSize: 6 },
      { name: 'consumption', label: 'Yakıt Tüketimi', type: 'number', required: true, colSize: 6 },
      { name: 'unit', label: 'Birim', colSize: 4, default: 'lt' },
      { name: 'factorId', label: 'Emisyon Faktörü', type: 'select', colSize: 8, options: () => Utils.factorOptions(null, 1) },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', colSize: 4, options: () => Utils.gwpSetOptions() },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'C' },
      { name: 'document', label: 'Belge (Yakıt Fişi/Fatura)', colSize: 4 },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    beforeSave: (data) => ({ category: 'mobile' }),
    afterSave: (rec) => runMobileCalc(rec),
    afterDelete: (id) => Calc.removeForSource('scope1Data', id)
  });

  function gasSummaryTableHtml(rows) {
    if (!rows.length) return '<p class="text-muted">Bu yıl için henüz kayıt yok.</p>';
    const totals = rows.reduce((a, r) => ({
      co2: a.co2 + r.co2, ch4: a.ch4 + r.ch4, n2o: a.n2o + r.n2o, tonCO2e: a.tonCO2e + r.totalCO2eTon
    }), { co2: 0, ch4: 0, n2o: 0, tonCO2e: 0 });
    return `<div class="table-responsive"><table class="table table-sm table-hover">
      <thead><tr><th>Kategori</th><th>Faaliyet Verisi (Toplam)</th><th>CO2 (kg)</th><th>CH4 (kg)</th><th>N2O (kg)</th><th>Toplam CO2e (kg)</th><th>Toplam CO2e (ton)</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.category}</td><td>${Utils.fmt(r.activityTotal)} ${r.activityUnit||''}</td><td>${Utils.fmt(r.co2)}</td><td>${Utils.fmt(r.ch4,4)}</td><td>${Utils.fmt(r.n2o,4)}</td><td>${Utils.fmt(r.totalCO2eKg)}</td><td><strong>${Utils.fmt(r.totalCO2eTon,3)}</strong></td></tr>`).join('')}
      <tr class="table-light fw-bold"><td colspan="2">TOPLAM</td><td>${Utils.fmt(totals.co2)}</td><td>${Utils.fmt(totals.ch4,4)}</td><td>${Utils.fmt(totals.n2o,4)}</td><td>${Utils.fmt(totals.tonCO2e*1000)}</td><td>${Utils.fmt(totals.tonCO2e,3)}</td></tr>
      </tbody></table></div>`;
  }

  // "Kademeli toplam" — A+B+C+D alt toplamlarının TOPLAM'a nasıl ulaştığını
  // tek bakışta gösterir; bir kategori beklenenden düşükse (ör. faktör
  // seçilmemiş bir kayıt yüzünden 0 tCO2e) burada hemen fark edilir.
  function cascadeTableHtml(rows, totalTon) {
    const running = [];
    let cum = 0;
    rows.forEach(r => { cum += r.ton; running.push(cum); });
    return `<div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Kategori</th><th class="text-end">Kategori Toplamı</th><th class="text-end">Kümülatif Toplam</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr><td>${r.label}</td><td class="text-end">${Utils.fmt(r.ton, 3)} tCO2e</td><td class="text-end text-muted">${Utils.fmt(running[i], 3)} tCO2e</td></tr>`).join('')}
        <tr class="table-light fw-bold"><td>TOPLAM SCOPE 1</td><td class="text-end">${Utils.fmt(totalTon, 3)} tCO2e</td><td class="text-end">${Utils.fmt(totalTon, 3)} tCO2e</td></tr>
      </tbody></table></div>`;
  }

  function renderRollup(container) {
    const year = Utils.currentYear();
    recalcAllMobile();
    const stationary = Calc.breakdownByCategory({ year, module: 'scope1-stationary' });
    const mobile = Calc.breakdownByCategory({ year, module: 'scope1-mobile' });
    const process = Calc.breakdownByCategory({ year, module: 'process' });
    const fugitive = Calc.breakdownByCategory({ year, module: 'fugitive' });
    const totalTon = Calc.sumCO2eTon({ year, scope: 1 });
    const totalProd = Store.getAll('productionData').filter(p => Number(p.year) === year).reduce((s,p)=>s+(Number(p.quantity)||0),0);

    const sumTon = rows => rows.reduce((s, r) => s + r.totalCO2eTon, 0);
    const cascadeRows = [
      { label: 'A. Sabit Yakma', ton: sumTon(stationary) },
      { label: 'B. Mobil Yakma', ton: sumTon(mobile) },
      { label: 'C. Proses Emisyonları', ton: sumTon(process) },
      { label: 'D. Kaçak Emisyonlar', ton: sumTon(fugitive) }
    ];

    container.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card accent-1"><div class="kpi-label">Toplam Scope 1 (${year})</div><div class="kpi-value">${Utils.fmt(totalTon,2)} <span class="kpi-unit">tCO2e</span></div><i class="fa-solid fa-fire kpi-icon"></i></div>
        <div class="kpi-card accent-1"><div class="kpi-label">Scope 1 Yoğunluğu</div><div class="kpi-value">${Utils.fmt(totalProd?totalTon/totalProd:0,4)} <span class="kpi-unit">tCO2e/ton ürün</span></div><i class="fa-solid fa-gauge kpi-icon"></i></div>
      </div>
      <div class="section-card">
        <h6><i class="fa-solid fa-list-ol"></i> Scope 1 Kademeli Toplam (${year})</h6>
        ${cascadeTableHtml(cascadeRows, totalTon)}
      </div>
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#s1-stationary">A. Sabit Yakma</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#s1-mobile">B. Mobil Yakma</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#s1-process">C. Proses Emisyonları</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#s1-fugitive">D. Kaçak Emisyonlar</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="s1-stationary">
          <div class="section-card"><h5><i class="fa-solid fa-fire-burner"></i> Sabit Yakma (Enerji Verileri ekranından otomatik)</h5>
          <p class="text-muted small">Bu veriler <a href="#energy">Enerji Verileri</a> ekranına girilen doğalgaz, fuel-oil, kömür, LPG ve kızgın yağ tüketimlerinden otomatik hesaplanır.</p>
          ${gasSummaryTableHtml(stationary)}</div>
        </div>
        <div class="tab-pane fade" id="s1-mobile">${mobileCrud.html()}</div>
        <div class="tab-pane fade" id="s1-process">
          <div class="section-card"><h5><i class="fa-solid fa-flask"></i> Proses Emisyonları (özet)</h5>
          <p class="text-muted small">Detaylı veri girişi için <a href="#processemissions">Proses Emisyonları</a> ekranını kullanın.</p>
          ${gasSummaryTableHtml(process)}</div>
        </div>
        <div class="tab-pane fade" id="s1-fugitive">
          <div class="section-card"><h5><i class="fa-solid fa-wind"></i> Kaçak Emisyonlar (özet)</h5>
          <p class="text-muted small">Detaylı veri girişi için <a href="#fugitive">Kaçak Emisyonlar</a> ekranını kullanın.</p>
          ${gasSummaryTableHtml(fugitive)}</div>
        </div>
      </div>`;
    mobileCrud.mount();
  }

  window.Modules.scope1 = { render: renderRollup, runMobileCalc, recalcAllMobile, refresh: () => mobileCrud.refresh() };
})();
