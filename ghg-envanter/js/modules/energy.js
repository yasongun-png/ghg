/*
 * energy.js — section 9: Enerji Verileri (Tüketim / Üretim / Satış / Satın Alma).
 *
 * IMPORTANT methodology point (corrected after initial build assumed every
 * site is a pure energy consumer): a company that also GENERATES its own
 * electricity/steam/heat cannot have Scope 2 driven by total "consumption" —
 * Scope 2 is specifically about PURCHASED energy (GHG Protocol Scope 2
 * Guidance). So:
 *   - Enerji Tüketim Verileri (Consumption): drives Scope 1 only (fuels
 *     burned on site — Doğalgaz, Fuel-oil, Motorin, Benzin, LPG, Kömür,
 *     Kızgın Yağ). Elektrik/Buhar/Isı/Soğutma can still be logged here for
 *     total-consumption tracking, but no longer trigger any Scope 2 calc.
 *   - Enerji Satın Alma Bilgileri (Purchase): drives Scope 2 (location-based
 *     always, market-based additionally for Elektrik), using the purchased
 *     `amount` as the activity data — NOT total consumption, which could
 *     include self-generated energy that was never purchased from anyone.
 *   - Enerji Üretim Bilgileri / Enerji Satışı Bilgileri: informational only,
 *     not wired into the calculation engine (self-generation's own emissions
 *     are already captured via the fuel burned to generate it, in Scope 1).
 */
