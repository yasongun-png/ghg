/*
 * reports.js — sections 24-29: Aylık/Yıllık/Ürün Bazlı Rapor, Yıllar Arası
 * Karşılaştırma, ISO 14064 Envanter Raporu, GHG Protocol Raporu.
 */
(function () {
  window.Modules = window.Modules || {};
  const M = Validation.MONTHS;
  let energyChart = null;
  let productChemicalChart = null;
  const productCharts = {};
  const energyTypeCharts = {};

  // Kimyasal tüketimi productionData kaydının İÇİNDE, ürüne bağlı olarak
  // girildiği için (production.js'teki "chemicalConsumptions" repeater
  // alanı) — enerji tüketiminin aksine burada gerçek ürün bazlı kırılım
  // mümkün: aynı ürünün o yıl içindeki tüm üretim kayıtlarındaki kimyasal
  // satırları, kimyasal+birim bazında toplanır.
  function chemicalConsumptionByProduct(year, productId) {
    if (!productId) return [];
    const recs = Store.getAll('productionData').filter(p => Number(p.year) === year && String(p.productId) === String(productId));
    const byChem = {};
    recs.forEach(p => {
      (p.chemicalConsumptions || []).forEach(c => {
        if (!c.chemicalId) return;
        const key = c.chemicalId + '|' + (c.unit || '');
        if (!byChem[key]) byChem[key] = { chemicalId: c.chemicalId, unit: c.unit || '', quantity: 0 };
        byChem[key].quantity += Number(c.quantity) || 0;
      });
    });
    return Object.values(byChem).map(r => ({ name: Utils.chemicalName(r.chemicalId), unit: r.unit, quantity: r.quantity }))
      .sort((a, b) => b.quantity - a.quantity);
  }

  function buildEnergyChart(year) {
    const ctx = document.getElementById('rp-energy-chart');
    if (!ctx) return;
    if (energyChart) energyChart.destroy();
    const rows = monthlyElectricBalance(year);
    energyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: 'Üretim (kWh)', data: rows.map(r => r.production), backgroundColor: '#2e8b57' },
          { label: 'Satın Alma (kWh)', data: rows.map(r => r.purchase), backgroundColor: '#1971c2' },
          { label: 'Satış (kWh)', data: rows.map(r => r.sales), backgroundColor: '#f08c00' },
          { label: 'Tüketim (kWh)', data: rows.map(r => r.consumption), backgroundColor: '#9c36b5' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function yearStats(year, extraFilter) {
    const cf = Object.assign({ year }, extraFilter || {});
    const production = Store.getAll('productionData').filter(p => Number(p.year) === year && (!extraFilter || !extraFilter.productId || String(p.productId) === String(extraFilter.productId)));
    const totalProduction = production.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const energy = Store.getAll('energyData').filter(e => Number(e.year) === year);
    const totalEnergy = energy.reduce((s, e) => s + (Number(e.consumptionKwhEquivalent) || 0), 0);
    const scope1 = Calc.sumCO2eTon(Object.assign({}, cf, { scope: 1 }));
    const scope2 = Calc.sumCO2eTon(Object.assign({}, cf, { scope: 2, module: 'scope2-location' }));
    const scope3 = Calc.sumCO2eTon(Object.assign({}, cf, { scope: 3 }));
    const total = scope1 + scope2 + scope3;
    const elecProduced = Store.getAll('energyProductionData').filter(r => Number(r.year) === year && r.energyType === 'Elektrik').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const elecPurchased = Store.getAll('energyPurchaseData').filter(r => Number(r.year) === year && r.energyType === 'Elektrik').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const elecSold = Store.getAll('energySalesData').filter(r => Number(r.year) === year && r.energyType === 'Elektrik').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const selfSufficiency = (elecProduced + elecPurchased) ? (elecProduced / (elecProduced + elecPurchased)) * 100 : 0;
    return { year, totalProduction, totalEnergy, scope1, scope2, scope3, total, intensity: totalProduction ? total / totalProduction : 0,
      elecProduced, elecPurchased, elecSold, selfSufficiency };
  }

  // Groups Enerji Üretim / Satışı / Satın Alma / Tüketim by energy type so
  // the four tabs entered separately in Enerji Verileri can be compared side
  // by side — these quantities are informational (self-generation's own
  // emissions are already in Scope 1 via the fuel burned), not additional
  // emission sources, so this stays report-only, not a Calc source.
  function energyTypeBalanceRows(year) {
    const types = Array.from(new Set([
      ...Store.getAll('energyProductionData').map(r => r.energyType),
      ...Store.getAll('energySalesData').map(r => r.energyType),
      ...Store.getAll('energyPurchaseData').map(r => r.energyType),
      ...Store.getAll('energyData').map(r => r.energyType)
    ].filter(Boolean)));
    const sum = (key, type) => Store.getAll(key).filter(r => Number(r.year) === year && r.energyType === type).reduce((s, r) => s + (Number(r.amount != null ? r.amount : r.consumption) || 0), 0);
    return types.map(type => {
      const cfg = (window.Modules.energy.ENERGY_TYPES[type] || {});
      return {
        type, unit: cfg.unit || '',
        production: sum('energyProductionData', type),
        sales: sum('energySalesData', type),
        purchase: sum('energyPurchaseData', type),
        consumption: sum('energyData', type)
      };
    }).filter(r => r.production || r.sales || r.purchase || r.consumption);
  }

  function purchaseSupplierRows(year) {
    const rows = Store.getAll('energyPurchaseData').filter(r => Number(r.year) === year && r.supplier);
    const bySupplier = {};
    rows.forEach(r => {
      const k = r.supplier;
      if (!bySupplier[k]) bySupplier[k] = { supplier: k, amount: 0, totalCost: 0, currency: r.currency || 'TL', count: 0 };
      bySupplier[k].amount += Number(r.amount) || 0;
      bySupplier[k].totalCost += Number(r.totalCost) || 0;
      bySupplier[k].count += 1;
    });
    return Object.values(bySupplier).sort((a, b) => b.totalCost - a.totalCost);
  }

  function monthlyElectricBalance(year) {
    return monthlyEnergyTypeBalance(year, 'Elektrik');
  }

  // Ay × enerji türü kırılımlı denge — spec: "enerji türüne bağlı olarak
  // aylık bazda enerji türü dengesi", değerler doğrudan Enerji Verileri
  // ekranından (energyProductionData/energySalesData/energyPurchaseData/
  // energyData) toplanır.
  function monthlyEnergyTypeBalance(year, type) {
    return M.map((label, i) => {
      const m = i + 1;
      const f = (key, field) => Store.getAll(key).filter(r => Number(r.year) === year && r.month === m && r.energyType === type).reduce((s, r) => s + (Number(r[field]) || 0), 0);
      return { label, production: f('energyProductionData', 'amount'), sales: f('energySalesData', 'amount'), purchase: f('energyPurchaseData', 'amount'), consumption: f('energyData', 'consumption') };
    });
  }

  function monthlyReportRows(year) {
    return M.map((label, i) => {
      const m = i + 1;
      const production = Store.getAll('productionData').filter(p => Number(p.year) === year && p.month === m).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
      const energy = Store.getAll('energyData').filter(e => Number(e.year) === year && e.month === m).reduce((s, e) => s + (Number(e.consumptionKwhEquivalent) || 0), 0);
      const s1 = Calc.sumCO2eTon({ year, month: m, scope: 1 });
      const s2 = Calc.sumCO2eTon({ year, month: m, scope: 2, module: 'scope2-location' });
      const s3 = Calc.sumCO2eTon({ year, month: m, scope: 3 });
      const total = s1 + s2 + s3;
      return [label, production, energy, s1, s2, s3, total, production ? total / production : 0];
    });
  }

  function productReportRows(year) {
    const products = Store.getAll('productData');
    return products.map(p => {
      const production = Store.getAll('productionData').filter(x => Number(x.year) === year && String(x.productId) === String(p.id)).reduce((s, x) => s + (Number(x.quantity) || 0), 0);
      const s1 = Calc.sumCO2eTon({ year, productId: p.id, scope: 1 });
      const s2 = Calc.sumCO2eTon({ year, productId: p.id, scope: 2, module: 'scope2-location' });
      const s3 = Calc.sumCO2eTon({ year, productId: p.id, scope: 3 });
      const total = s1 + s2 + s3;
      return { name: p.name, production, s1, s2, s3, total, intensity: production ? total / production : 0 };
    }).filter(r => r.production > 0 || r.total > 0);
  }

  function tabMonthly(year) {
    const rows = monthlyReportRows(year);
    return `<div class="section-card">
      <h5><i class="fa-solid fa-calendar"></i> Aylık Rapor (${year})
        <div class="ms-auto"><button class="btn btn-sm btn-outline-success" id="rp-monthly-xlsx"><i class="fa-solid fa-file-excel"></i> Excel</button>
        <button class="btn btn-sm btn-outline-danger" id="rp-monthly-pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button></div></h5>
      <div class="table-responsive"><table class="table table-sm table-hover">
        <thead><tr><th>Ay</th><th>Üretim (ton)</th><th>Enerji (kWh eşd.)</th><th>Scope 1</th><th>Scope 2</th><th>Scope 3</th><th>Toplam CO2e</th><th>tCO2e/ton</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${r[0]}</td>${r.slice(1).map((v,i)=>`<td>${Utils.fmt(v, i===6?0:3)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></div>`;
  }

  function tabAnnual(year) {
    const s = yearStats(year);
    return `<div class="section-card">
      <h5><i class="fa-solid fa-calendar-days"></i> Yıllık Özet Rapor (${year})</h5>
      <div class="kpi-row">
        <div class="kpi-card accent-total"><div class="kpi-label">Toplam Üretim</div><div class="kpi-value">${Utils.fmt(s.totalProduction,0)} <span class="kpi-unit">ton</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Toplam Enerji</div><div class="kpi-value">${Utils.fmt(s.totalEnergy,0)} <span class="kpi-unit">kWh eşd.</span></div></div>
        <div class="kpi-card accent-1"><div class="kpi-label">Scope 1</div><div class="kpi-value">${Utils.fmt(s.scope1,2)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Scope 2</div><div class="kpi-value">${Utils.fmt(s.scope2,2)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-3"><div class="kpi-label">Scope 3</div><div class="kpi-value">${Utils.fmt(s.scope3,2)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-total"><div class="kpi-label">Toplam CO2e</div><div class="kpi-value">${Utils.fmt(s.total,2)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-total"><div class="kpi-label">Karbon Yoğunluğu</div><div class="kpi-value">${Utils.fmt(s.intensity,4)} <span class="kpi-unit">tCO2e/ton</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Enerji Yoğunluğu</div><div class="kpi-value">${Utils.fmt(s.totalProduction?s.totalEnergy/s.totalProduction:0,2)} <span class="kpi-unit">kWh/ton</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Elektrik Üretimi (Öz Kaynak)</div><div class="kpi-value">${Utils.fmt(s.elecProduced,0)} <span class="kpi-unit">kWh</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Elektrik Satın Alma</div><div class="kpi-value">${Utils.fmt(s.elecPurchased,0)} <span class="kpi-unit">kWh</span></div></div>
        <div class="kpi-card accent-total"><div class="kpi-label">Enerji Öz Yeterlilik</div><div class="kpi-value">%${Utils.fmt(s.selfSufficiency,1)}</div></div>
      </div>
      <p class="text-end mt-2"><a href="javascript:void(0)" data-tab-nav="rp-energy-tab-btn" class="small">Enerji Raporu detayını görüntüle <i class="fa-solid fa-arrow-right"></i></a></p></div>`;
  }

  function tabProduct(year) {
    const rows = productReportRows(year);
    const monthly = monthlyReportRows(year); // [label, production, energy, s1, s2, s3, total, intensity]
    const chartCard = (id, title) => `<div class="col-lg-6"><div class="chart-card"><h6>${title}</h6><div class="chart-wrap"><canvas id="${id}"></canvas></div></div></div>`;
    return `<div class="section-card">
      <h5><i class="fa-solid fa-flask-vial"></i> Ürün Bazlı Rapor (${year})
        <div class="ms-auto"><button class="btn btn-sm btn-outline-success" id="rp-product-xlsx"><i class="fa-solid fa-file-excel"></i> Excel</button></div></h5>
      <div class="table-responsive"><table class="table table-sm table-hover">
        <thead><tr><th>Ürün</th><th>Üretim (ton)</th><th>Scope 1</th><th>Scope 2</th><th>Scope 3</th><th>Toplam CO2e</th><th>tCO2e/ton</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${r.name}</td><td>${Utils.fmt(r.production,0)}</td><td>${Utils.fmt(r.s1,3)}</td><td>${Utils.fmt(r.s2,3)}</td><td>${Utils.fmt(r.s3,3)}</td><td>${Utils.fmt(r.total,3)}</td><td><strong>${Utils.fmt(r.intensity,4)}</strong></td></tr>`).join('') || '<tr><td colspan="7" class="text-muted">Veri yok</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="row">
      ${chartCard('rp-chart-prod-production', 'Ürün Bazında Üretim (ton)')}
      ${chartCard('rp-chart-prod-scope1', 'Ürün Bazında Scope 1 (tCO2e)')}
      ${chartCard('rp-chart-prod-scope2', 'Ürün Bazında Scope 2 (tCO2e)')}
      ${chartCard('rp-chart-prod-scope3', 'Ürün Bazında Scope 3 (tCO2e)')}
      ${chartCard('rp-chart-prod-total', 'Ürün Bazında Toplam CO2e (tCO2e)')}
    </div>
    <div class="section-card">
      <h6><i class="fa-solid fa-bolt"></i> Aylık Enerji Tüketimi — Tesis Geneli (${year})
        <div class="ms-auto"><button class="btn btn-sm btn-outline-success" id="rp-prod-consumption-xlsx"><i class="fa-solid fa-file-excel"></i> Excel</button></div></h6>
      <p class="text-muted small">Enerji tüketimi Enerji Verileri ekranında ürün bazında değil tesis genelinde girildiği için burada ürünlerden bağımsız, ay bazında toplam olarak gösterilir.</p>
      <div class="table-responsive"><table class="table table-sm table-hover mb-2">
        <thead><tr><th>Ay</th><th>Enerji Tüketimi (kWh eşd.)</th></tr></thead>
        <tbody>${monthly.map(r => `<tr><td>${r[0]}</td><td>${Utils.fmt(r[2],0)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="chart-wrap" style="height:220px"><canvas id="rp-chart-prod-consumption"></canvas></div>
    </div>
    <div class="section-card">
      <h6><i class="fa-solid fa-flask"></i> Ürün Bazında Kimyasal Tüketimi (${year})
        <div class="ms-auto"><button class="btn btn-sm btn-outline-success" id="rp-prod-chemical-xlsx"><i class="fa-solid fa-file-excel"></i> Excel</button></div></h6>
      <div class="row mb-2">
        <div class="col-md-4"><label class="text-xs form-label mb-1">Ürün Seçin</label>
          <select id="rp-prod-chemical-select" class="form-select form-select-sm"><option value="">Seçiniz...</option>${Utils.productOptions()}</select></div>
      </div>
      <div id="rp-prod-chemical-body">${chemicalBodyHtml(year, '')}</div>
    </div>`;
  }

  function chemicalBodyHtml(year, productId) {
    if (!productId) return '<p class="text-muted small mb-0">Kimyasal tüketimini görüntülemek için bir ürün seçin.</p>';
    const rows = chemicalConsumptionByProduct(year, productId);
    if (!rows.length) return '<p class="text-muted small mb-0">Bu ürün için bu yıl kaydedilmiş kimyasal tüketimi yok.</p>';
    return `<div class="table-responsive"><table class="table table-sm table-hover mb-2">
        <thead><tr><th>Kimyasal</th><th>Toplam Tüketim</th><th>Birim</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${r.name}</td><td>${Utils.fmt(r.quantity,2)}</td><td>${r.unit}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="chart-wrap" style="height:220px"><canvas id="rp-chart-prod-chemical"></canvas></div>`;
  }

  function buildProdChemicalChart(year, productId) {
    if (productChemicalChart) { productChemicalChart.destroy(); productChemicalChart = null; }
    const ctx = document.getElementById('rp-chart-prod-chemical');
    if (!ctx) return;
    const rows = chemicalConsumptionByProduct(year, productId);
    productChemicalChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => `${r.name} (${r.unit})`), datasets: [{ label: 'Tüketim', data: rows.map(r => r.quantity), backgroundColor: '#9c36b5' }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });
  }

  function bindProdChemicalSelect(year) {
    const sel = document.getElementById('rp-prod-chemical-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      document.getElementById('rp-prod-chemical-body').innerHTML = chemicalBodyHtml(year, sel.value);
      buildProdChemicalChart(year, sel.value);
    });
    const xlsxBtn = document.getElementById('rp-prod-chemical-xlsx');
    if (xlsxBtn) xlsxBtn.addEventListener('click', () => {
      if (!sel.value) { Utils.toast('Önce bir ürün seçin.', 'warning'); return; }
      const rows = chemicalConsumptionByProduct(year, sel.value);
      const productName = (Store.getById('productData', sel.value) || {}).name || 'Urun';
      Utils.exportTableToExcel(`Kimyasal_Tuketimi_${productName}_${year}.xlsx`, 'Kimyasal Tüketimi',
        ['Kimyasal', 'Toplam Tüketim', 'Birim'], rows.map(r => [r.name, r.quantity, r.unit]));
    });
  }

  function buildProductCharts(year) {
    Object.keys(productCharts).forEach(k => { if (productCharts[k]) productCharts[k].destroy(); });
    const rows = productReportRows(year);
    const monthly = monthlyReportRows(year);
    const labels = rows.map(r => r.name);
    const mk = (id, label, data, color) => {
      const ctx = document.getElementById(id);
      if (!ctx) return;
      productCharts[id] = new Chart(ctx, {
        type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: color }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
      });
    };
    mk('rp-chart-prod-production', 'Üretim (ton)', rows.map(r => r.production), '#f08c00');
    mk('rp-chart-prod-scope1', 'Scope 1 (tCO2e)', rows.map(r => r.s1), '#d9480f');
    mk('rp-chart-prod-scope2', 'Scope 2 (tCO2e)', rows.map(r => r.s2), '#1971c2');
    mk('rp-chart-prod-scope3', 'Scope 3 (tCO2e)', rows.map(r => r.s3), '#9c36b5');
    mk('rp-chart-prod-total', 'Toplam CO2e (tCO2e)', rows.map(r => r.total), '#2e8b57');
    const ctxC = document.getElementById('rp-chart-prod-consumption');
    if (ctxC) {
      productCharts['rp-chart-prod-consumption'] = new Chart(ctxC, {
        type: 'bar', data: { labels: M, datasets: [{ label: 'Enerji Tüketimi (kWh eşd.)', data: monthly.map(r => r[2]), backgroundColor: '#087f5b' }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }

  // Enerji türüne bağlı aylık denge — Üretim/Satış/Satın Alma/Tüketim
  // değerleri doğrudan Enerji Verileri ekranından toplanır (spec: "tabloda
  // değerler enerji verilerinden alınarak gelsin").
  function monthlyTypeTableHtml(type, year) {
    const rows = monthlyEnergyTypeBalance(year, type);
    const cfg = (window.Modules.energy.ENERGY_TYPES[type] || {});
    const total = (field) => rows.reduce((s, r) => s + r[field], 0);
    return `<div class="section-card mt-3">
      <h6 class="mb-2">${type} <span class="text-muted small">(${cfg.unit || ''})</span></h6>
      <div class="table-responsive"><table class="table table-sm table-hover mb-2">
        <thead><tr><th>Ay</th><th>Üretim</th><th>Satış</th><th>Satın Alma</th><th>Tüketim</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${r.label}</td><td>${Utils.fmt(r.production,0)}</td><td>${Utils.fmt(r.sales,0)}</td><td>${Utils.fmt(r.purchase,0)}</td><td>${Utils.fmt(r.consumption,0)}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="fw-bold"><td>Toplam</td><td>${Utils.fmt(total('production'),0)}</td><td>${Utils.fmt(total('sales'),0)}</td><td>${Utils.fmt(total('purchase'),0)}</td><td>${Utils.fmt(total('consumption'),0)}</td></tr></tfoot>
      </table></div>
      <div class="chart-wrap" style="height:200px"><canvas id="rp-energy-type-chart-${type.replace(/[^a-zA-Z0-9]/g,'')}"></canvas></div>
    </div>`;
  }

  function buildEnergyTypeCharts(year) {
    Object.keys(energyTypeCharts).forEach(k => { if (energyTypeCharts[k]) energyTypeCharts[k].destroy(); });
    energyTypeBalanceRows(year).forEach(b => {
      const chartId = `rp-energy-type-chart-${b.type.replace(/[^a-zA-Z0-9]/g,'')}`;
      const ctx = document.getElementById(chartId);
      if (!ctx) return;
      const rows = monthlyEnergyTypeBalance(year, b.type);
      energyTypeCharts[chartId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: M, datasets: [
          { label: 'Üretim', data: rows.map(r => r.production), backgroundColor: '#2e8b57' },
          { label: 'Satın Alma', data: rows.map(r => r.purchase), backgroundColor: '#1971c2' },
          { label: 'Satış', data: rows.map(r => r.sales), backgroundColor: '#f08c00' },
          { label: 'Tüketim', data: rows.map(r => r.consumption), backgroundColor: '#9c36b5' }
        ] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    });
  }

  function tabEnergy(year) {
    const s = yearStats(year);
    const balance = energyTypeBalanceRows(year);
    const suppliers = purchaseSupplierRows(year);
    return `<div class="section-card">
      <h5><i class="fa-solid fa-bolt"></i> Enerji Raporu (${year})
        <div class="ms-auto"><button class="btn btn-sm btn-outline-success" id="rp-energy-xlsx"><i class="fa-solid fa-file-excel"></i> Excel</button></div></h5>
      <div class="kpi-row">
        <div class="kpi-card accent-2"><div class="kpi-label">Elektrik Üretimi (Öz Kaynak)</div><div class="kpi-value">${Utils.fmt(s.elecProduced,0)} <span class="kpi-unit">kWh</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Elektrik Satın Alma</div><div class="kpi-value">${Utils.fmt(s.elecPurchased,0)} <span class="kpi-unit">kWh</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Elektrik Satışı</div><div class="kpi-value">${Utils.fmt(s.elecSold,0)} <span class="kpi-unit">kWh</span></div></div>
        <div class="kpi-card accent-total"><div class="kpi-label">Enerji Öz Yeterlilik</div><div class="kpi-value">%${Utils.fmt(s.selfSufficiency,1)}</div></div>
      </div>
      <p class="text-muted small">Öz yeterlilik = Öz üretim / (Öz üretim + Satın Alma). Üretim ve satış bilgileri Scope 1/2 hesabına dahil edilmez, sadece bilgi amaçlıdır — kendi ürettiğiniz enerjinin emisyonu, onu üretmek için yaktığınız yakıt üzerinden Scope 1'de zaten hesaplanır.</p>
      <h6 class="mt-3">Enerji Türüne Göre Denge</h6>
      <div class="table-responsive"><table class="table table-sm table-hover">
        <thead><tr><th>Enerji Türü</th><th>Üretim</th><th>Satış</th><th>Satın Alma</th><th>Tüketim (Kayıtlı)</th><th>Birim</th></tr></thead>
        <tbody>${balance.map(r => `<tr><td>${r.type}</td><td>${Utils.fmt(r.production,0)}</td><td>${Utils.fmt(r.sales,0)}</td><td>${Utils.fmt(r.purchase,0)}</td><td>${Utils.fmt(r.consumption,0)}</td><td>${r.unit}</td></tr>`).join('') || '<tr><td colspan="6" class="text-muted">Veri yok</td></tr>'}</tbody>
      </table></div>
      <h6 class="mt-4">Tedarikçi Bazında Satın Alma (Maliyet)</h6>
      <div class="table-responsive"><table class="table table-sm table-hover">
        <thead><tr><th>Tedarikçi</th><th>Kayıt Sayısı</th><th>Toplam Miktar</th><th>Toplam Tutar</th></tr></thead>
        <tbody>${suppliers.map(r => `<tr><td>${r.supplier}</td><td>${r.count}</td><td>${Utils.fmt(r.amount,0)}</td><td>${Utils.fmt(r.totalCost,2)} ${r.currency}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">Veri yok</td></tr>'}</tbody>
      </table></div>
      <div class="chart-card mt-3"><h6>Aylık Elektrik Dengesi (Üretim / Satın Alma / Satış / Tüketim)</h6><div class="chart-wrap"><canvas id="rp-energy-chart"></canvas></div></div>
    </div>
    <div class="section-card">
      <h5 class="mb-0"><i class="fa-solid fa-calendar-week"></i> Enerji Türüne Göre Aylık Denge (${year})</h5>
      <p class="text-muted small mb-0">Her enerji türü için Üretim / Satış / Satın Alma / Tüketim değerleri ay bazında, Enerji Verileri ekranından.</p>
    </div>
    ${balance.length ? balance.map(b => monthlyTypeTableHtml(b.type, year)).join('') : '<div class="section-card"><p class="text-muted small mb-0">Bu yıl için enerji verisi yok.</p></div>'}`;
  }

  function tabComparison() {
    const years = Utils.availableYears().slice().sort((a, b) => a - b);
    const yearOpts = years.map(y => `<option value="${y}">${y}</option>`).join('');
    return `<div class="section-card">
      <h5><i class="fa-solid fa-arrows-left-right"></i> Yıllar Arası Karşılaştırma</h5>
      <div class="row mb-3">
        <div class="col-md-3"><label class="text-xs form-label">Yıl A (Baz)</label><select id="cmp-a" class="form-select form-select-sm">${yearOpts}</select></div>
        <div class="col-md-3"><label class="text-xs form-label">Yıl B</label><select id="cmp-b" class="form-select form-select-sm">${yearOpts}</select></div>
        <div class="col-md-2 d-flex align-items-end"><button id="cmp-run" class="btn btn-sm btn-primary w-100">Karşılaştır</button></div>
      </div>
      <div id="cmp-result"></div></div>`;
  }

  function runComparison() {
    const yA = Number(document.getElementById('cmp-a').value);
    const yB = Number(document.getElementById('cmp-b').value);
    const a = yearStats(yA), b = yearStats(yB);
    const pct = (x, y) => x ? (((y - x) / x) * 100) : (y ? 100 : 0);
    const rows = [
      ['Üretim (ton)', a.totalProduction, b.totalProduction],
      ['Enerji (kWh eşd.)', a.totalEnergy, b.totalEnergy],
      ['Scope 1 (tCO2e)', a.scope1, b.scope1],
      ['Scope 2 (tCO2e)', a.scope2, b.scope2],
      ['Scope 3 (tCO2e)', a.scope3, b.scope3],
      ['Toplam CO2e (tCO2e)', a.total, b.total],
      ['Karbon Yoğunluğu (tCO2e/ton)', a.intensity, b.intensity]
    ];
    document.getElementById('cmp-result').innerHTML = `<div class="table-responsive"><table class="table table-sm table-hover">
      <thead><tr><th>Gösterge</th><th>${yA}</th><th>${yB}</th><th>Değişim</th></tr></thead>
      <tbody>${rows.map(r => { const p = pct(r[1], r[2]); const cls = p > 0 ? 'text-danger' : 'text-success'; return `<tr><td>${r[0]}</td><td>${Utils.fmt(r[1],3)}</td><td>${Utils.fmt(r[2],3)}</td><td class="${cls} fw-bold">${p>=0?'+':''}${Utils.fmt(p,1)}%</td></tr>`; }).join('')}</tbody>
    </table></div>`;
  }

  function tabIso(year) {
    const company = Store.getAll('companyData')[0] || {};
    const facilities = Store.getAll('facilityData');
    const s = yearStats(year);
    const factorsUsed = Array.from(new Set(Calc.resultsFor({ year }).map(r => r.factorSnapshot ? r.factorSnapshot.source : null).filter(Boolean)));
    const dqCounts = {};
    ['productionData','energyData','scope1Data','scope3Data','processEmissionData','fugitiveEmissionData'].forEach(k => {
      Store.getAll(k).filter(r => Number(r.year) === year).forEach(r => dqCounts[r.dataQuality] = (dqCounts[r.dataQuality]||0)+1);
    });
    const ry = Store.getAll('reportingYears').find(r => Number(r.year) === year) || {};
    return `<div class="section-card">
      <h5><i class="fa-solid fa-file-contract"></i> ISO 14064-1 Envanter Raporu (${year})
        <div class="ms-auto"><button class="btn btn-sm btn-outline-danger" id="rp-iso-pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button></div></h5>
      <div id="iso-report-body" class="text-sm">
        <h6>1. Kuruluş Bilgileri</h6><p>${company.name || '-'} | Vergi No: ${company.taxNo || '-'} | Sektör: ${company.sector || '-'} | NACE: ${company.naceCode || '-'}</p>
        <h6>2. Raporlama Dönemi</h6><p>${ry.startDate || '-'} — ${ry.endDate || '-'} (Baz Yıl: ${ry.baseYear || '-'})</p>
        <h6>3-4. Organizasyonel / Operasyonel Sınırlar</h6><p>${company.organizationalBoundary || '-'} / ${company.operationalBoundary || '-'}</p>
        <h6>5-7. Scope 1 / Scope 2 / Scope 3</h6>
        <p>Scope 1: ${Utils.fmt(s.scope1,3)} tCO2e | Scope 2: ${Utils.fmt(s.scope2,3)} tCO2e | Scope 3: ${Utils.fmt(s.scope3,3)} tCO2e | <strong>Toplam: ${Utils.fmt(s.total,3)} tCO2e</strong></p>
        <h6>8. Emisyon Kaynakları</h6><p>${facilities.map(f=>f.name).join(', ') || '-'}</p>
        <h6>9-10. Hesaplama Metodolojisi ve Emisyon Faktörleri</h6>
        <p>Kullanılan faktör kaynakları: ${factorsUsed.join('; ') || '-'}</p>
        <h6>11. GWP Değerleri</h6><p>Raporlama yılı GWP seti: ${ry.gwpSet || '-'}</p>
        <h6>12. Veri Kalitesi</h6><p>${Object.entries(dqCounts).map(([k,v])=>`${k}: ${v}`).join(', ') || '-'}</p>
        <h6>13. Belirsizlik</h6><p>Ölçüm/tahmin bazlı verilerde belirsizlik veri kalite sınıfına (A-E) göre değerlendirilmelidir.</p>
        <h6>16. Karbon Yoğunluğu</h6><p>${Utils.fmt(s.intensity,4)} tCO2e / ton ürün</p>
        <h6>17. Baz Yıl Karşılaştırması</h6><p>${ry.baseYear ? ('Baz yıl ' + ry.baseYear + ' ile karşılaştırma "Yıllar Arası Karşılaştırma" sekmesinden yapılabilir.') : 'Baz yıl tanımlanmamış.'}</p>
      </div></div>`;
  }

  function tabGhg(year) {
    const scope3Rows = Calc.breakdownByCategory({ year, module: 'scope3' });
    const s = yearStats(year);
    return `<div class="section-card">
      <h5><i class="fa-solid fa-globe"></i> GHG Protocol Raporu (${year})</h5>
      <div class="kpi-row">
        <div class="kpi-card accent-1"><div class="kpi-label">Scope 1</div><div class="kpi-value">${Utils.fmt(s.scope1,3)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Scope 2 (Location)</div><div class="kpi-value">${Utils.fmt(s.scope2,3)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-2"><div class="kpi-label">Scope 2 (Market)</div><div class="kpi-value">${Utils.fmt(Calc.sumCO2eTon({year, module:'scope2-market'}),3)} <span class="kpi-unit">tCO2e</span></div></div>
        <div class="kpi-card accent-3"><div class="kpi-label">Scope 3</div><div class="kpi-value">${Utils.fmt(s.scope3,3)} <span class="kpi-unit">tCO2e</span></div></div>
      </div>
      <h6>Scope 3 - 15 Kategori Dağılımı</h6>
      <div class="table-responsive"><table class="table table-sm table-hover">
        <thead><tr><th>Kategori</th><th>CO2e (ton)</th></tr></thead>
        <tbody>${scope3Rows.map(r => `<tr><td>${r.category}</td><td>${Utils.fmt(r.totalCO2eTon,3)}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">Veri yok</td></tr>'}</tbody>
      </table></div></div>`;
  }

  // Builds a full PPTX deck from everything the report tabs already compute —
  // KPIs, monthly trend, product intensity, scope/category breakdowns, data
  // quality — as native (editable) PowerPoint charts/tables, not screenshots.
  function generatePptx(year) {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
    pptx.layout = 'WIDE';
    const company = Store.getAll('companyData')[0] || {};
    pptx.author = 'Kurumsal Sera Gazı Envanteri Uygulaması';
    pptx.company = company.name || '';
    pptx.title = `Sera Gazı Envanteri Sunumu ${year}`;

    const BRAND = '1B5E3A', BRAND_LIGHT = '2E8B57', SCOPE1 = 'D9480F', SCOPE2 = '1971C2', SCOPE3 = '9C36B5';
    const PIE_COLORS = [BRAND_LIGHT, SCOPE1, SCOPE2, SCOPE3, 'F08C00', '087F5B', 'E64980', '495057'];

    function titleBar(slide, text) {
      slide.background = { color: 'FFFFFF' };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: BRAND } });
      slide.addText(text, { x: 0.4, y: 0, w: 12.5, h: 0.9, fontSize: 24, bold: true, color: 'FFFFFF', valign: 'middle', fontFace: 'Calibri' });
    }

    // 1. Title slide
    let slide = pptx.addSlide();
    slide.background = { color: BRAND };
    slide.addText(company.name || 'Kurumsal Sera Gazı Envanteri', { x: 0.5, y: 2.6, w: 12.33, h: 1.2, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' });
    slide.addText(`Sera Gazı Envanteri ve Karbon Yönetimi Sunumu — ${year}`, { x: 0.5, y: 3.8, w: 12.33, h: 0.6, fontSize: 18, color: 'E9FBEF', align: 'center' });
    slide.addText('ISO 14064-1 ve GHG Protocol Corporate Standard esas alınarak hazırlanmıştır.', { x: 0.5, y: 4.5, w: 12.33, h: 0.5, fontSize: 12, color: 'C3E6CE', align: 'center', italic: true });
    slide.addText(new Date().toLocaleDateString('tr-TR'), { x: 0.5, y: 6.7, w: 12.33, h: 0.4, fontSize: 10, color: 'C3E6CE', align: 'center' });

    // 2. Yönetici Özeti
    const s = yearStats(year);
    slide = pptx.addSlide();
    titleBar(slide, `Yönetici Özeti — ${year}`);
    const kpiRows = [
      ['Gösterge', 'Değer'],
      ['Toplam Üretim', `${Utils.fmt(s.totalProduction, 0)} ton`],
      ['Toplam Enerji', `${Utils.fmt(s.totalEnergy, 0)} kWh eşd.`],
      ['Scope 1', `${Utils.fmt(s.scope1, 2)} tCO2e`],
      ['Scope 2 (Location-Based)', `${Utils.fmt(s.scope2, 2)} tCO2e`],
      ['Scope 3', `${Utils.fmt(s.scope3, 2)} tCO2e`],
      ['Toplam CO2e', `${Utils.fmt(s.total, 2)} tCO2e`],
      ['Karbon Yoğunluğu', `${Utils.fmt(s.intensity, 4)} tCO2e/ton ürün`]
    ];
    slide.addTable(kpiRows.map((r, i) => r.map(c => ({ text: c, options: { bold: i === 0, fill: i === 0 ? { color: BRAND } : (i % 2 ? 'F4F6F8' : 'FFFFFF'), color: i === 0 ? 'FFFFFF' : '212529', fontSize: 14 } }))),
      { x: 1.5, y: 1.4, w: 10.33, h: 5, colW: [6, 4.33], border: { type: 'solid', color: 'E2E6EA', pt: 1 } });

    // 3. Scope 1/2/3 Dağılımı
    slide = pptx.addSlide();
    titleBar(slide, 'Scope 1 / 2 / 3 Dağılımı');
    slide.addChart(pptx.ChartType.pie,
      [{ name: 'CO2e (ton)', labels: ['Scope 1', 'Scope 2', 'Scope 3'], values: [s.scope1, s.scope2, s.scope3] }],
      { x: 1.2, y: 1.2, w: 6.5, h: 5.5, chartColors: [SCOPE1, SCOPE2, SCOPE3], showLegend: true, legendPos: 'b', showValue: true, dataLabelColor: 'FFFFFF', showPercent: true });
    slide.addTable([
      ['Scope', 'tCO2e', '%'],
      ['Scope 1', Utils.fmt(s.scope1, 2), s.total ? Utils.fmt(s.scope1 / s.total * 100, 1) + '%' : '-'],
      ['Scope 2', Utils.fmt(s.scope2, 2), s.total ? Utils.fmt(s.scope2 / s.total * 100, 1) + '%' : '-'],
      ['Scope 3', Utils.fmt(s.scope3, 2), s.total ? Utils.fmt(s.scope3 / s.total * 100, 1) + '%' : '-']
    ], { x: 8.2, y: 2.2, w: 4.6, h: 2.5, fontSize: 13, border: { type: 'solid', color: 'E2E6EA', pt: 1 } });

    // 4. Aylık CO2e Trendi
    const monthly = monthlyReportRows(year);
    slide = pptx.addSlide();
    titleBar(slide, `Aylık Toplam CO2e Trendi — ${year}`);
    slide.addChart(pptx.ChartType.bar,
      [{ name: 'Toplam CO2e (ton)', labels: M, values: monthly.map(r => Number(r[6]) || 0) }],
      { x: 0.7, y: 1.2, w: 11.9, h: 5.6, barColor: BRAND_LIGHT, showValue: false, catAxisLabelFontSize: 10, valAxisTitle: 'tCO2e' });

    // 5. Aylık Üretim ve Enerji
    slide = pptx.addSlide();
    titleBar(slide, `Aylık Üretim ve Enerji — ${year}`);
    slide.addChart(pptx.ChartType.bar,
      [
        { name: 'Üretim (ton)', labels: M, values: monthly.map(r => Number(r[1]) || 0) },
        { name: 'Enerji (kWh eşd. / 1000)', labels: M, values: monthly.map(r => (Number(r[2]) || 0) / 1000) }
      ],
      { x: 0.7, y: 1.2, w: 11.9, h: 5.6, barGrouping: 'clustered', chartColors: [BRAND_LIGHT, SCOPE2], showLegend: true, legendPos: 'b', catAxisLabelFontSize: 10 });

    // 5b. Enerji Dengesi (Üretim / Satın Alma / Satış)
    const balance = energyTypeBalanceRows(year);
    if (balance.length) {
      slide = pptx.addSlide();
      titleBar(slide, `Enerji Dengesi — ${year}`);
      slide.addTable([
        ['Enerji Türü', 'Üretim', 'Satış', 'Satın Alma', 'Tüketim', 'Birim'],
        ...balance.map(r => [r.type, Utils.fmt(r.production, 0), Utils.fmt(r.sales, 0), Utils.fmt(r.purchase, 0), Utils.fmt(r.consumption, 0), r.unit])
      ], { x: 0.8, y: 1.3, w: 11.7, h: 3.2, fontSize: 13, border: { type: 'solid', color: 'E2E6EA', pt: 1 } });
      slide.addText(`Elektrik Öz Yeterlilik: %${Utils.fmt(s.selfSufficiency, 1)}  (Öz Üretim: ${Utils.fmt(s.elecProduced, 0)} kWh, Satın Alma: ${Utils.fmt(s.elecPurchased, 0)} kWh, Satış: ${Utils.fmt(s.elecSold, 0)} kWh)`,
        { x: 0.8, y: 4.8, w: 11.7, h: 0.8, fontSize: 13, color: '495057', italic: true });
      slide.addText('Üretim/satış bilgileri bilgi amaçlıdır; öz üretimin emisyonu yakılan yakıt üzerinden Scope 1\'de, sadece satın alınan miktar ise Scope 2\'de hesaplanır.',
        { x: 0.8, y: 5.5, w: 11.7, h: 0.8, fontSize: 11, color: '6C757D' });
    }

    // 6. Ürün Bazlı Karbon Yoğunluğu
    const products = productReportRows(year);
    if (products.length) {
      slide = pptx.addSlide();
      titleBar(slide, `Ürün Bazlı Karbon Yoğunluğu — ${year}`);
      slide.addChart(pptx.ChartType.bar,
        [{ name: 'tCO2e / ton ürün', labels: products.map(p => p.name), values: products.map(p => Number(p.intensity.toFixed(4))) }],
        { x: 0.7, y: 1.2, w: 6.8, h: 5.6, barColor: '087F5B', barDir: 'bar', catAxisLabelFontSize: 10 });
      slide.addTable([
        ['Ürün', 'Üretim (t)', 'Toplam CO2e (t)', 'tCO2e/ton'],
        ...products.map(p => [p.name, Utils.fmt(p.production, 0), Utils.fmt(p.total, 2), Utils.fmt(p.intensity, 4)])
      ], { x: 7.8, y: 1.2, w: 5, h: 5.6, fontSize: 11, border: { type: 'solid', color: 'E2E6EA', pt: 1 } });
    }

    // 7. Scope 3 Kategori Dağılımı
    const scope3Rows = Calc.breakdownByCategory({ year, module: 'scope3' });
    if (scope3Rows.length) {
      slide = pptx.addSlide();
      titleBar(slide, `Scope 3 — Kategori Dağılımı (${year})`);
      slide.addChart(pptx.ChartType.bar,
        [{ name: 'CO2e (ton)', labels: scope3Rows.map(r => r.category), values: scope3Rows.map(r => Number(r.totalCO2eTon.toFixed(3))) }],
        { x: 0.7, y: 1.2, w: 11.9, h: 5.6, barColor: SCOPE3, barDir: 'bar', catAxisLabelFontSize: 9 });
    }

    // 8. Emisyon Kaynaklarının Dağılımı (all scopes, top categories)
    const allCategories = Calc.breakdownByCategory({ year }).slice(0, 8);
    if (allCategories.length) {
      slide = pptx.addSlide();
      titleBar(slide, `Emisyon Kaynaklarının Dağılımı — ${year}`);
      slide.addChart(pptx.ChartType.pie,
        [{ name: 'CO2e (ton)', labels: allCategories.map(c => c.category), values: allCategories.map(c => Number(c.totalCO2eTon.toFixed(3))) }],
        { x: 2.5, y: 1.2, w: 8.3, h: 5.8, chartColors: PIE_COLORS, showLegend: true, legendPos: 'r', showPercent: true });
    }

    // 9. Veri Kalitesi Dağılımı
    const dqCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    ['productionData', 'energyData', 'scope1Data', 'scope3Data', 'processEmissionData', 'fugitiveEmissionData'].forEach(k => {
      Store.getAll(k).filter(r => Number(r.year) === year).forEach(r => { dqCounts[r.dataQuality] = (dqCounts[r.dataQuality] || 0) + 1; });
    });
    slide = pptx.addSlide();
    titleBar(slide, `Veri Kalitesi Dağılımı — ${year}`);
    slide.addChart(pptx.ChartType.bar,
      [{ name: 'Kayıt Sayısı', labels: Object.keys(Store.DATA_QUALITY_LABELS), values: Object.keys(Store.DATA_QUALITY_LABELS).map(k => dqCounts[k] || 0) }],
      { x: 1.5, y: 1.3, w: 10.3, h: 4.6, chartColors: [BRAND_LIGHT], showValue: true });
    slide.addText('A: Ölçülmüş  •  B: Fatura/Sayaç  •  C: Hesaplanmış  •  D: Tahmini  •  E: Varsayılan',
      { x: 1.5, y: 6.1, w: 10.3, h: 0.4, fontSize: 11, color: '6C757D', align: 'center' });

    // 10. Kapanış / Metodoloji
    const ry = Store.getAll('reportingYears').find(r => Number(r.year) === year) || {};
    slide = pptx.addSlide();
    slide.background = { color: BRAND };
    slide.addText('Metodoloji Notu', { x: 0.8, y: 0.7, w: 11.7, h: 0.7, fontSize: 26, bold: true, color: 'FFFFFF' });
    slide.addText(
      [
        { text: `• Hesaplama yöntemi: Aktivite Verisi × Emisyon Faktörü × GWP = CO2e\n`, options: { bullet: false } },
        { text: `• GWP seti: ${ry.gwpSet || 'AR5'}\n` },
        { text: `• Baz yıl: ${ry.baseYear || 'tanımlanmadı'}\n` },
        { text: `• Standartlar: ISO 14064-1, GHG Protocol Corporate Standard, GHG Protocol Scope 2 Guidance, GHG Protocol Scope 3 Standard\n` },
        { text: `• Bu sunum "Kurumsal Sera Gazı Envanteri Uygulaması" içindeki güncel veriden otomatik oluşturulmuştur.` }
      ],
      { x: 0.8, y: 1.7, w: 11.7, h: 4.5, fontSize: 15, color: 'FFFFFF', lineSpacing: 28 }
    );

    pptx.writeFile({ fileName: `Sera_Gazi_Envanteri_Sunum_${year}.pptx` });
  }

  function bindExportButtons(year) {
    const monthlyXlsx = document.getElementById('rp-monthly-xlsx');
    if (monthlyXlsx) monthlyXlsx.addEventListener('click', () => {
      Utils.exportTableToExcel(`Aylik_Rapor_${year}.xlsx`, 'Aylık Rapor',
        ['Ay','Üretim','Enerji','Scope1','Scope2','Scope3','Toplam CO2e','tCO2e/ton'], monthlyReportRows(year));
    });
    const monthlyPdf = document.getElementById('rp-monthly-pdf');
    if (monthlyPdf) monthlyPdf.addEventListener('click', () => {
      Utils.exportTableToPDF(`Aylık Rapor - ${year}`, ['Ay','Üretim','Enerji','Scope1','Scope2','Scope3','Toplam','tCO2e/ton'],
        monthlyReportRows(year).map(r => r.map((v,i)=> i===0?v:Utils.fmt(v, i===6?0:3))), `Aylik_Rapor_${year}.pdf`);
    });
    const productXlsx = document.getElementById('rp-product-xlsx');
    if (productXlsx) productXlsx.addEventListener('click', () => {
      const rows = productReportRows(year);
      Utils.exportTableToExcel(`Urun_Bazli_Rapor_${year}.xlsx`, 'Ürün Bazlı Rapor',
        ['Ürün','Üretim','Scope1','Scope2','Scope3','Toplam CO2e','tCO2e/ton'],
        rows.map(r => [r.name, r.production, r.s1, r.s2, r.s3, r.total, r.intensity]));
    });
    const prodConsumptionXlsx = document.getElementById('rp-prod-consumption-xlsx');
    if (prodConsumptionXlsx) prodConsumptionXlsx.addEventListener('click', () => {
      const monthly = monthlyReportRows(year);
      Utils.exportTableToExcel(`Aylik_Enerji_Tuketimi_${year}.xlsx`, 'Aylık Enerji Tüketimi',
        ['Ay', 'Enerji Tüketimi (kWh eşd.)'], monthly.map(r => [r[0], r[2]]));
    });
    const isoPdf = document.getElementById('rp-iso-pdf');
    if (isoPdf) isoPdf.addEventListener('click', () => {
      const text = document.getElementById('iso-report-body').innerText;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      Utils.registerPdfFont(doc);
      doc.setFontSize(13); doc.text(`ISO 14064-1 Envanter Raporu - ${year}`, 14, 15);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, 14, 25);
      doc.save(`ISO14064_Rapor_${year}.pdf`);
    });
    const cmpRun = document.getElementById('cmp-run');
    if (cmpRun) cmpRun.addEventListener('click', runComparison);
    const energyXlsx = document.getElementById('rp-energy-xlsx');
    if (energyXlsx) energyXlsx.addEventListener('click', () => {
      const rows = energyTypeBalanceRows(year);
      Utils.exportTableToExcel(`Enerji_Raporu_${year}.xlsx`, 'Enerji Raporu',
        ['Enerji Türü','Üretim','Satış','Satın Alma','Tüketim','Birim'],
        rows.map(r => [r.type, r.production, r.sales, r.purchase, r.consumption, r.unit]));
    });
    const energyTabBtn = document.getElementById('rp-energy-tab-btn');
    if (energyTabBtn) energyTabBtn.addEventListener('shown.bs.tab', () => { buildEnergyChart(year); buildEnergyTypeCharts(year); });
    const productTabBtn = document.getElementById('rp-product-tab-btn');
    if (productTabBtn) productTabBtn.addEventListener('shown.bs.tab', () => buildProductCharts(year));
    bindProdChemicalSelect(year);
  }

  window.Modules.reports = {
    render(container) {
      const year = Utils.currentYear();
      container.innerHTML = `
        <div class="section-card d-flex align-items-center flex-wrap gap-2">
          <div>
            <h5 class="mb-0"><i class="fa-solid fa-file-powerpoint"></i> PPTX Sunum</h5>
            <p class="text-muted small mb-0">${year} yılına ait tüm rapor verilerini (özet, Scope 1/2/3, aylık trend, ürün yoğunluğu, veri kalitesi) kullanarak hazır bir PowerPoint sunumu oluşturur.</p>
          </div>
          <button class="btn btn-danger ms-auto" id="rp-pptx"><i class="fa-solid fa-file-powerpoint"></i> Sunum Oluştur (.pptx)</button>
        </div>
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#rp-monthly">Aylık Rapor</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rp-annual">Yıllık Rapor</button></li>
          <li class="nav-item"><button class="nav-link" id="rp-product-tab-btn" data-bs-toggle="tab" data-bs-target="#rp-product">Ürün Bazlı Rapor</button></li>
          <li class="nav-item"><button class="nav-link" id="rp-energy-tab-btn" data-bs-toggle="tab" data-bs-target="#rp-energy">Enerji Raporu</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rp-cmp">Yıllar Arası Karşılaştırma</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rp-iso">ISO 14064 Raporu</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#rp-ghg">GHG Protocol Raporu</button></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="rp-monthly">${tabMonthly(year)}</div>
          <div class="tab-pane fade" id="rp-annual">${tabAnnual(year)}</div>
          <div class="tab-pane fade" id="rp-product">${tabProduct(year)}</div>
          <div class="tab-pane fade" id="rp-energy">${tabEnergy(year)}</div>
          <div class="tab-pane fade" id="rp-cmp">${tabComparison()}</div>
          <div class="tab-pane fade" id="rp-iso">${tabIso(year)}</div>
          <div class="tab-pane fade" id="rp-ghg">${tabGhg(year)}</div>
        </div>`;
      bindExportButtons(year);
      container.addEventListener('click', e => {
        const nav = e.target.closest('[data-tab-nav]');
        if (nav) document.getElementById(nav.dataset.tabNav).dispatchEvent(new Event('click', { bubbles: true }));
      });
      document.getElementById('rp-pptx').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Oluşturuluyor...';
        try {
          generatePptx(year);
          Utils.toast('Sunum indirildi.');
        } catch (err) {
          console.error(err);
          Utils.toast('Sunum oluşturulamadı: ' + err.message, 'danger');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-file-powerpoint"></i> Sunum Oluştur (.pptx)';
        }
      });
    }
  };
})();
