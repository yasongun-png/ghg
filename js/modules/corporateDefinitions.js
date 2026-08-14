/*
 * corporateDefinitions.js — section 5: Firma, Tesis, Bölüm, Proses, Emisyon Kaynağı.
 */
(function () {
  window.Modules = window.Modules || {};

  function boundaryOptions() {
    return [
      { value: 'Öz Sermaye Payı (Equity Share)', label: 'Öz Sermaye Payı (Equity Share)' },
      { value: 'Finansal Kontrol (Financial Control)', label: 'Finansal Kontrol (Financial Control)' },
      { value: 'Operasyonel Kontrol (Operational Control)', label: 'Operasyonel Kontrol (Operational Control)' }
    ];
  }

  const companyCrud = CrudBuilder({
    key: 'companyData', title: 'Firma', icon: 'fa-building',
    columns: [
      { field: 'name', label: 'Firma Adı' }, { field: 'taxNo', label: 'Vergi No' },
      { field: 'sector', label: 'Sektör' }, { field: 'naceCode', label: 'NACE Kodu' },
      { field: 'operationalBoundary', label: 'Operasyonel Sınır' }
    ],
    fields: [
      { name: 'name', label: 'Firma Adı', required: true, colSize: 6 },
      { name: 'taxNo', label: 'Vergi No', colSize: 6 },
      { name: 'address', label: 'Adres', type: 'textarea', colSize: 12 },
      { name: 'sector', label: 'Sektör', colSize: 6 },
      { name: 'naceCode', label: 'NACE Kodu', colSize: 6 },
      { name: 'reportingBoundary', label: 'Raporlama Sınırı', colSize: 6, type: 'select', options: boundaryOptions() },
      { name: 'organizationalBoundary', label: 'Organizasyonel Sınır', colSize: 6, type: 'select', options: boundaryOptions() },
      { name: 'operationalBoundary', label: 'Operasyonel Sınır', colSize: 6, type: 'select', options: boundaryOptions() }
    ]
  });

  const facilityCrud = CrudBuilder({
    key: 'facilityData', title: 'Tesis', icon: 'fa-industry',
    columns: [
      { field: 'name', label: 'Tesis Adı' }, { field: 'code', label: 'Tesis Kodu' },
      { field: 'location', label: 'Lokasyon' },
      { field: 'isProduction', label: 'Üretim Tesisi', render: r => r.isProduction ? '<span class="badge text-bg-success">Evet</span>' : '<span class="badge text-bg-secondary">Hayır</span>' },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'name', label: 'Tesis Adı', required: true, colSize: 6 },
      { name: 'code', label: 'Tesis Kodu', required: true, colSize: 6 },
      { name: 'location', label: 'Lokasyon', colSize: 12 },
      { name: 'isProduction', label: 'Üretim Tesisi mi?', type: 'checkbox', colSize: 6, default: true },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 6, default: true }
    ],
    afterChange: () => refreshDropdownDependents()
  });

  const departmentCrud = CrudBuilder({
    key: 'departmentData', title: 'Bölüm', icon: 'fa-sitemap',
    columns: [
      { field: 'name', label: 'Bölüm Adı' },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'responsible', label: 'Sorumlu Kişi' }
    ],
    fields: [
      { name: 'name', label: 'Bölüm Adı', required: true, colSize: 6 },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 6, options: () => Utils.facilityOptions() },
      { name: 'responsible', label: 'Sorumlu Kişi', colSize: 12 }
    ],
    afterChange: () => refreshDropdownDependents()
  });

  const processCrud = CrudBuilder({
    key: 'processData', title: 'Proses', icon: 'fa-diagram-project',
    columns: [
      { field: 'name', label: 'Proses Adı' },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'departmentId', label: 'Bölüm', render: r => Utils.departmentName(r.departmentId) },
      { field: 'description', label: 'Açıklama' }
    ],
    fields: [
      { name: 'name', label: 'Proses Adı', required: true, colSize: 6 },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 6, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 6, options: () => Utils.departmentOptions() },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterChange: () => refreshDropdownDependents()
  });

  const emissionSourceCrud = CrudBuilder({
    key: 'emissionSourceData', title: 'Emisyon Kaynağı', icon: 'fa-cloud',
    columns: [
      { field: 'name', label: 'Kaynak Adı' }, { field: 'scope', label: 'Scope', render: r => 'Scope ' + r.scope },
      { field: 'category', label: 'Kategori' }, { field: 'activityType', label: 'Yakıt/Aktivite' },
      { field: 'unit', label: 'Birim' }, { field: 'calcMethod', label: 'Hesaplama Yöntemi' },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'name', label: 'Kaynak Adı', required: true, colSize: 6 },
      { name: 'scope', label: 'Scope', type: 'select', required: true, colSize: 6, options: [{value:1,label:'Scope 1'},{value:2,label:'Scope 2'},{value:3,label:'Scope 3'}] },
      { name: 'category', label: 'Kategori', colSize: 6 },
      { name: 'activityType', label: 'Yakıt/Aktivite', colSize: 6 },
      { name: 'unit', label: 'Birim', colSize: 6 },
      { name: 'calcMethod', label: 'Hesaplama Yöntemi', type: 'select', colSize: 6, options: [
        {value:'Emisyon Faktörü Bazlı', label:'Emisyon Faktörü Bazlı'}, {value:'Ölçüm Bazlı', label:'Ölçüm Bazlı'},
        {value:'Kütle Dengesi', label:'Kütle Dengesi'}, {value:'Manuel', label:'Manuel'}] },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 6, default: true }
    ]
  });

  function refreshDropdownDependents() {
    // department/process selects read live from Store each render, nothing to cache.
  }

  window.Modules.corporate = {
    render(container) {
      container.innerHTML = `
        <ul class="nav nav-tabs mb-3" role="tablist">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-company">Firma</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-facility">Tesis</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-department">Bölüm</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-process">Proses</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-source">Emisyon Kaynağı</button></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="tab-company">${companyCrud.html()}</div>
          <div class="tab-pane fade" id="tab-facility">${facilityCrud.html()}</div>
          <div class="tab-pane fade" id="tab-department">${departmentCrud.html()}</div>
          <div class="tab-pane fade" id="tab-process">${processCrud.html()}</div>
          <div class="tab-pane fade" id="tab-source">${emissionSourceCrud.html()}</div>
        </div>`;
      companyCrud.mount(); facilityCrud.mount(); departmentCrud.mount(); processCrud.mount(); emissionSourceCrud.mount();
    }
  };
})();
