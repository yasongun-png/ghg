/*
 * reportingYear.js — section 6: Raporlama Yılı tanımlama.
 */
(function () {
  window.Modules = window.Modules || {};

  const statusOptions = [
    { value: 'preparing', label: 'Hazırlanıyor' },
    { value: 'entry', label: 'Veri Girişi Devam Ediyor' },
    { value: 'review', label: 'Kontrol Ediliyor' },
    { value: 'done', label: 'Tamamlandı' },
    { value: 'revised', label: 'Revize Edildi' }
  ];
  const statusLabel = v => (statusOptions.find(s => s.value === v) || {}).label || v;

  const crud = CrudBuilder({
    key: 'reportingYears', title: 'Raporlama Yılları', icon: 'fa-calendar-days',
    columns: [
      { field: 'year', label: 'Raporlama Yılı' }, { field: 'baseYear', label: 'Baz Yıl' },
      { field: 'startDate', label: 'Başlangıç' }, { field: 'endDate', label: 'Bitiş' },
      { field: 'gwpSet', label: 'GWP Seti' },
      { field: 'status', label: 'Durum', render: r => statusLabel(r.status) }
    ],
    fields: [
      { name: 'year', label: 'Raporlama Yılı', type: 'number', required: true, colSize: 4 },
      { name: 'baseYear', label: 'Baz Yıl', type: 'number', colSize: 4 },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', colSize: 4, options: () => Utils.gwpSetOptions(), required: true },
      { name: 'startDate', label: 'Raporlama Başlangıç Tarihi', type: 'date', colSize: 6 },
      { name: 'endDate', label: 'Raporlama Bitiş Tarihi', type: 'date', colSize: 6 },
      { name: 'status', label: 'Durum', type: 'select', colSize: 6, options: statusOptions, required: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterChange: () => window.App && App.refreshYearSelector && App.refreshYearSelector()
  });

  window.Modules.reportingyear = {
    render(container) {
      container.innerHTML = crud.html();
      crud.mount();
    }
  };
})();
