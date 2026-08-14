/*
 * fugitiveEmissions.js — section 10.D: Kaçak Emisyonlar (soğutucu/klima gazları,
 * yangın söndürme gazları, SF6, diğer gazlar). Fugitive emissions = leaked mass
 * (kg) x GWP of that specific gas (from the GWP Yönetimi registry) — there is no
 * separate combustion-style emission factor for a direct gas release.
 */
(function () {
  window.Modules = window.Modules || {};
  const KEY = 'fugitiveEmissionData';

  function runFugitiveCalc(rec) {
    const gwpSet = rec.gwpSet || 'AR5';
    const gwpEntry = Store.getAll('gwpFactors').find(g => g.gasName === rec.gasType && g.gwpSet === gwpSet);
    Calc.runAndStore({
      sourceKey: KEY, sourceId: rec.id, module: 'fugitive', scope: 1,
      category: `Kaçak Emisyon - ${rec.gasType} (${rec.equipmentType})`,
      year: rec.year, month: rec.month, facilityId: rec.facilityId, departmentId: rec.departmentId,
      activityValue: rec.leakedMass, activityUnit: 'kg gaz',
      manualFactor: { co2eFactor: gwpEntry ? gwpEntry.gwp : 0, activity: rec.gasType, source: gwpEntry ? gwpEntry.source : 'GWP kaydı bulunamadı', version: gwpEntry ? gwpEntry.version : '-', validYear: gwpEntry ? gwpEntry.validYear : '' },
      gwpSet, method: 'Kaçak Miktar x GWP'
    });
  }

  function gasOptions(selected) {
    const names = Array.from(new Set(Store.getAll('gwpFactors').map(g => g.gasName)))
      .filter(n => !['CO2'].includes(n)); // CO2 leakage is negligible/handled elsewhere
    return names.map(n => `<option value="${n}" ${n === selected ? 'selected' : ''}>${n}</option>`).join('');
  }

  const crud = CrudBuilder({
    key: KEY, title: 'Kaçak Emisyonlar', icon: 'fa-wind', showCalcDetail: true,
    columns: [
      { field: 'year', label: 'Yıl' }, { field: 'month', label: 'Ay', render: r => Validation.MONTHS[r.month-1] },
      { field: 'facilityId', label: 'Tesis', render: r => Utils.facilityName(r.facilityId) },
      { field: 'equipmentType', label: 'Ekipman Türü' }, { field: 'gasType', label: 'Gaz' },
      { field: 'leakedMass', label: 'Kaçak Miktarı (kg)', render: r => Utils.fmt(r.leakedMass) },
      { field: 'dataQuality', label: 'Veri Kalitesi', render: r => Utils.dqBadge(r.dataQuality) },
      { field: 'status', label: 'Durum', render: r => Utils.statusBadge(r.status) + Utils.demoBadge(r.isDemo) }
    ],
    fields: [
      { name: 'year', label: 'Yıl', type: 'number', required: true, colSize: 3, default: new Date().getFullYear() },
      { name: 'month', label: 'Ay', type: 'select', required: true, colSize: 3, options: () => Utils.monthOptions() },
      { name: 'facilityId', label: 'Tesis', type: 'select', required: true, colSize: 3, options: () => Utils.facilityOptions() },
      { name: 'departmentId', label: 'Bölüm', type: 'select', colSize: 3, options: () => Utils.departmentOptions() },
      { name: 'equipmentType', label: 'Ekipman Türü', type: 'select', required: true, colSize: 6, options: [
        {value:'Soğutma Sistemi', label:'Soğutucu Gaz / Soğutma Sistemi'}, {value:'Klima', label:'Klima Sistemi'},
        {value:'Yangın Söndürme', label:'Yangın Söndürme Sistemi'}, {value:'SF6 Ekipmanı', label:'SF6 Ekipmanı (Şalt vb.)'},
        {value:'Diğer', label:'Diğer'}] },
      { name: 'gasType', label: 'Gaz Türü', type: 'select', required: true, colSize: 6, options: () => gasOptions() },
      { name: 'equipmentId', label: 'Ekipman No / Etiket', colSize: 6 },
      { name: 'leakedMass', label: 'Kaçak / Şarj Edilen Miktar (kg)', type: 'number', required: true, colSize: 6 },
      { name: 'gwpSet', label: 'GWP Seti', type: 'select', colSize: 6, options: () => Utils.gwpSetOptions() },
      { name: 'dataQuality', label: 'Veri Kalitesi', type: 'select', colSize: 6, options: () => Utils.dataQualityOptions(), default: 'C' },
      { name: 'document', label: 'Belge (Servis Formu / Bakım Kaydı)', colSize: 6 },
      { name: 'description', label: 'Açıklama', type: 'textarea', colSize: 12 }
    ],
    afterSave: (rec) => runFugitiveCalc(rec),
    afterDelete: (id) => Calc.removeForSource(KEY, id)
  });

  window.Modules.fugitive = {
    render(container) {
      const year = Utils.currentYear();
      const total = Calc.sumCO2eTon({ year, module: 'fugitive' });
      container.innerHTML = `
        <div class="kpi-row">
          <div class="kpi-card accent-1"><div class="kpi-label">Toplam Kaçak Emisyon (${year})</div><div class="kpi-value">${Utils.fmt(total,3)} <span class="kpi-unit">tCO2e</span></div><i class="fa-solid fa-wind kpi-icon"></i></div>
        </div>
        ${crud.html()}`;
      crud.mount();
    },
    runCalc: runFugitiveCalc,
    refresh: () => crud.refresh()
  };
})();
