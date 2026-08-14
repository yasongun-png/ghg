/*
 * water.js — Su Verileri: su temin kaynakları (kuyu, belediye, ... —
 * eklenebilir), sarf yerlerine göre su tüketimi (eklenebilir), ay/yıl
 * bazında izlenir. Enerji modülündeki üretim/satış/satın-alma mantığının
 * su karşılığı — herhangi bir emisyon hesabını tetiklemez, tamamen
 * bilgi/izleme amaçlıdır (ISO 14064-1 kapsamı dışında, ancak su ayak izi
 * takibi için istenen bir gösterge).
 */
(function () {
  window.Modules = window.Modules || {};

  const sourceCrud = CrudBuilder({
    key: 'waterSourceData', title: 'Su Kaynağı Tanımları', icon: 'fa-faucet-drip',
    columns: [
      { field: 'name', label: 'Kaynak Adı' }, { field: 'type', label: 'Kaynak Türü' },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'name', label: 'Kaynak Adı (ör. Kuyu-1, Belediye Şebekesi)', required: true, colSize: 6 },
      { name: 'type', label: 'Kaynak Türü', type: 'select', required: true, colSize: 6, options: [
        { value: 'Kuyu', label: 'Kuyu' }, { value: 'Belediye', label: 'Belediye Şebekesi' },
        { value: 'Yüzey Suyu', label: 'Yüzey Suyu (Nehir/Göl)' }, { value: 'Yağmur Suyu', label: 'Yağmur Suyu Hasadı' },
        { value: 'Geri Kazanım', label: 'Geri Kazanım / Arıtılmış Su' }, { value: 'Diğer', label: 'Diğer' }] },
      { name: 'facilityId', label: 'Tesis', type: 'select', colSize: 6, options: () => Utils.facilityOptions() },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 6, default: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  const consumptionPointCrud = CrudBuilder({
    key: 'waterConsumptionPointData', title: 'Sarf Yeri Tanımları', icon: 'fa-industry',
    columns: [
      { field: 'name', label: 'Sarf Yeri' }, { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'name', label: 'Sarf Yeri (ör. Proses, Soğutma, Sosyal Tesis, Bahçe Sulama)', required: true, colSize: 8 },
      { name: 'facilityId', label: 'Tesis', type: 'select', colSize: 4, options: () => Utils.facilityOptions() },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 6, default: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  function sourceOptions(selected) {
    return Store.getAll('waterSourceData').filter(s => s.active !== false).map(s =>
      `<option value="${s.id}" ${String(s.id) === String(selected) ? 'selected' : ''}>${s.name} (${s.type})</option>`).join('');
  }
  function sourceName(id) { const s = Store.getById('waterSourceData', id); return s ? s.name : '-'; }
  function consumptionPointOptions(selected) {
    return Store.getAll('waterConsumptionPointData').filter(p => p.active !== false).map(p =>
      `<option value="${p.id}" ${String(p.id) === String(selected) ? 'selected' : ''}>${p.name}</option>`).join('');
  }
  function consumptionPointName(id) { const p = Store.getById('waterConsumptionPointData', id); return p ? p.name : '-'; }

  const supplyCrud = CrudBuilder({
    key: 'waterSupplyData', title: 'Su Temin Verileri', icon: 'fa-droplet', showCalcDetail: false,
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'sourceId', label: 'Kaynak', render: r => sourceName(r.sourceId) },
      { field: 'amount', label: 'Temin Miktarı', render: r => `${Utils.fmt(r.amount)} ${r.unit||'m³'}` },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'sourceId', label: 'Kaynak', type: 'select', required: true, colSize: 3, options: () => sourceOptions() },
      { name: 'amount', label: 'Temin Miktarı', type: 'number', required: true, colSize: 4 },
      { name: 'unit', label: 'Birim', colSize: 4, default: 'm³' },
      { name: 'meterNo', label: 'Sayaç No', colSize: 4 },
      { name: 'dataSource', label: 'Veri Kaynağı', type: 'select', colSize: 4, options: [
        {value:'Fatura', label:'Fatura'}, {value:'Sayaç', label:'Sayaç'}, {value:'Tahmini', label:'Tahmini'}] },
      { name: 'document', label: 'Belge Referansı', colSize: 4 },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  const consumptionCrud = CrudBuilder({
    key: 'waterConsumptionData', title: 'Su Tüketim Verileri', icon: 'fa-water', showCalcDetail: false,
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'consumptionPointId', label: 'Sarf Yeri', render: r => consumptionPointName(r.consumptionPointId) },
      { field: 'amount', label: 'Tüketim Miktarı', render: r => `${Utils.fmt(r.amount)} ${r.unit||'m³'}` },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'consumptionPointId', label: 'Sarf Yeri', type: 'select', required: true, colSize: 3, options: () => consumptionPointOptions() },
      { name: 'amount', label: 'Tüketim Miktarı', type: 'number', required: true, colSize: 4 },
      { name: 'unit', label: 'Birim', colSize: 4, default: 'm³' },
      { name: 'meterNo', label: 'Sayaç No', colSize: 4 },
      { name: 'dataSource', label: 'Veri Kaynağı', type: 'select', colSize: 4, options: [
        {value:'Sayaç', label:'Sayaç'}, {value:'Tahmini', label:'Tahmini'}] },
      { name: 'document', label: 'Belge Referansı', colSize: 4 },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 4, options: () => Utils.dataQualityOptions(), default: 'B' },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  // Ay × Kaynak/Sarf-Yeri kırılımlı özet — "su temininin nerelerden
  // sağlandığı ve nerelerde kullanıldığı ay ay izlensin" isteğinin
  // doğrudan karşılığı.
  function pivotRows(records, groupField, groupNameFn, year) {
    const filtered = records.filter(r => Number(r.year) === year);
    const groupIds = Array.from(new Set(filtered.map(r => r[groupField]))).filter(Boolean);
    return groupIds.map(gid => {
      const monthly = new Array(12).fill(0);
      filtered.filter(r => r[groupField] === gid).forEach(r => { monthly[r.month - 1] += Number(r.amount) || 0; });
      return { name: groupNameFn(gid), monthly, total: monthly.reduce((a, b) => a + b, 0) };
    }).sort((a, b) => b.total - a.total);
  }

  function pivotTableHtml(title, firstColLabel, rows, unit) {
    if (!rows.length) return `<div class="section-card"><h6 class="mb-0">${title}</h6><p class="text-muted small mb-0 mt-2">Bu yıl için veri yok.</p></div>`;
    const monthHeaders = Validation.MONTHS.map(m => `<th class="text-end">${m.slice(0, 3)}</th>`).join('');
    const body = rows.map(r => `<tr><td>${r.name}</td>${r.monthly.map(v => `<td class="text-end">${v ? Utils.fmt(v, 0) : '-'}</td>`).join('')}<td class="text-end fw-bold">${Utils.fmt(r.total, 0)}</td></tr>`).join('');
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return `<div class="section-card">
      <h6 class="mb-2">${title} <span class="text-muted small">(${unit})</span></h6>
      <div class="table-responsive"><table class="table table-sm table-hover mb-0">
        <thead><tr><th>${firstColLabel}</th>${monthHeaders}<th class="text-end">Toplam</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr class="fw-bold"><td>Genel Toplam</td>${Array.from({length:12}).map((_,i)=>`<td class="text-end">${Utils.fmt(rows.reduce((s,r)=>s+r.monthly[i],0),0)}</td>`).join('')}<td class="text-end">${Utils.fmt(grandTotal,0)}</td></tr></tfoot>
      </table></div>
    </div>`;
  }

  function summaryBodyHtml(year) {
    const supply = Store.getAll('waterSupplyData');
    const consumption = Store.getAll('waterConsumptionData');
    const totalSupply = supply.filter(r => Number(r.year) === year).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalConsumption = consumption.filter(r => Number(r.year) === year).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const balance = totalSupply - totalConsumption;
    const card = (label, value, unit, icon, accent) => `<div class="kpi-card ${accent}"><div class="kpi-label">${label}</div><div class="kpi-value">${value} <span class="kpi-unit">${unit}</span></div><i class="fa-solid ${icon} kpi-icon"></i></div>`;
    return `
      <div class="kpi-row">
        ${card('Toplam Su Temini', Utils.fmt(totalSupply,0), 'm³', 'fa-droplet', 'accent-2')}
        ${card('Toplam Su Tüketimi', Utils.fmt(totalConsumption,0), 'm³', 'fa-water', 'accent-1')}
        ${card('Fark (Temin - Tüketim)', Utils.fmt(balance,0), 'm³', 'fa-scale-balanced', 'accent-total')}
      </div>
      ${pivotTableHtml('Kaynak Bazında Aylık Su Temini', 'Kaynak', pivotRows(supply, 'sourceId', sourceName, year), 'm³')}
      ${pivotTableHtml('Sarf Yeri Bazında Aylık Su Tüketimi', 'Sarf Yeri', pivotRows(consumption, 'consumptionPointId', consumptionPointName, year), 'm³')}`;
  }

  function summaryTabHtml(year) {
    return `
      <div class="section-card d-flex align-items-center gap-2 mb-3">
        <label class="text-xs form-label mb-0">Yıl</label>
        <select id="wt-summary-year" class="form-select form-select-sm" style="max-width:120px">
          ${Utils.availableYears().map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <div id="wt-summary-body">${summaryBodyHtml(year)}</div>`;
  }

  function bindSummaryYearSelect() {
    const sel = document.getElementById('wt-summary-year');
    if (!sel) return;
    sel.addEventListener('change', () => {
      document.getElementById('wt-summary-body').innerHTML = summaryBodyHtml(Number(sel.value));
    });
  }

  window.Modules.water = {
    render(container) {
      const summaryYear = Utils.currentYear();
      container.innerHTML = `
        <ul class="nav nav-tabs mb-3">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#wt-supply">Su Temin Verileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#wt-consumption">Su Tüketim Verileri</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#wt-source-def">Kaynak Tanımları</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#wt-point-def">Sarf Yeri Tanımları</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#wt-summary">Aylık Özet</button></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="wt-supply">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Kuyu, belediye şebekesi vb. kaynaklardan temin edilen su miktarını aylık olarak kaydedin. Kaynak
              tanımlı değilse önce "Kaynak Tanımları" sekmesinden ekleyin.</div>
            ${supplyCrud.html()}
          </div>
          <div class="tab-pane fade" id="wt-consumption">
            <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
              Suyun nerede kullanıldığını (proses, soğutma, sosyal tesis, bahçe sulama vb.) sarf yerine göre kaydedin.</div>
            ${consumptionCrud.html()}
          </div>
          <div class="tab-pane fade" id="wt-source-def">${sourceCrud.html()}</div>
          <div class="tab-pane fade" id="wt-point-def">${consumptionPointCrud.html()}</div>
          <div class="tab-pane fade" id="wt-summary">${summaryTabHtml(summaryYear)}</div>
        </div>`;
      supplyCrud.mount(); consumptionCrud.mount(); sourceCrud.mount(); consumptionPointCrud.mount();
      bindSummaryYearSelect();
    },
    sourceName, consumptionPointName,
    refresh: () => {}
  };
})();