(function () {
  window.Modules = window.Modules || {};

  const ENERGY_TYPES = {
    'Elektrik': { unit: 'kWh', kwhFactor: 1, scopeClass: 'scope2', defaultFactorId: 12, marketFactorId: 13 },
    'Doğalgaz': { unit: 'Sm³', kwhFactor: 10.9, scopeClass: 'scope1', defaultFactorId: 1 },
    'Fuel-oil': { unit: 'kg', kwhFactor: 11.3, scopeClass: 'scope1', defaultFactorId: 2 },
    'Motorin': { unit: 'lt', kwhFactor: 10.72, scopeClass: 'scope1', defaultFactorId: 6 },
    'Benzin': { unit: 'lt', kwhFactor: 9.7, scopeClass: 'scope1', defaultFactorId: 7 },
    'LPG': { unit: 'kg', kwhFactor: 12.8, scopeClass: 'scope1', defaultFactorId: 4 },
    'Kömür': { unit: 'kg', kwhFactor: 7.0, scopeClass: 'scope1', defaultFactorId: 3 },
    'Buhar': { unit: 'kg', kwhFactor: 0.65, scopeClass: 'scope2', defaultFactorId: 14 },
    'Kızgın Yağ': { unit: 'kg', kwhFactor: 11.0, scopeClass: 'scope1', defaultFactorId: 5 },
    'Isı': { unit: 'kWh', kwhFactor: 1, scopeClass: 'scope2', defaultFactorId: 15 },
    'Soğutma': { unit: 'kWh', kwhFactor: 1, scopeClass: 'scope2', defaultFactorId: 16 },
    'Diğer': { unit: 'birim', kwhFactor: 0, scopeClass: 'other', defaultFactorId: null }
  };

  // Simpler unit map for production/sales — these don't drive emission calcs.
  const PROD_SALES_TYPES = {
    'Elektrik': 'kWh', 'Buhar': 'kg', 'Isı': 'kWh', 'Soğutma': 'kWh', 'Diğer': 'birim'
  };
  const prodSalesTypeOptions = () => Object.keys(PROD_SALES_TYPES).map(k => ({ value: k, label: `${k} (${PROD_SALES_TYPES[k]})` }));

  // Consumption drives Scope 1 only. Elektrik/Buhar/Isı/Soğutma rows here are
  // for total-consumption tracking (Toplam Enerji KPI); they no longer feed
  // Scope 2 — see the file header note on why.
  function runEnergyCalculations(rec) {
    const cfg = ENERGY_TYPES[rec.energyType] || {};
    rec.consumptionKwhEquivalent = (Number(rec.consumption) || 0) * (cfg.kwhFactor || 0);
    Store.update('energyData', rec.id, { consumptionKwhEquivalent: rec.consumptionKwhEquivalent }, {});

    if (cfg.scopeClass !== 'scope1') {
      Calc.removeForSource('energyData', rec.id); // clears any stale calc from before this correction
      return;
    }
    if (rec.includeInScope1 === false) {
      Calc.removeForSource('energyData', rec.id);
      return;
    }
    Calc.runAndStore({
      sourceKey: 'energyData', sourceId: rec.id, module: 'scope1-stationary', scope: 1,
      category: 'Sabit Yakma - ' + rec.energyType, year: rec.year, month: rec.month,
      facilityId: rec.facilityId, departmentId: rec.departmentId,
      activityValue: rec.consumption, activityUnit: cfg.unit || rec.unit,
      gwpSet: rec.gwpSet || (Store.getAll('reportingYears').find(y => y.year == rec.year) || {}).gwpSet || 'AR5',
      method: 'Emisyon Faktörü Bazlı', factorId: rec.factorId || cfg.defaultFactorId
    });
  }

  // Purchases drive Scope 2 — location-based always, market-based
  // additionally for Elektrik (GHG Protocol Scope 2 Guidance dual reporting).
  function runPurchaseCalculations(rec) {
    const cfg = ENERGY_TYPES[rec.energyType] || {};
    if (rec.includeInScope2 === false) {
      Calc.removeForSource('energyPurchaseData', rec.id);
      Calc.removeForSource('energyPurchaseData', 'm-' + rec.id);
      return;
    }
    const baseMeta = {
      sourceKey: 'energyPurchaseData', sourceId: rec.id,
      year: rec.year, month: rec.month, facilityId: rec.facilityId, departmentId: rec.departmentId,
      activityValue: rec.amount, activityUnit: cfg.unit || rec.unit,
      gwpSet: rec.gwpSet || (Store.getAll('reportingYears').find(y => y.year == rec.year) || {}).gwpSet || 'AR5'
    };
    Calc.runAndStore(Object.assign({}, baseMeta, {
      module: 'scope2-location', scope: 2, category: rec.energyType + ' (Location-Based, Satın Alınan)',
      method: 'Emisyon Faktörü Bazlı - Location Based (Satın Alma)', factorId: rec.factorId || cfg.defaultFactorId, locationBased: true
    }));
    if (rec.energyType === 'Elektrik') {
      Calc.runAndStore(Object.assign({}, baseMeta, {
        sourceKey: 'energyPurchaseData', sourceId: 'm-' + rec.id,
        module: 'scope2-market', scope: 2, category: 'Elektrik (Market-Based, Satın Alınan)',
        method: 'Emisyon Faktörü Bazlı - Market Based (Satın Alma)', factorId: rec.marketFactorId || cfg.marketFactorId, marketBased: true
      }));
    }
  }

  const consumptionCrud = CrudBuilder({
    key: 'energyData', title: 'Enerji Tüketim Verileri', icon: 'fa-bolt', showCalcDetail: true,
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'energyType', label: 'Enerji Türü' },
      { field: 'consumption', label: 'Tüketim', render: r => `${Utils.fmt(r.consumption)} ${ENERGY_TYPES[r.energyType] ? ENERGY_TYPES[r.energyType].unit : (r.unit||'')}` },
      { field: 'invoiceNo', label: 'Fatura No' },
      { field: 'scope1Include', label: 'Scope 1', render: r => {
          const applicable = (ENERGY_TYPES[r.energyType] || {}).scopeClass === 'scope1';
          if (!applicable) return '<span class="text-muted text-xs">Bkz. Satın Alma</span>';
          const checked = r.includeInScope1 !== false;
          const locked = !Utils.canEditYear(r.year);
          return `<div class="form-check form-switch mb-0"><input type="checkbox" class="form-check-input scope-toggle" data-scope="1"
            ${checked ? 'checked' : ''} ${locked ? 'disabled title="' + r.year + ' yılı için düzenleme yetkiniz yok"' : 'title="Scope 1 hesabına dahil et/çıkar"'}></div>`;
        } },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'energyType', label: 'Enerji Türü', type: 'select', required: true, colSize: 4,
        options: Object.keys(ENERGY_TYPES).map(k => ({ value: k, label: `${k} (${ENERGY_TYPES[k].unit})` })) },
      { name: 'consumption', label: 'Tüketim Miktarı', type: 'number', required: true, colSize: 4 },
      { name: 'factorId', label: 'Emisyon Faktörü (override, sadece Scope 1 türleri için)', type: 'select', colSize: 4, options: () => '<option value="">Varsayılanı kullan</option>' + Utils.factorOptions() },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', colSize: 6, options: () => Utils.gwpSetOptions() },
      { name: 'meterNo', label: 'Sayaç No', colSize: 4 },
      { name: 'invoiceNo', label: 'Fatura No', colSize: 4 },
      { name: 'dataSource', label: 'Veri Kaynağı', type: 'select', colSize: 4, options: [
        {value:'Fatura', label:'Fatura'}, {value:'Sayaç', label:'Sayaç'}, {value:'ERP', label:'ERP Çıktısı'}, {value:'Tahmini', label:'Tahmini'}] },
      { name: 'document', label: 'Belge Referansı', colSize: 6 },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 6, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'includeInScope1', label: 'Scope 1 Hesabına Dahil Et', type: 'checkbox', colSize: 6, default: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterSave: (rec) => runEnergyCalculations(rec),
    afterDelete: (id) => Calc.removeForSource('energyData', id)
  });

  const productionCrud = CrudBuilder({
    key: 'energyProductionData', title: 'Enerji Üretim Bilgileri', icon: 'fa-solar-panel',
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'energyType', label: 'Enerji Türü' }, { field: 'source', label: 'Üretim Kaynağı' },
      { field: 'amount', label: 'Üretim Miktarı', render: r => `${Utils.fmt(r.amount)} ${PROD_SALES_TYPES[r.energyType] || r.unit || ''}` },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'energyType', label: 'Enerji Türü', type: 'select', required: true, colSize: 4, options: prodSalesTypeOptions() },
      { name: 'source', label: 'Üretim Kaynağı / Yöntemi', type: 'select', colSize: 4, options: [
        { value: 'Güneş (GES)', label: 'Güneş (GES)' }, { value: 'Rüzgar (RES)', label: 'Rüzgar (RES)' },
        { value: 'Kojenerasyon (CHP)', label: 'Kojenerasyon (CHP)' }, { value: 'Kendi Kazanı', label: 'Kendi Kazanı' },
        { value: 'Biyokütle', label: 'Biyokütle' }, { value: 'Diğer', label: 'Diğer' }] },
      { name: 'amount', label: 'Üretim Miktarı', type: 'number', required: true, colSize: 4 },
      { name: 'dataSource', label: 'Veri Kaynağı', type: 'select', colSize: 4, options: [
        {value:'Sayaç', label:'Sayaç'}, {value:'ERP', label:'ERP Çıktısı'}, {value:'Tahmini', label:'Tahmini'}] },
      { name: 'document', label: 'Belge Referansı', colSize: 4 },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  const salesCrud = CrudBuilder({
    key: 'energySalesData', title: 'Enerji Satışı Bilgileri', icon: 'fa-right-left',
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'energyType', label: 'Enerji Türü' }, { field: 'buyer', label: 'Alıcı' },
      { field: 'amount', label: 'Satış Miktarı', render: r => `${Utils.fmt(r.amount)} ${PROD_SALES_TYPES[r.energyType] || r.unit || ''}` },
      { field: 'unitPrice', label: 'Satış Fiyatı', render: r => r.unitPrice ? `${Utils.fmt(r.unitPrice, 2)} ${r.currency||'TL'}` : '-' },
      { field: 'totalCost', label: 'Toplam Tutar', render: r => r.totalCost ? `${Utils.fmt(r.totalCost, 2)} ${r.currency||'TL'}` : '-' },
      { field: 'invoiceNo', label: 'Fatura No' },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'energyType', label: 'Enerji Türü', type: 'select', required: true, colSize: 4, options: prodSalesTypeOptions() },
      { name: 'buyer', label: 'Alıcı', type: 'select', colSize: 4, options: [
        { value: 'Şebekeye Satış', label: 'Şebekeye Satış' }, { value: 'Diğer Tesise Satış', label: 'Diğer Tesise Satış' },
        { value: 'Diğer', label: 'Diğer' }] },
      { name: 'amount', label: 'Satış Miktarı', type: 'number', required: true, colSize: 4 },
      { name: 'unitPrice', label: 'Satış Fiyatı (Birim)', type: 'number', colSize: 4 },
      { name: 'totalCost', label: 'Toplam Tutar', type: 'number', colSize: 4 },
      { name: 'currency', label: 'Para Birimi', type: 'select', colSize: 4, options: [{value:'TL',label:'TL'},{value:'USD',label:'USD'},{value:'EUR',label:'EUR'}], default: 'TL' },
      { name: 'invoiceNo', label: 'Fatura No', colSize: 4 },
      { name: 'dataSource', label: 'Veri Kaynağı', type: 'select', colSize: 4, options: [
        {value:'Fatura', label:'Fatura'}, {value:'Sayaç', label:'Sayaç'}, {value:'ERP', label:'ERP Çıktısı'}] },
      { name: 'document', label: 'Belge Referansı', colSize: 4 },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  const purchaseCrud = CrudBuilder({
    key: 'energyPurchaseData', title: 'Enerji Satın Alma Bilgileri', icon: 'fa-file-signature', showCalcDetail: true,
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'energyType', label: 'Enerji Türü' }, { field: 'supplier', label: 'Tedarikçi' },
      { field: 'contractType', label: 'Sözleşme / Sertifika Türü' },
      { field: 'amount', label: 'Miktar', render: r => `${Utils.fmt(r.amount)} ${ENERGY_TYPES[r.energyType] ? ENERGY_TYPES[r.energyType].unit : (r.unit||'')}` },
      { field: 'totalCost', label: 'Toplam Tutar', render: r => r.totalCost ? Utils.fmt(r.totalCost) + ' ' + (r.currency||'TL') : '-' },
      { field: 'invoiceNo', label: 'Fatura No' },
      { field: 'scope2Include', label: 'Scope 2', render: r => {
          const checked = r.includeInScope2 !== false;
          const locked = !Utils.canEditYear(r.year);
          return `<div class="form-check form-switch mb-0"><input type="checkbox" class="form-check-input purchase-scope-toggle"
            ${checked ? 'checked' : ''} ${locked ? 'disabled title="' + r.year + ' yılı için düzenleme yetkiniz yok"' : 'title="Scope 2 hesabına dahil et/çıkar"'}></div>`;
        } },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'energyType', label: 'Enerji Türü (Scope 2 kapsamı: Elektrik, Buhar, Isı, Soğutma)', type: 'select', required: true, colSize: 4,
        options: Object.keys(ENERGY_TYPES).map(k => ({ value: k, label: `${k} (${ENERGY_TYPES[k].unit})` })) },
      { name: 'supplier', label: 'Tedarikçi', colSize: 4 },
      { name: 'contractType', label: 'Sözleşme / Tarife / Sertifika Türü (ör. Serbest Tüketici, I-REC/GO, Sabit Tarife)', colSize: 4 },
      { name: 'amount', label: 'Satın Alınan Miktar', type: 'number', required: true, colSize: 4 },
      { name: 'factorId', label: 'Emisyon Faktörü (override)', type: 'select', colSize: 4, options: () => '<option value="">Varsayılanı kullan</option>' + Utils.factorOptions() },
      { name: 'marketFactorId', label: 'Market-Based Faktör (sadece Elektrik)', type: 'select', colSize: 4, options: () => '<option value="">Varsayılanı kullan</option>' + Utils.factorOptions() },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', colSize: 4, options: () => Utils.gwpSetOptions() },
      { name: 'unitPrice', label: 'Birim Fiyat', type: 'number', colSize: 4 },
      { name: 'totalCost', label: 'Toplam Tutar', type: 'number', colSize: 4 },
      { name: 'currency', label: 'Para Birimi', type: 'select', colSize: 4, options: [{value:'TL',label:'TL'},{value:'USD',label:'USD'},{value:'EUR',label:'EUR'}], default: 'TL' },
      { name: 'invoiceNo', label: 'Fatura No', colSize: 4 },
      { name: 'document', label: 'Belge Referansı', colSize: 4 },
      { name: 'includeInScope2', label: 'Scope 2 Hesabına Dahil Et', type: 'checkbox', colSize: 4, default: true },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterSave: (rec) => runPurchaseCalculations(rec),
    afterDelete: (id) => { Calc.removeForSource('energyPurchaseData', id); Calc.removeForSource('energyPurchaseData', 'm-' + id); }
  });

  // Flipping the "Scope 1" checkbox (consumption) or "Scope 2" checkbox
  // (purchase) updates that record's inclusion right from the list — no need
  // to open the edit form for the most common day-to-day adjustment
  // (excluding/re-including a reading).
  function bindScopeToggle() {
    const consumptionSection = document.getElementById('crud-sec-energyData');
    if (consumptionSection) {
      consumptionSection.addEventListener('change', (e) => {
        const chk = e.target.closest('.scope-toggle');
        if (!chk) return;
        const id = chk.closest('tr').dataset.id;
        const rec = Store.getById('energyData', id);
        if (!rec) return;
        // Disabled attribute already blocks this in normal UI use — this is
        // a defense-in-depth backstop (e.g. permissions changed mid-session).
        if (!Utils.canEditYear(rec.year)) {
          chk.checked = rec.includeInScope1 !== false;
          Utils.toast(`${rec.year} yılı için düzenleme yetkiniz yok.`, 'danger');
          return;
        }
        const newVal = chk.checked;
        const updated = Store.update('energyData', id, { includeInScope1: newVal });
        runEnergyCalculations(updated);
        Utils.toast(`Scope 1 bu kayıt için ${newVal ? 'dahil edildi' : 'hariç tutuldu'}.`);
        consumptionCrud.refresh();
      });
    }
    const purchaseSection = document.getElementById('crud-sec-energyPurchaseData');
    if (purchaseSection) {
      purchaseSection.addEventListener('change', (e) => {
        const chk = e.target.closest('.purchase-scope-toggle');
        if (!chk) return;
        const id = chk.closest('tr').dataset.id;
        const rec = Store.getById('energyPurchaseData', id);
        if (!rec) return;
        if (!Utils.canEditYear(rec.year)) {
          chk.checked = rec.includeInScope2 !== false;
          Utils.toast(`${rec.year} yılı için düzenleme yetkiniz yok.`, 'danger');
          return;
        }
        const newVal = chk.checked;
        const updated = Store.update('energyPurchaseData', id, { includeInScope2: newVal });
        runPurchaseCalculations(updated);
        Utils.toast(`Scope 2 bu kayıt için ${newVal ? 'dahil edildi' : 'hariç tutuldu'}.`);
        purchaseCrud.refresh();
      });
    }
  }

  // Ay × Enerji Türü kırılımlı özet tablo — CRUD listelerinin altında
  // "hangi ayda ne kadar" sorusuna tek bakışta cevap verir; Raporlar
  // ekranındaki yıl-toplamı denge tablosunun aylık/ekran-içi tamamlayıcısı.
  function pivotRows(key, valueField, year) {
    const recs = Store.getAll(key).filter(r => Number(r.year) === year);
    const types = Array.from(new Set(recs.map(r => r.energyType))).filter(Boolean).sort();
    return types.map(type => {
      const monthly = new Array(12).fill(0);
      recs.filter(r => r.energyType === type).forEach(r => { monthly[r.month - 1] += Number(r[valueField]) || 0; });
      const unit = (ENERGY_TYPES[type] || {}).unit || PROD_SALES_TYPES[type] || '';
      return { type, unit, monthly, total: monthly.reduce((a, b) => a + b, 0) };
    });
  }

  function pivotTableHtml(title, rows) {
    if (!rows.length) return `<div class="section-card"><h6 class="mb-0">${title}</h6><p class="text-muted small mb-0 mt-2">Bu yıl için veri yok.</p></div>`;
    const monthHeaders = Validation.MONTHS.map(m => `<th class="text-end">${m.slice(0, 3)}</th>`).join('');
    const body = rows.map(r => `<tr><td>${r.type}</td>${r.monthly.map(v => `<td class="text-end">${v ? Utils.fmt(v, 0) : '-'}</td>`).join('')}<td class="text-end fw-bold">${Utils.fmt(r.total, 0)}</td><td class="text-muted small">${r.unit}</td></tr>`).join('');
    return `<div class="section-card">
      <h6 class="mb-2">${title}</h6>
      <div class="table-responsive"><table class="table table-sm table-hover mb-0">
        <thead><tr><th>Enerji Türü</th>${monthHeaders}<th class="text-end">Toplam</th><th>Birim</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </div>`;
  }

  function summaryTabHtml(year) {
    return `
      <div class="section-card d-flex align-items-center gap-2 mb-3">
        <label class="text-xs form-label mb-0">Yıl</label>
        <select id="en-summary-year" class="form-select form-select-sm" style="max-width:120px">
          ${Utils.availableYears().map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <div id="en-summary-body">
        ${pivotTableHtml('Enerji Tüketim Verileri — Aylık Özet', pivotRows('energyData', 'consumption', year))}
        ${pivotTableHtml('Enerji Üretim Bilgileri — Aylık Özet', pivotRows('energyProductionData', 'amount', year))}
        ${pivotTableHtml('Enerji Satışı Bilgileri — Aylık Özet', pivotRows('energySalesData', 'amount', year))}
        ${pivotTableHtml('Enerji Satın Alma Bilgileri — Aylık Özet', pivotRows('energyPurchaseData', 'amount', year))}
      </div>`;
  }

  function bindSummaryYearSelect() {
    const sel = document.getElementById('en-summary-year');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const year = Number(sel.value);
      document.getElementById('en-summary-body').innerHTML = `
        ${pivotTableHtml('Enerji Tüketim Verileri — Aylık Özet', pivotRows('energyData', 'consumption', year))}
        ${pivotTableHtml('Enerji Üretim Bilgileri — Aylık Özet', pivotRows('energyProductionData', 'amount', year))}
        ${pivotTableHtml('Enerji Satışı Bilgileri — Aylık Özet', pivotRows('energySalesData', 'amount', year))}
        ${pivotTableHtml('Enerji Satın Alma Bilgileri — Aylık Özet', pivotRows('energyPurchaseData', 'amount', year))}`;
    });
  }

  window.Modules.energy = {
    render(container) {
      const summaryYear = Utils.currentYear();
      container.innerHTML = `
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#en-consumption">Enerji Tüketim Verileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#en-production">Enerji Üretim Bilgileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#en-sales">Enerji Satışı Bilgileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#en-purchase">Enerji Satın Alma Bilgileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#en-summary">Aylık Özet Tabloları</button></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="en-consumption">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Bu ekrana girilen yakıt tüketimi (doğalgaz, motorin, LPG vb.) otomatik olarak <strong>Scope 1</strong>
              hesaplamasına yansıtılır. Elektrik/Buhar/Isı/Soğutma buraya sadece toplam tüketim takibi için
              girilebilir — <strong>bunlar artık Scope 2'ye dahil edilmez</strong>; kendi ürettiğiniz enerji ile
              satın aldığınız enerjiyi ayırt edemediğimiz için Scope 2, sadece <strong>Enerji Satın Alma
              Bilgileri</strong> sekmesindeki miktarlardan hesaplanır. Detay büyüteç ikonuyla hesaplama izini
              görebilirsiniz.</div>
            ${consumptionCrud.html()}
          </div>
          <div class="tab-pane fade" id="en-production">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Tesis içinde ürettiğiniz enerjiyi (güneş, kojenerasyon, kendi kazanı vb.) izler. Bu veriler bir
              emisyon hesaplaması tetiklemez — kendi ürettiğiniz enerjinin emisyonu, onu üretmek için yaktığınız
              yakıt üzerinden zaten Scope 1'de hesaplanıyor.</div>
            ${productionCrud.html()}
          </div>
          <div class="tab-pane fade" id="en-sales">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Şebekeye veya başka bir tesise sattığınız enerjiyi izler. Bilgi/raporlama amaçlıdır.</div>
            ${salesCrud.html()}
          </div>
          <div class="tab-pane fade" id="en-purchase">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              <strong>Scope 2 hesaplaması buradan yapılır.</strong> Sadece dışarıdan satın aldığınız
              elektrik/buhar/ısı/soğutma miktarını girin — kendi ürettiğiniz ve tükettiğiniz enerji burada YER
              ALMAMALI. Elektrik için location-based ve market-based sonuçlar ayrı ayrı hesaplanır.</div>
            ${purchaseCrud.html()}
          </div>
          <div class="tab-pane fade" id="en-summary">
            ${summaryTabHtml(summaryYear)}
          </div>
        </div>`;
      consumptionCrud.mount();
      productionCrud.mount();
      salesCrud.mount();
      purchaseCrud.mount();
      bindScopeToggle();
      bindSummaryYearSelect();
    },
    ENERGY_TYPES,
    runCalc: runEnergyCalculations,
    runPurchaseCalc: runPurchaseCalculations,
    refresh: () => { consumptionCrud.refresh(); purchaseCrud.refresh(); }
  };
})();
