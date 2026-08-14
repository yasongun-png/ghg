/*
 * dashboard.js — section 4: Dashboard (KPI kartları, 7 grafik, filtreler,
 * veri tamamlanma göstergesi).
 */
(function () {
  window.Modules = window.Modules || {};
  const charts = {};

  function destroyCharts() { Object.values(charts).forEach(c => c && c.destroy()); }

  function currentFilters() {
    return {
      year: Utils.currentYear(),
      facilityId: document.getElementById('db-facility') ? document.getElementById('db-facility').value : '',
      departmentId: document.getElementById('db-department') ? document.getElementById('db-department').value : '',
      processId: document.getElementById('db-process') ? document.getElementById('db-process').value : '',
      productId: document.getElementById('db-product') ? document.getElementById('db-product').value : ''
    };
  }

  function calcFilter(f, extra) { return Object.assign({ year: f.year, facilityId: f.facilityId || undefined, departmentId: f.departmentId || undefined, processId: f.processId || undefined, productId: f.productId || undefined }, extra); }

  function productionFor(f) {
    return Store.getAll('productionData').filter(p => Number(p.year) === f.year
      && (!f.facilityId || String(p.facilityId) === f.facilityId)
      && (!f.departmentId || String(p.departmentId) === f.departmentId)
      && (!f.processId || String(p.processId) === f.processId)
      && (!f.productId || String(p.productId) === f.productId));
  }

  function energyFor(f) {
    return Store.getAll('energyData').filter(e => Number(e.year) === f.year
      && (!f.facilityId || String(e.facilityId) === f.facilityId)
      && (!f.departmentId || String(e.departmentId) === f.departmentId));
  }

  function energyRecordsFor(key, f) {
    return Store.getAll(key).filter(e => Number(e.year) === f.year
      && (!f.facilityId || String(e.facilityId) === f.facilityId)
      && (!f.departmentId || String(e.departmentId) === f.departmentId));
  }

  function kpiCards(f) {
    const totalCO2e = Calc.sumCO2eTon(calcFilter(f));
    const scope1 = Calc.sumCO2eTon(calcFilter(f, { scope: 1 }));
    const scope2 = Calc.sumCO2eTon(calcFilter(f, { scope: 2, module: 'scope2-location' }));
    const scope3 = Calc.sumCO2eTon(calcFilter(f, { scope: 3 }));
    const production = productionFor(f);
    const totalProduction = production.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const energy = energyFor(f);
    const totalEnergyKwh = energy.reduce((s, e) => s + (Number(e.consumptionKwhEquivalent) || 0), 0);
    const elec = energy.filter(e => e.energyType === 'Elektrik').reduce((s, e) => s + (Number(e.consumption) || 0), 0);
    const gas = energy.filter(e => e.energyType === 'Doğalgaz').reduce((s, e) => s + (Number(e.consumption) || 0), 0);
    const fuel = energy.filter(e => ['Motorin','Benzin','LPG','Fuel-oil','Kömür'].includes(e.energyType)).reduce((s, e) => s + (Number(e.consumption) || 0), 0);
    const intensity = totalProduction ? totalCO2e / totalProduction : 0;
    const elecProduced = energyRecordsFor('energyProductionData', f).filter(e => e.energyType === 'Elektrik').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const elecPurchased = energyRecordsFor('energyPurchaseData', f).filter(e => e.energyType === 'Elektrik').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const elecSold = energyRecordsFor('energySalesData', f).filter(e => e.energyType === 'Elektrik').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const selfSufficiency = (elecProduced + elecPurchased) ? (elecProduced / (elecProduced + elecPurchased)) * 100 : 0;
    const totalWaterSupply = energyRecordsFor('waterSupplyData', f).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalWaterConsumption = energyRecordsFor('waterConsumptionData', f).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const card = (label, value, unit, icon, accent) => `<div class="kpi-card ${accent}"><div class="kpi-label">${label}</div><div class="kpi-value">${value} <span class="kpi-unit">${unit}</span></div><i class="fa-solid ${icon} kpi-icon"></i></div>`;
    return `<div class="kpi-row">
      ${card('Toplam CO2e', Utils.fmt(totalCO2e,2), 'tCO2e', 'fa-earth-americas', 'accent-total')}
      ${card('Scope 1', Utils.fmt(scope1,2), 'tCO2e', 'fa-fire', 'accent-1')}
      ${card('Scope 2', Utils.fmt(scope2,2), 'tCO2e', 'fa-plug', 'accent-2')}
      ${card('Scope 3', Utils.fmt(scope3,2), 'tCO2e', 'fa-truck-fast', 'accent-3')}
      ${card('Toplam Enerji', Utils.fmt(totalEnergyKwh,0), 'kWh eşd.', 'fa-bolt', 'accent-2')}
      ${card('Toplam Üretim', Utils.fmt(totalProduction,0), 'ton', 'fa-industry', 'accent-total')}
      ${card('Karbon Yoğunluğu', Utils.fmt(intensity,4), 'tCO2e/ton', 'fa-leaf', 'accent-total')}
      ${card('Elektrik Tüketimi', Utils.fmt(elec,0), 'kWh', 'fa-bolt', 'accent-2')}
      ${card('Doğalgaz Tüketimi', Utils.fmt(gas,0), 'Sm³', 'fa-fire-flame-simple', 'accent-1')}
      ${card('Yakıt Tüketimi (Diğer)', Utils.fmt(fuel,0), 'lt/kg', 'fa-gas-pump', 'accent-1')}
      ${card('Elektrik Üretimi (Öz Kaynak)', Utils.fmt(elecProduced,0), 'kWh', 'fa-solar-panel', 'accent-2')}
      ${card('Elektrik Satın Alma', Utils.fmt(elecPurchased,0), 'kWh', 'fa-file-signature', 'accent-2')}
      ${card('Elektrik Satışı', Utils.fmt(elecSold,0), 'kWh', 'fa-right-left', 'accent-2')}
      ${card('Enerji Öz Yeterlilik', Utils.fmt(selfSufficiency,1), '%', 'fa-leaf', 'accent-total')}
      ${card('Toplam Su Temini', Utils.fmt(totalWaterSupply,0), 'm³', 'fa-droplet', 'accent-2')}
      ${card('Toplam Su Tüketimi', Utils.fmt(totalWaterConsumption,0), 'm³', 'fa-water', 'accent-1')}
    </div>`;
  }

  function completionWidget(year) {
    const overall = Validation.overallCompletion(year);
    const months = Validation.completionByMonth(year);
    return `<div class="section-card">
      <h5><i class="fa-solid fa-calendar-check"></i> ${year} Veri Tamamlanma: <span class="text-success">%${overall}</span></h5>
      <div class="row">
        ${months.map(m => `<div class="col text-center mb-2" style="cursor:pointer" data-nav="production" title="Eksik veriyi görüntülemek için tıklayın">
          <div class="text-xs">${m.label}</div>
          <div class="completion-bar my-1"><div style="width:${m.pct}%"></div></div>
          <div class="text-xs fw-bold">%${m.pct}</div>
        </div>`).join('')}
      </div>
      <div class="text-end"><a href="#controls" class="small">Tüm uyarıları görüntüle <i class="fa-solid fa-arrow-right"></i></a></div>
    </div>`;
  }

  function buildCharts(f) {
    destroyCharts();
    const months = Validation.MONTHS;

    // 1. Aylık toplam CO2e
    const monthlyCO2e = months.map((_, i) => Calc.sumCO2eTon(calcFilter(f, { month: i + 1 })));
    charts.c1 = new Chart(document.getElementById('chart1'), {
      type: 'bar', data: { labels: months, datasets: [{ label: 'Toplam CO2e (ton)', data: monthlyCO2e, backgroundColor: '#2e8b57' }] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Scope karşılaştırması
    const s1 = Calc.sumCO2eTon(calcFilter(f, { scope: 1 }));
    const s2 = Calc.sumCO2eTon(calcFilter(f, { scope: 2, module: 'scope2-location' }));
    const s3 = Calc.sumCO2eTon(calcFilter(f, { scope: 3 }));
    charts.c2 = new Chart(document.getElementById('chart2'), {
      type: 'doughnut', data: { labels: ['Scope 1', 'Scope 2', 'Scope 3'], datasets: [{ data: [s1, s2, s3], backgroundColor: ['#d9480f', '#1971c2', '#9c36b5'] }] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 3. Aylık enerji tüketimi (kWh eşdeğeri)
    const energyAll = energyFor(f);
    const monthlyEnergy = months.map((_, i) => energyAll.filter(e => e.month === i + 1).reduce((s, e) => s + (Number(e.consumptionKwhEquivalent) || 0), 0));
    charts.c3 = new Chart(document.getElementById('chart3'), {
      type: 'bar', data: { labels: months, datasets: [{ label: 'Enerji (kWh eşd.)', data: monthlyEnergy, backgroundColor: '#1971c2' }] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 4. Üretim miktarı
    const productionAll = productionFor(f);
    const monthlyProd = months.map((_, i) => productionAll.filter(p => p.month === i + 1).reduce((s, p) => s + (Number(p.quantity) || 0), 0));
    charts.c4 = new Chart(document.getElementById('chart4'), {
      type: 'bar', data: { labels: months, datasets: [{ label: 'Üretim (ton)', data: monthlyProd, backgroundColor: '#f08c00' }] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 5. Üretim başına emisyon
    const monthlyIntensity = months.map((_, i) => monthlyProd[i] ? monthlyCO2e[i] / monthlyProd[i] : 0);
    charts.c5 = new Chart(document.getElementById('chart5'), {
      type: 'line', data: { labels: months, datasets: [{ label: 'tCO2e / ton ürün', data: monthlyIntensity, borderColor: '#c92a2a', backgroundColor: 'rgba(201,42,42,.15)', fill: true, tension: .3 }] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 6. Emisyon kaynaklarının dağılımı
    const byCategory = Calc.breakdownByCategory(calcFilter(f)).slice(0, 8);
    charts.c6 = new Chart(document.getElementById('chart6'), {
      type: 'pie', data: { labels: byCategory.map(c => c.category), datasets: [{ data: byCategory.map(c => c.totalCO2eTon), backgroundColor: ['#2e8b57','#d9480f','#1971c2','#9c36b5','#f08c00','#087f5b','#e64980','#495057'] } ] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 7. Ürün bazında karbon yoğunluğu
    const byProduct = {};
    productionAll.forEach(p => { byProduct[p.productId] = (byProduct[p.productId] || 0) + (Number(p.quantity) || 0); });
    const productLabels = Object.keys(byProduct).map(pid => Utils.productName(pid));
    const productIntensity = Object.keys(byProduct).map(pid => {
      const co2e = Calc.sumCO2eTon(calcFilter(f, { productId: pid }));
      return byProduct[pid] ? co2e / byProduct[pid] : 0;
    });
    charts.c7 = new Chart(document.getElementById('chart7'), {
      type: 'bar', data: { labels: productLabels, datasets: [{ label: 'tCO2e / ton ürün', data: productIntensity, backgroundColor: '#087f5b' }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });

    // 8. Aylık Elektrik Dengesi (Üretim / Satın Alma / Satış)
    const elecProdM = energyRecordsFor('energyProductionData', f).filter(e => e.energyType === 'Elektrik');
    const elecPurM = energyRecordsFor('energyPurchaseData', f).filter(e => e.energyType === 'Elektrik');
    const elecSaleM = energyRecordsFor('energySalesData', f).filter(e => e.energyType === 'Elektrik');
    const monthlyElecProd = months.map((_, i) => elecProdM.filter(e => e.month === i + 1).reduce((s, e) => s + (Number(e.amount) || 0), 0));
    const monthlyElecPur = months.map((_, i) => elecPurM.filter(e => e.month === i + 1).reduce((s, e) => s + (Number(e.amount) || 0), 0));
    const monthlyElecSale = months.map((_, i) => elecSaleM.filter(e => e.month === i + 1).reduce((s, e) => s + (Number(e.amount) || 0), 0));
    charts.c8 = new Chart(document.getElementById('chart8'), {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Üretim (kWh)', data: monthlyElecProd, backgroundColor: '#2e8b57' },
        { label: 'Satın Alma (kWh)', data: monthlyElecPur, backgroundColor: '#1971c2' },
        { label: 'Satış (kWh)', data: monthlyElecSale, backgroundColor: '#f08c00' }
      ] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // 9. Aylık Su Dengesi (Temin / Tüketim) — "nerelerden sağlandığı /
    // nerelerde kullanıldığı ay ay izlensin" isteğinin ana ekran özeti;
    // kaynak/sarf-yeri bazlı kırılım Su Verileri > Aylık Özet'te.
    const waterSupplyAll = energyRecordsFor('waterSupplyData', f);
    const waterConsumptionAll = energyRecordsFor('waterConsumptionData', f);
    const monthlyWaterSupply = months.map((_, i) => waterSupplyAll.filter(r => r.month === i + 1).reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const monthlyWaterConsumption = months.map((_, i) => waterConsumptionAll.filter(r => r.month === i + 1).reduce((s, r) => s + (Number(r.amount) || 0), 0));
    charts.c9 = new Chart(document.getElementById('chart9'), {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Su Temini (m³)', data: monthlyWaterSupply, backgroundColor: '#1971c2' },
        { label: 'Su Tüketimi (m³)', data: monthlyWaterConsumption, backgroundColor: '#0c8599' }
      ] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function refresh(container) {
    const f = currentFilters();
    document.getElementById('db-kpis').innerHTML = kpiCards(f);
    document.getElementById('db-completion').innerHTML = completionWidget(f.year);
    buildCharts(f);
  }

  window.Modules.dashboard = {
    render(container) {
      container.innerHTML = `
        <div class="section-card">
          <div class="row g-2 align-items-end">
            <div class="col-md-3"><label class="text-xs form-label mb-1">Tesis</label><select id="db-facility" class="form-select form-select-sm"><option value="">Tümü</option>${Utils.facilityOptions()}</select></div>
            <div class="col-md-3"><label class="text-xs form-label mb-1">Bölüm</label><select id="db-department" class="form-select form-select-sm"><option value="">Tümü</option>${Utils.departmentOptions()}</select></div>
            <div class="col-md-3"><label class="text-xs form-label mb-1">Proses</label><select id="db-process" class="form-select form-select-sm"><option value="">Tümü</option>${Utils.processOptions()}</select></div>
            <div class="col-md-3"><label class="text-xs form-label mb-1">Ürün</label><select id="db-product" class="form-select form-select-sm"><option value="">Tümü</option>${Utils.productOptions()}</select></div>
          </div>
        </div>
        <div id="db-kpis"></div>
        <div id="db-completion"></div>
        <div class="row">
          <div class="col-lg-6"><div class="chart-card"><h6>Aylık Toplam CO2e</h6><div class="chart-wrap"><canvas id="chart1"></canvas></div></div></div>
          <div class="col-lg-6"><div class="chart-card"><h6>Scope 1 / 2 / 3 Karşılaştırması</h6><div class="chart-wrap"><canvas id="chart2"></canvas></div></div></div>
          <div class="col-lg-6"><div class="chart-card"><h6>Aylık Enerji Tüketimi</h6><div class="chart-wrap"><canvas id="chart3"></canvas></div></div></div>
          <div class="col-lg-6"><div class="chart-card"><h6>Üretim Miktarı</h6><div class="chart-wrap"><canvas id="chart4"></canvas></div></div></div>
          <div class="col-lg-6"><div class="chart-card"><h6>Üretim Başına Emisyon</h6><div class="chart-wrap"><canvas id="chart5"></canvas></div></div></div>
          <div class="col-lg-6"><div class="chart-card"><h6>Emisyon Kaynaklarının Dağılımı</h6><div class="chart-wrap"><canvas id="chart6"></canvas></div></div></div>
          <div class="col-lg-12"><div class="chart-card"><h6>Ürün Bazında Karbon Yoğunluğu</h6><div class="chart-wrap"><canvas id="chart7"></canvas></div></div></div>
          <div class="col-lg-12"><div class="chart-card"><h6>Aylık Elektrik Dengesi (Üretim / Satın Alma / Satış)</h6><div class="chart-wrap"><canvas id="chart8"></canvas></div></div></div>
          <div class="col-lg-12"><div class="chart-card"><h6>Aylık Su Dengesi (Temin / Tüketim)</h6><div class="chart-wrap"><canvas id="chart9"></canvas></div></div></div>
        </div>`;

      ['db-facility', 'db-department', 'db-process', 'db-product'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => refresh(container));
      });
      container.addEventListener('click', e => {
        const nav = e.target.closest('[data-nav]');
        if (nav) location.hash = '#' + nav.dataset.nav;
      });
      refresh(container);
    },
    refresh
  };
})();
