/*
 * dataQuality.js — section 19 & 22: Veri Kalitesi dağılımı ve onay workflow'u
 * (Taslak -> Kontrol Bekliyor -> Kontrol Edildi -> Onaylandı -> Kilitlendi).
 */
(function () {
  window.Modules = window.Modules || {};

  const COLLECTIONS = [
    { key: 'productionData', label: 'Üretim Verisi' }, { key: 'energyData', label: 'Enerji Verisi' },
    { key: 'scope1Data', label: 'Scope 1 - Mobil Yakma' }, { key: 'scope3Data', label: 'Scope 3' },
    { key: 'processEmissionData', label: 'Proses Emisyonu' }, { key: 'fugitiveEmissionData', label: 'Kaçak Emisyon' }
  ];

  const STATUS_ORDER = ['draft', 'review', 'checked', 'approved', 'locked'];

  function allRecords() {
    const year = Utils.currentYear();
    const out = [];
    COLLECTIONS.forEach(c => {
      Store.getAll(c.key).filter(r => !r.year || Number(r.year) === year).forEach(r => {
        out.push(Object.assign({ _collection: c.key, _label: c.label }, r));
      });
    });
    return out;
  }

  function dqDistributionHtml(records) {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    records.forEach(r => { counts[r.dataQuality] = (counts[r.dataQuality] || 0) + 1; });
    const total = records.length || 1;
    return `<div class="section-card"><h5><i class="fa-solid fa-star-half-stroke"></i> Veri Kalitesi Dağılımı (${Utils.currentYear()})</h5>
      <div class="row text-center">
        ${Object.keys(counts).map(k => `<div class="col">
          <div class="dq-badge dq-${k}" style="font-size:1rem;padding:.3rem .6rem;">${k}</div>
          <div class="fw-bold mt-1">${counts[k]}</div>
          <div class="text-muted text-xs">%${Math.round(counts[k]/total*100)}</div>
        </div>`).join('')}
      </div>
      <div class="text-muted text-xs mt-2">${Object.entries(Store.DATA_QUALITY_LABELS).map(([k,l]) => `<div>${l}</div>`).join('')}</div>
      </div>`;
  }

  function statusDistributionHtml(records) {
    const counts = {};
    STATUS_ORDER.forEach(s => counts[s] = 0);
    records.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return `<div class="section-card"><h5><i class="fa-solid fa-list-check"></i> Onay Durumu Dağılımı</h5>
      <div class="row text-center">
        ${STATUS_ORDER.map(s => `<div class="col">${Utils.statusBadge(s)}<div class="fw-bold mt-1">${counts[s]}</div></div>`).join('')}
      </div></div>`;
  }

  function tableHtml(records) {
    return `<div class="section-card">
      <h5><i class="fa-solid fa-table-list"></i> Kayıt Bazlı Onay Yönetimi</h5>
      <div class="table-responsive"><table id="dq-table" class="table table-sm table-hover w-100">
        <thead><tr><th>Modül</th><th>Dönem</th><th>Tesis</th><th>Veri Kalitesi</th><th>Durum</th><th>Giren</th><th>Giriş Tarihi</th><th class="nowrap">İşlem</th></tr></thead>
        <tbody>${records.map(r => `<tr data-collection="${r._collection}" data-id="${r.id}">
          <td>${r._label}</td><td>${r.month ? Validation.MONTHS[r.month-1] : ''} ${r.year||''}</td>
          <td>${Utils.facilityName(r.facilityId)}</td><td>${Utils.dqBadge(r.dataQuality)}</td>
          <td>${Utils.statusBadge(r.status)}</td><td>${r.entryUser||'-'}</td>
          <td>${r.entryDate ? new Date(r.entryDate).toLocaleDateString('tr-TR') : '-'}</td>
          <td class="table-actions nowrap">
            ${r.status !== 'locked' ? `<button class="btn btn-sm btn-outline-success btn-advance" title="Sonraki Duruma İlerlet"><i class="fa-solid fa-forward"></i></button>` : `<span class="text-muted text-xs">Kilitli</span>`}
          </td></tr>`).join('')}</tbody>
      </table></div></div>`;
  }

  function render(container) {
    const records = allRecords();
    container.innerHTML = `
      <div class="row">
        <div class="col-md-6">${dqDistributionHtml(records)}</div>
        <div class="col-md-6">${statusDistributionHtml(records)}</div>
      </div>
      ${tableHtml(records)}`;
    Utils.initDataTable('#dq-table', { columnDefs: [{ orderable: false, targets: -1 }] });

    container.querySelector('#dq-table').addEventListener('click', e => {
      const btn = e.target.closest('.btn-advance');
      if (!btn) return;
      const tr = btn.closest('tr');
      const collection = tr.dataset.collection, id = tr.dataset.id;
      const rec = Store.getById(collection, id);
      const idx = STATUS_ORDER.indexOf(rec.status || 'draft');
      const next = STATUS_ORDER[Math.min(idx + 1, STATUS_ORDER.length - 1)];
      try {
        Store.setStatus(collection, id, next, { revisionReason: `Durum güncellendi: ${next}` });
        Utils.toast(`Kayıt durumu "${Store.STATUS_LABELS[next]}" olarak güncellendi.`);
        render(container);
      } catch (err) { Utils.toast(err.message, 'danger'); }
    });
  }

  window.Modules.dataquality = { render };
})();
