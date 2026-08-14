/*
 * calculationsView.js — section 13/39/40: Hesaplamalar (tüm hesaplama sonuçları
 * için tek, aranabilir denetim izi tablosu — "Toplam Scope1 -> Sabit Yakma ->
 * Doğalgaz -> Ocak 2026 -> ... -> Sonuç" izlenebilirliği).
 */
(function () {
  window.Modules = window.Modules || {};

  const MODULE_LABELS = {
    'scope1-stationary': 'Scope 1 - Sabit Yakma', 'scope1-mobile': 'Scope 1 - Mobil Yakma',
    'scope2-location': 'Scope 2 - Location Based', 'scope2-market': 'Scope 2 - Market Based',
    'scope3': 'Scope 3', 'process': 'Proses Emisyonu', 'fugitive': 'Kaçak Emisyon'
  };

  function renderTable() {
    const year = Utils.currentYear();
    const scope = document.getElementById('cv-scope-filter').value;
    const mod = document.getElementById('cv-module-filter').value;
    let rows = Calc.resultsFor({ year });
    if (scope) rows = rows.filter(r => String(r.scope) === scope);
    if (mod) rows = rows.filter(r => r.module === mod);

    document.querySelector('#cv-table tbody').innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td>Scope ${r.scope}</td><td>${MODULE_LABELS[r.module] || r.module}</td><td>${r.category || '-'}</td>
        <td>${r.month ? Validation.MONTHS[r.month-1] : ''} ${r.year}</td>
        <td>${Utils.facilityName(r.facilityId)}</td>
        <td>${Utils.fmt(r.activityValue)} ${r.activityUnit || ''}</td>
        <td>${r.factorSnapshot ? (r.factorSnapshot.source + ' v' + (r.factorSnapshot.version||'-')) : (r.method||'-')}</td>
        <td>${r.gwpSet || '-'}</td>
        <td><strong>${Utils.fmt(r.totalCO2eTon,4)}</strong></td>
        <td><button class="btn btn-sm btn-outline-info btn-cv-detail"><i class="fa-solid fa-magnifying-glass-chart"></i></button></td>
      </tr>`).join('');
    Utils.initDataTable('#cv-table', { columnDefs: [{ orderable: false, targets: -1 }], order: [] });

    const totalEl = document.getElementById('cv-total');
    if (totalEl) totalEl.textContent = Utils.fmt(rows.reduce((s,r)=>s+r.totalCO2eTon,0), 3) + ' tCO2e';
  }

  window.Modules.calculations = {
    render(container) {
      const year = Utils.currentYear();
      container.innerHTML = `
        <div class="section-card">
          <h5><i class="fa-solid fa-calculator"></i> Hesaplama Motoru — Tüm Sonuçlar (${year})
            <span class="ms-auto fw-bold" id="cv-total"></span></h5>
          <div class="row mb-2">
            <div class="col-md-3">
              <select id="cv-scope-filter" class="form-select form-select-sm">
                <option value="">Tüm Scope'lar</option><option value="1">Scope 1</option><option value="2">Scope 2</option><option value="3">Scope 3</option>
              </select>
            </div>
            <div class="col-md-4">
              <select id="cv-module-filter" class="form-select form-select-sm">
                <option value="">Tüm Modüller</option>
                ${Object.entries(MODULE_LABELS).map(([k,l]) => `<option value="${k}">${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="table-responsive">
            <table id="cv-table" class="table table-sm table-hover w-100">
              <thead><tr><th>Scope</th><th>Modül</th><th>Kategori</th><th>Dönem</th><th>Tesis</th><th>Aktivite Verisi</th><th>Faktör/Yöntem</th><th>GWP</th><th>CO2e (ton)</th><th>Detay</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>`;
      renderTable();
      document.getElementById('cv-scope-filter').addEventListener('change', renderTable);
      document.getElementById('cv-module-filter').addEventListener('change', renderTable);
      document.getElementById('cv-table').addEventListener('click', e => {
        const btn = e.target.closest('.btn-cv-detail');
        if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const rec = Store.getById('calculationResults', id);
        if (rec) Utils.openDetailModal('Hesaplama Denetim İzi', `<pre class="calc-trace">${rec.trace}</pre>`);
      });
    }
  };
})();
