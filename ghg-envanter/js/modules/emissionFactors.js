/*
 * emissionFactors.js — section 16: Emisyon Faktörleri Veritabanı.
 * Nothing here is hard-coded into the calculation engine — every factor is a
 * regular, user-editable/addable record, and every calculation that uses one
 * snapshots its source/version/year so results stay traceable (section 41).
 */
(function () {
  window.Modules = window.Modules || {};

  const crud = CrudBuilder({
    key: 'emissionFactors', title: 'Emisyon Faktörleri Veritabanı', icon: 'fa-database',
    columns: [
      { field: 'scope', label: 'Scope', render: r => 'Scope ' + r.scope },
      { field: 'category', label: 'Kategori' }, { field: 'activity', label: 'Aktivite' }, { field: 'fuel', label: 'Yakıt/Gaz' },
      { field: 'factorUnit', label: 'Faktör Birimi' },
      { field: 'co2', label: 'CO2' }, { field: 'ch4', label: 'CH4' }, { field: 'n2o', label: 'N2O' },
      { field: 'co2eFactor', label: 'CO2e (doğrudan)' },
      { field: 'source', label: 'Kaynak' }, { field: 'version', label: 'Versiyon' }, { field: 'validYear', label: 'Yıl' },
      { field: 'gwpSet', label: 'GWP Seti' },
      { field: 'active', label: 'Durum', render: r => r.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Pasif</span>' }
    ],
    fields: [
      { name: 'scope', label: 'Scope', type: 'select', required: true, colSize: 3, options: [{value:1,label:'Scope 1'},{value:2,label:'Scope 2'},{value:3,label:'Scope 3'}] },
      { name: 'category', label: 'Kategori', required: true, colSize: 5 },
      { name: 'activity', label: 'Aktivite', required: true, colSize: 4 },
      { name: 'fuel', label: 'Yakıt / Gaz', colSize: 4 },
      { name: 'unit', label: 'Aktivite Birimi', colSize: 4 },
      { name: 'factorUnit', label: 'Faktör Birimi (görsel)', colSize: 6 },
      { name: 'co2', label: 'CO2 Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'ch4', label: 'CH4 Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'n2o', label: 'N2O Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'hfc', label: 'HFC Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'pfc', label: 'PFC Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'sf6', label: 'SF6 Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'nf3', label: 'NF3 Faktörü (kg/birim)', type: 'number', colSize: 3 },
      { name: 'co2eFactor', label: 'Doğrudan CO2e Faktörü (kg CO2e/birim)', type: 'number', colSize: 3 },
      { name: 'gwpSet', label: 'Önerilen GWP Seti', type: 'select', colSize: 6, options: () => Utils.gwpSetOptions() },
      { name: 'country', label: 'Ülke', colSize: 6, default: 'Türkiye / Genel' },
      { name: 'source', label: 'Faktör Kaynağı', required: true, colSize: 6 },
      { name: 'sourceDocument', label: 'Kaynak Doküman', colSize: 6 },
      { name: 'version', label: 'Versiyon', colSize: 4 },
      { name: 'validYear', label: 'Geçerlilik Yılı', type: 'number', colSize: 4 },
      { name: 'active', label: 'Aktif', type: 'checkbox', colSize: 4, default: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ]
  });

  window.Modules.factors = {
    render(container) {
      container.innerHTML = `
        <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
          Faktörler hesaplama motorunda otomatik kullanılır ancak hiçbir zaman kullanıcıdan gizlenmez: her hesaplama
          detayında kaynak, versiyon ve geçerlilik yılı gösterilir. Yeni faktör eklemek veya mevcut değerleri
          güncellemek serbesttir.</div>
        ${crud.html()}`;
      crud.mount();
    }
  };
})();
