/*
 * scope3.js — section 13: GHG Protocol Scope 3, 15 kategori.
 */
(function () {
  window.Modules = window.Modules || {};

  const CATEGORIES = [
    '1. Purchased Goods and Services', '2. Capital Goods', '3. Fuel- and Energy-Related Activities',
    '4. Upstream Transportation and Distribution', '5. Waste Generated in Operations', '6. Business Travel',
    '7. Employee Commuting', '8. Upstream Leased Assets', '9. Downstream Transportation and Distribution',
    '10. Processing of Sold Products', '11. Use of Sold Products', '12. End-of-Life Treatment of Sold Products',
    '13. Downstream Leased Assets', '14. Franchises', '15. Investments'
  ];

  function runScope3Calc(rec) {
    Calc.runAndStore({
      sourceKey: 'scope3Data', sourceId: rec.id, module: 'scope3', scope: 3,
      category: rec.categoryNo, year: rec.year, month: rec.month, facilityId: rec.facilityId,
      activityValue: rec.activityValue, activityUnit: rec.unit,
      factorId: rec.factorId, gwpSet: rec.gwpSet || 'AR5', method: 'Emisyon Faktörü Bazlı'
    });
  }

  const crud = CrudBuilder({
    key: 'scope3Data', title: 'Scope 3 Verileri (15 Kategori)', icon: 'fa-truck-fast', showCalcDetail: true,
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'categoryNo', label: 'Kategori' },
      { field: 'activityDescription', label: 'Aktivite' },
      { field: 'activityValue', label: 'Miktar', render: r => `${Utils.fmt(r.activityValue)} ${r.unit||''}` },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 4, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', colSize: 4, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', colSize: 4, options: () => Utils.facilityOptions() },
      { name: 'categoryNo', label: 'Scope 3 Kategorisi', type: 'select', required: true, colSize: 12,
        options: CATEGORIES.map(c => ({ value: c, label: c })) },
      { name: 'activityDescription', label: 'Aktivite Açıklaması', colSize: 12 },
      { name: 'activityValue', label: 'Aktivite Verisi (Miktar)', type: 'number', required: true, colSize: 4 },
      { name: 'unit', label: 'Birim', colSize: 4 },
      { name: 'factorId', label: 'Emisyon Faktörü', type: 'select', colSize: 4, options: () => Utils.factorOptions(null, 3) },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', colSize: 4, options: () => Utils.gwpSetOptions() },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'D' },
      { name: 'document', label: 'Belge', colSize: 4 },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterSave: (rec) => runScope3Calc(rec),
    afterDelete: (id) => Calc.removeForSource('scope3Data', id)
  });

  window.Modules.scope3 = {
    render(container) {
      const year = Utils.currentYear();
      const byCategory = Calc.breakdownByCategory({ year, module: 'scope3' });
      const total = Calc.sumCO2eTon({ year, scope: 3 });
      container.innerHTML = `
        <div class="kpi-row">
          <div class="kpi-card accent-3"><div class="kpi-label">Toplam Scope 3 (${year})</div><div class="kpi-value">${Utils.fmt(total,2)} <span class="kpi-unit">tCO2e</span></div><i class="fa-solid fa-truck-fast kpi-icon"></i></div>
        </div>
        <div class="section-card">
          <h5><i class="fa-solid fa-chart-pie"></i> Kategori Bazlı Dağılım (${year})</h5>
          <div class="table-responsive"><table class="table table-sm table-hover">
            <thead><tr><th>Kategori</th><th>CO2e (ton)</th></tr></thead>
            <tbody>${byCategory.map(c => `<tr><td>${c.category}</td><td>${Utils.fmt(c.totalCO2eTon,3)}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">Veri yok</td></tr>'}</tbody>
          </table></div>
        </div>
        ${crud.html()}`;
      crud.mount();
    },
    CATEGORIES,
    runCalc: runScope3Calc,
    refresh: () => crud.refresh()
  };
})();
