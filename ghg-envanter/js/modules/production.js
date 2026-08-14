/*
 * production.js — section 7 & 8: Ürün tanımı, aylık üretim verisi ve üretim analizleri.
 * Production has no direct emissions itself — it is the denominator used across
 * the whole app (energy/carbon intensity, tCO2e/ton ürün, dashboards, reports).
 */
(function () {
  window.Modules = window.Modules || {};

  const productCrud = CrudBuilder({
    key: 'productData', title: 'Ürün Tanımları', icon: 'fa-flask-vial',
    columns: [
      { field: 'name', label: 'Ürün Adı' }, { field: 'code', label: 'Ürün Kodu' },
      { field: 'unit', label: 'Birim' }, { field: 'group', label: 'Ürün Grubu' },
      { field: 'concentration', label: 'Konsantrasyon (%)' }, { field: 'annualCapacity', label: 'Yıllık Kapasite' },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'name', label: 'Ürün Adı', required: true, colSize: 6 },
      { name: 'code', label: 'Ürün Kodu', required: true, colSize: 6 },
      { name: 'unit', label: 'Birim', colSize: 4, default: 'ton' },
      { name: 'group', label: 'Ürün Grubu', colSize: 4 },
      { name: 'concentration', label: 'Konsantrasyon (%)', type: 'number', colSize: 4 },
      { name: 'annualCapacity', label: 'Yıllık Üretim Kapasitesi', type: 'number', colSize: 6 },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 6, default: true }
    ]
  });

  const productionCrud = CrudBuilder({
    key: 'productionData', title: 'Aylık Üretim Verileri', icon: 'fa-industry',
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'productId', label: 'Ürün', render: r => Utils.productName(r.productId) },
      { field: 'quantity', label: 'Üretim Miktarı', render: r => Utils.fmt(r.quantity) },
      { field: 'unit', label: 'Birim' },
      { field: 'chemicalConsumptions', label: 'Kimyasal Tüketimi', render: r => (r.chemicalConsumptions || []).filter(c => c.chemicalId).length
        ? r.chemicalConsumptions.filter(c => c.chemicalId).map(c => `${Utils.chemicalName(c.chemicalId)}: ${Utils.fmt(c.quantity)} ${c.unit||''}`).join(', ')
        : '-' },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'processId', label: 'Proses', type: 'select', colSize: 6, options: () => Utils.processOptions() },
      { name: 'productId', label: 'Ürün', type: 'select', required: true, colSize: 6, options: () => Utils.productOptions() },
      { name: 'quantity', label: 'Üretim Miktarı', type: 'number', required: true, colSize: 4 },
      { name: 'unit', label: 'Birim', colSize: 4, default: 'ton' },
      { name: 'concentration', label: 'Ürün Konsantrasyonu (%)', type: 'number', colSize: 4 },
      { name: 'productionDuration', label: 'Üretim Süresi (saat)', type: 'number', colSize: 6 },
      { name: 'workingHours', label: 'Çalışma Saati', type: 'number', colSize: 6 },
      { name: 'chemicalConsumptions', label: 'Kimyasal Tüketimleri', type: 'repeater', colSize: 12, addLabel: 'Kimyasal Ekle', subFields: [
        { name: 'chemicalId', label: 'Kimyasal', type: 'select', colSize: 6, options: (val) => Utils.chemicalOptions(val) },
        { name: 'quantity', label: 'Miktar', type: 'number', colSize: 4 },
        { name: 'unit', label: 'Birim', colSize: 2, default: 'kg' }
      ] },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 6, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'status', label: 'Durum', type: 'select', colSize: 6, options: () => Object.entries(Store.STATUS_LABELS).map(([v,l])=>({value:v,label:l})), default: 'draft' },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterChange: () => renderAnalytics()
  });

  const chemicalCrud = CrudBuilder({
    key: 'chemicalData', title: 'Kimyasal Tanımları', icon: 'fa-vial',
    columns: [
      { field: 'name', label: 'Kimyasal Adı' }, { field: 'casNo', label: 'CAS No' },
      { field: 'unit', label: 'Birim' }, { field: 'category', label: 'Kategori' },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'name', label: 'Kimyasal Adı', required: true, colSize: 6 },
      { name: 'casNo', label: 'CAS No', colSize: 6 },
      { name: 'unit', label: 'Birim', colSize: 4, default: 'kg' },
      { name: 'category', label: 'Kategori', colSize: 4 },
      { name: 'supplier', label: 'Tedarikçi', colSize: 4 },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 6, default: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  function renderAnalytics() {
    const wrap = document.getElementById('productionAnalyticsWrap');
    if (!wrap) return;
    const year = Utils.currentYear();
    const productionAll = Store.getAll('productionData').filter(p => Number(p.year) === year);
    const totalProduction = productionAll.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const totalEnergyMWh = Calc.resultsFor({ year }).length ? null : null; // placeholder not used directly

    const totalCO2e = Calc.sumCO2eTon({ year });
    const scope1 = Calc.sumCO2eTon({ year, scope: 1 });
    const scope2 = Calc.sumCO2eTon({ year, scope: 2 });
    const scope3 = Calc.sumCO2eTon({ year, scope: 3 });
    const energyRows = Store.getAll('energyData').filter(e => Number(e.year) === year);
    const totalEnergyKwhEquivalent = energyRows.reduce((s, e) => s + (Number(e.consumptionKwhEquivalent) || 0), 0);

    const carbonIntensity = totalProduction ? totalCO2e / totalProduction : 0;
    const energyIntensity = totalProduction ? totalEnergyKwhEquivalent / totalProduction : 0;

    const byProduct = {};
    productionAll.forEach(p => {
      byProduct[p.productId] = byProduct[p.productId] || 0;
      byProduct[p.productId] += Number(p.quantity) || 0;
    });
    const rows = Object.keys(byProduct).map(pid => {
      const qty = byProduct[pid];
      const co2eForProduct = Calc.sumCO2eTon({ year, productId: pid });
      return { name: Utils.productName(pid), qty, co2e: co2eForProduct, intensity: qty ? co2eForProduct / qty : 0 };
    });

    wrap.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card accent-total"><div class="kpi-label">Toplam Üretim (${year})</div><div class="kpi-value">${Utils.fmt(totalProduction,0)} <span class="kpi-unit">ton</span></div><i class="fa-solid fa-industry kpi-icon"></i></div>
        <div class="kpi-card accent-total"><div class="kpi-label">Karbon Yoğunluğu</div><div class="kpi-value">${Utils.fmt(carbonIntensity,3)} <span class="kpi-unit">tCO2e/ton</span></div><i class="fa-solid fa-leaf kpi-icon"></i></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Enerji Yoğunluğu</div><div class="kpi-value">${Utils.fmt(energyIntensity,2)} <span class="kpi-unit">kWh eşd./ton</span></div><i class="fa-solid fa-bolt kpi-icon"></i></div>
        <div class="kpi-card accent-1"><div class="kpi-label">Scope 1 Yoğunluğu</div><div class="kpi-value">${Utils.fmt(totalProduction?scope1/totalProduction:0,3)} <span class="kpi-unit">tCO2e/ton</span></div><i class="fa-solid fa-fire kpi-icon"></i></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Scope 2 Yoğunluğu</div><div class="kpi-value">${Utils.fmt(totalProduction?scope2/totalProduction:0,3)} <span class="kpi-unit">tCO2e/ton</span></div><i class="fa-solid fa-plug kpi-icon"></i></div>
        <div class="kpi-card accent-3"><div class="kpi-label">Scope 3 Yoğunluğu</div><div class="kpi-value">${Utils.fmt(totalProduction?scope3/totalProduction:0,3)} <span class="kpi-unit">tCO2e/ton</span></div><i class="fa-solid fa-truck-fast kpi-icon"></i></div>
      </div>
      <div class="section-card">
        <h5><i class="fa-solid fa-chart-simple"></i> Ürün Bazlı Karbon Yoğunluğu (${year})</h5>
        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead><tr><th>Ürün</th><th>Üretim (ton)</th><th>Toplam CO2e (t)</th><th>tCO2e / ton ürün</th></tr></thead>
            <tbody>${rows.map(r => `<tr><td>${r.name}</td><td>${Utils.fmt(r.qty,0)}</td><td>${Utils.fmt(r.co2e,3)}</td><td><strong>${Utils.fmt(r.intensity,4)}</strong></td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">Veri yok</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  window.Modules.production = {
    render(container) {
      container.innerHTML = `
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-prod-data">Üretim Verileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-def">Ürün Tanımları</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-chem-def">Kimyasal Tanımları</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-analytics">Üretim Analizleri</button></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="tab-prod-data">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Kimyasal tüketimi doğrudan üretim kaydı içinde girilir — "Kimyasal Tüketimleri" alanından birden
              fazla kimyasal ekleyebilirsiniz. Kimyasal tanımlı değilse önce "Kimyasal Tanımları" sekmesinden ekleyin.</div>
            ${productionCrud.html()}
          </div>
          <div class="tab-pane fade" id="tab-prod-def">${productCrud.html()}</div>
          <div class="tab-pane fade" id="tab-chem-def">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Üretimde kullanılan kimyasalları burada tanımlayın — üretim kaydı girişinde bu listeden seçilir.</div>
            ${chemicalCrud.html()}
          </div>
          <div class="tab-pane fade" id="tab-prod-analytics"><div id="productionAnalyticsWrap"></div></div>
        </div>`;
      productionCrud.mount(); productCrud.mount();
      chemicalCrud.mount();
      renderAnalytics();
      document.querySelector('[data-bs-target="#tab-prod-analytics"]').addEventListener('shown.bs.tab', renderAnalytics);
    },
    renderAnalytics
  };
})();
