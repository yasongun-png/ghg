/*
 * seos/export.js — Excel/PDF export for every SEÖS report, plus a
 * multi-sheet "tüm raporlar" workbook and a full raw-data dump. Reuses the
 * app's existing Utils.exportTableToExcel/PDF helpers for single-table
 * exports; multi-sheet workbooks are built directly with SheetJS since
 * Utils only supports one sheet at a time.
 */
(function () {
  window.Seos = window.Seos || {};

  function statusLabel(r) { return r.sinifAdi || '-'; }

  // Single registry drives both the export buttons (ui.js) and the
  // multi-sheet "tüm raporlar" workbook — one place to add a 17th report.
  function reportDefs() {
    const R = window.Seos.Report;
    return [
      { key: 'quality', title: 'Veri Kalite Raporu', file: 'Veri_Kalite_Raporu', getter: R.qualityIssues },
      { key: 'qaqc', title: 'QAQC Raporu', file: 'QAQC_Raporu', getter: R.qaqcIssues },
      { key: 'availability', title: 'Kullanilabilirlik Raporu', file: 'Veri_Kullanilabilirlik_Raporu', getter: R.availability },
      { key: 'proses-sureleri', title: 'Proses Acik-Kapali Sureleri', file: 'Proses_Acik_Kapali_Sureleri', getter: R.prosesSureleri },
      { key: 'missing', title: 'Eksik Veri Listesi', file: 'Eksik_Veri_Listesi', getter: R.missingList },
      { key: 'invalid', title: 'Gecersiz Olcum Listesi', file: 'Gecersiz_Olcum_Listesi', getter: R.invalidList },
      { key: 'substitution', title: 'Ikame Veri Listesi', file: 'Ikame_Veri_Listesi', getter: R.substitutionList },
      { key: 'measured-emission', title: 'Olculen Veri Emisyonu', file: 'Olculen_Veri_Emisyonu', getter: R.measuredEmission },
      { key: 'substituted-emission', title: 'Ikame Veri Emisyonu', file: 'Ikame_Veri_Emisyonu', getter: R.substitutedEmission },
      { key: 'total-emission', title: 'Toplam Emisyon', file: 'Toplam_Emisyon', getter: R.totalEmission },
      { key: 'co2e', title: 'CO2e Raporu', file: 'CO2e_Raporu', getter: R.co2eReport },
      { key: 'ikame-etki', title: 'Ikame Veri Etki Orani', file: 'Ikame_Veri_Etki_Orani', getter: R.ikameEtkiOrani },
      { key: 'ikame-yontemi', title: 'Kullanilan Ikame Yontemi', file: 'Kullanilan_Ikame_Yontemi', getter: R.ikameYontemi },
      { key: 'formulas', title: 'Kullanilan Formuller', file: 'Kullanilan_Formuller', getter: () => R.formulas() },
      { key: 'steps', title: 'Hesaplama Adimlari', file: 'Hesaplama_Adimlari', getter: R.calculationSteps },
      { key: 'summary', title: 'Sonuc Ozeti', file: 'Sonuc_Ozeti', getter: R.summary }
    ];
  }

  function findDef(key) { return reportDefs().find(d => d.key === key); }

  function exportExcel(key, result) {
    const def = findDef(key);
    if (!def) return;
    const { header, rows } = def.getter(result);
    Utils.exportTableToExcel(`SEOS_${def.file}.xlsx`, def.title.slice(0, 31), header, rows);
  }

  function exportPDF(key, result) {
    const def = findDef(key);
    if (!def) return;
    const { header, rows } = def.getter(result);
    Utils.exportTableToPDF(def.title.replace(/_/g, ' '), header, rows, `SEOS_${def.file}.pdf`);
  }

  function exportAllExcel(result) {
    const wb = XLSX.utils.book_new();
    reportDefs().forEach(def => {
      const { header, rows } = def.getter(result);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 31));
    });
    XLSX.writeFile(wb, `SEOS_Tum_Raporlar_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Column set matches spec §24's required "Ana veri tablosu" fields exactly
  // (also mirrored 1:1 in ui.js's on-screen Ham Veri table).
  const gecerlilikText = (v) => v === undefined || v === null ? '-' : (v ? 'Geçerli' : 'Geçersiz');
  function aciklama(result, r) {
    const R = window.Seos.Report;
    if (r.sinif === 1) return 'Proses Kapalı';
    if (r.sinif === 7) return 'Eksik Veri (0 kabul edildi, ikame uygulanmaz)';
    if (r.sinif === 2) return 'Geçerli Ölçüm';
    if (r.sinif === 8) return `İkame Veri (${result.substitutionMethodLabel || window.Seos.Substitution.METHODS['daily-average']})`;
    if (r.sinif >= 3 && r.sinif <= 6) return R.gecersizlikSebebi(r);
    return '-';
  }

  function exportRawData(result) {
    if (!result.records || !result.records.length) {
      Utils.toast('Ham veri bu oturumda mevcut değil (tarayıcı depolama sınırı nedeniyle sadece özet sonuçlar saklandı). Detaylı ham veri için dosyayı tekrar yükleyin.', 'warning');
      return;
    }
    const header = ['Tarih', 'Saat', 'Proses Durumu',
      'N2O Ölçülen (mg/Nm3)', 'N2O Durumu', 'Debi Ölçülen (Nm3/h)', 'Debi Durumu', 'D Ölçülen (kg/h)', 'D Durumu',
      'Veri Sınıfı',
      'N2O İkame (mg/Nm3)', 'Debi İkame (Nm3/h)', 'D İkame (kg/h)',
      'N2O Kullanılan (mg/Nm3)', 'Debi Kullanılan (Nm3/h)', 'D Kullanılan (kg/h)',
      'N2O Kütlesel Debi (kg/h)', 'Dakikalık Emisyon (kg)', 'CO2e (kg)', 'Açıklama'];
    const rows = result.records.map(r => [
      r.dateStr, r.timeStr, r.prosesDurumu || '-',
      r.c, gecerlilikText(r.n2oGecerli), r.e, gecerlilikText(r.debiGecerli), r.d, gecerlilikText(r.dGecerli),
      statusLabel(r),
      r.ikameC != null ? r.ikameC : null, r.ikameE != null ? r.ikameE : null, r.ikameD != null ? r.ikameD : null,
      r.n2oKullanilan, r.debiKullanilan, r.dKullanilan, r.dKullanilan,
      Number(r.n2oKg.toFixed(6)), Number(r.co2eKg.toFixed(4)), aciklama(result, r)
    ]);
    Utils.exportTableToExcel('SEOS_Ham_Veri.xlsx', 'Ham Veri', header, rows);
  }

  window.Seos.Export = { reportDefs, exportExcel, exportPDF, exportAllExcel, exportRawData, statusLabel };
})();
