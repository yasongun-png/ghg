/*
 * gwpManagement.js — section 17: GWP Yönetimi (AR4/AR5/AR6).
 */
(function () {
  window.Modules = window.Modules || {};

  const crud = CrudBuilder({
    key: 'gwpFactors', title: 'GWP (Global Warming Potential) Değerleri', icon: 'fa-globe',
    columns: [
      { field: 'gasName', label: 'Gaz Adı' }, { field: 'formula', label: 'Formül' },
      { field: 'gwpSet', label: 'GWP Seti' }, { field: 'gwp', label: 'GWP (100 yıl)' },
      { field: 'source', label: 'Kaynak' }, { field: 'validYear', label: 'Geçerlilik Yılı' }
    ],
    fields: [
      { name: 'gasName', label: 'Gaz Adı', required: true, colSize: 6 },
      { name: 'formula', label: 'Kimyasal Formül', colSize: 6 },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', required: true, colSize: 4, options: () => Utils.gwpSetOptions() },
      { name: 'gwp', label: 'GWP Değeri (100 yıl)', type: 'number', required: true, colSize: 4 },
      { name: 'validYear', label: 'Geçerlilik Yılı', type: 'number', colSize: 4 },
      { name: 'source', label: 'Kaynak', colSize: 8 },
      { name: 'version', label: 'Versiyon', colSize: 4 }
    ]
  });

  window.Modules.gwp = {
    render(container) {
      container.innerHTML = `
        <div class="alert alert-light border small mb-3"><i class="fa-solid fa-circle-info text-primary"></i>
          IPCC AR4 / AR5 / AR6 100 yıllık GWP setleri desteklenir. Her raporlama yılı için hangi GWP setinin
          kullanılacağı <a href="#reportingyear">Raporlama Yılı</a> ekranından seçilir.</div>
        ${crud.html()}`;
      crud.mount();
    }
  };
})();
