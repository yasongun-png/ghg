/*
 * controls.js — section 21 & 22: Kontrol ve Uyarılar (otomatik veri kontrolleri).
 */
(function () {
  window.Modules = window.Modules || {};

  function severityClass(sev) { return sev === 'high' ? 'severity-high' : (sev === 'low' ? 'severity-low' : ''); }
  function severityLabel(sev) { return sev === 'high' ? 'Yüksek' : (sev === 'low' ? 'Düşük' : 'Orta'); }

  function render(container) {
    const year = Utils.currentYear();
    const alerts = Validation.runChecks(year);
    const grouped = {};
    alerts.forEach(a => { grouped[a.category] = grouped[a.category] || []; grouped[a.category].push(a); });

    const counts = { high: 0, medium: 0, low: 0 };
    alerts.forEach(a => counts[a.severity] = (counts[a.severity] || 0) + 1);

    container.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card" style="border-left-color:#c92a2a"><div class="kpi-label">Yüksek Öncelikli</div><div class="kpi-value">${counts.high}</div><i class="fa-solid fa-circle-exclamation kpi-icon"></i></div>
        <div class="kpi-card" style="border-left-color:#f08c00"><div class="kpi-label">Orta Öncelikli</div><div class="kpi-value">${counts.medium}</div><i class="fa-solid fa-triangle-exclamation kpi-icon"></i></div>
        <div class="kpi-card" style="border-left-color:#868e96"><div class="kpi-label">Düşük Öncelikli</div><div class="kpi-value">${counts.low}</div><i class="fa-solid fa-circle-info kpi-icon"></i></div>
        <div class="kpi-card accent-total"><div class="kpi-label">Toplam Uyarı (${year})</div><div class="kpi-value">${alerts.length}</div><i class="fa-solid fa-bell kpi-icon"></i></div>
      </div>
      ${alerts.length === 0 ? '<div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> Bu yıl için herhangi bir kontrol uyarısı bulunmuyor.</div>' : ''}
      ${Object.keys(grouped).map(cat => `
        <div class="section-card">
          <h5><i class="fa-solid fa-magnifying-glass"></i> ${cat} <span class="badge text-bg-secondary ms-2">${grouped[cat].length}</span></h5>
          ${grouped[cat].map(a => `<div class="alert-item ${severityClass(a.severity)}">
            <span class="badge text-bg-light border me-2">${severityLabel(a.severity)}</span>${a.message}
          </div>`).join('')}
        </div>`).join('')}
      <div class="section-card">
        <h5><i class="fa-solid fa-calendar-check"></i> Aylık Veri Tamamlanma (${year})</h5>
        <div class="row">
          ${Validation.completionByMonth(year).map(m => `<div class="col-md-2 col-4 mb-2 text-center">
            <div class="text-xs">${m.label}</div>
            <div class="completion-bar my-1"><div style="width:${m.pct}%"></div></div>
            <div class="text-xs fw-bold">%${m.pct}</div>
          </div>`).join('')}
        </div>
      </div>`;
  }

  window.Modules.controls = { render };
})();
