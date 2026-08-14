/*
 * scope2.js — section 12: Scope 2, Location-Based vs Market-Based.
 * Data entry happens on Enerji Verileri → Enerji Satın Alma Bilgileri
 * (purchased electricity/steam/heat/cooling ONLY — not total consumption,
 * since a self-generating site's own output was never purchased from
 * anyone); this screen shows the two calculation methods side by side.
 */
(function () {
  window.Modules = window.Modules || {};

  function renderTable(rows, title) {
    if (!rows.length) return `<p class="text-muted">${title}: kayıt yok.</p>`;
    const total = rows.reduce((s, r) => s + r.totalCO2eTon, 0);
    return `<div class="table-responsive"><table class="table table-sm table-hover">
      <thead><tr><th>Kaynak</th><th>Faaliyet Verisi (Toplam)</th><th>CO2e (kg)</th><th>CO2e (ton)</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.category}</td><td>${Utils.fmt(r.activityTotal)} ${r.activityUnit||''}</td><td>${Utils.fmt(r.totalCO2eKg)}</td><td>${Utils.fmt(r.totalCO2eTon,3)}</td></tr>`).join('')}
      <tr class="table-light fw-bold"><td colspan="2">TOPLAM</td><td>${Utils.fmt(total*1000)}</td><td>${Utils.fmt(total,3)}</td></tr></tbody></table></div>`;
  }

  window.Modules.scope2 = {
    render(container) {
      const year = Utils.currentYear();
      const location = Calc.breakdownByCategory({ year, module: 'scope2-location' });
      const market = Calc.breakdownByCategory({ year, module: 'scope2-market' });
      const locTotal = Calc.sumCO2eTon({ year, module: 'scope2-location' });
      const mktTotal = Calc.sumCO2eTon({ year, module: 'scope2-market' });

      container.innerHTML = `
        <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
          Scope 2 veri girişi <a href="#energy">Enerji Verileri → Enerji Satın Alma Bilgileri</a> sekmesinden yapılır
          — sadece dışarıdan <strong>satın alınan</strong> elektrik/buhar/ısı/soğutma miktarı buraya yansır (kendi
          ürettiğiniz enerji dahil edilmez). Aşağıda GHG Protocol Scope 2 Guidance uyarınca iki yöntemin sonucu
          ayrı ayrı gösterilir.</div>
        <div class="kpi-row">
          <div class="kpi-card accent-2"><div class="kpi-label">Location-Based Toplam</div><div class="kpi-value">${Utils.fmt(locTotal,2)} <span class="kpi-unit">tCO2e</span></div><i class="fa-solid fa-earth-europe kpi-icon"></i></div>
          <div class="kpi-card accent-2"><div class="kpi-label">Market-Based Toplam</div><div class="kpi-value">${Utils.fmt(mktTotal,2)} <span class="kpi-unit">tCO2e</span></div><i class="fa-solid fa-file-contract kpi-icon"></i></div>
        </div>
        <div class="row">
          <div class="col-md-6">
            <div class="section-card"><h5><i class="fa-solid fa-earth-europe"></i> Location-Based</h5>${renderTable(location, 'Location-Based')}</div>
          </div>
          <div class="col-md-6">
            <div class="section-card"><h5><i class="fa-solid fa-file-contract"></i> Market-Based</h5>${renderTable(market, 'Market-Based')}</div>
          </div>
        </div>`;
    }
  };
})();
