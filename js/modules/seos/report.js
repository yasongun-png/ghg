/*
 * seos/report.js — builds the required V5 report outputs from a
 * calculation `result` object. Each report exposes a {header, rows} pair
 * (reused as-is by export.js for Excel/PDF) plus a couple of shared HTML
 * helpers for on-screen display.
 */
(function () {
  window.Seos = window.Seos || {};

  function riskBadgeHtml(sev) {
    const cls = { 'Düşük': 'seos-risk-low', 'Orta': 'seos-risk-medium', 'Yüksek': 'seos-risk-high' }[sev] || 'seos-risk-low';
    return `<span class="seos-risk-badge ${cls}">${sev}</span>`;
  }

  function tableHtml(header, rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<p class="text-muted small">Kayıt yok.</p>';
    return `<div class="table-responsive"><table class="table table-sm table-hover ${opts.tableClass || ''}">
      <thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c === undefined || c === null ? '-' : c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  // V5: three independent parameters can each fail on their own — list
  // every one that actually failed for this row, not just the first found.
  function gecersizlikSebebi(r) {
    const reasons = [];
    if (!r.n2oGecerli) reasons.push(r.c === null ? 'C boş' : 'C < 70 mg/Nm³');
    if (!r.debiGecerli) reasons.push(r.e === null ? 'E boş' : 'E < 70.000 Nm³/h');
    if (!r.dGecerli) reasons.push((r.d === null || r.d === undefined) ? 'D boş' : (r.d < 0 ? 'D negatif' : 'D geçersiz'));
    return reasons.length ? reasons.join(', ') : '-';
  }

  // 1. Veri Kalite Raporu — sıralama/yineleme/negatif(C/D/E)/boş(C/D/E)/eksik-dakika bulguları.
  function qualityIssues(result) {
    const rows = result.issues.filter(i => i.group === 'kalite').map(i => [i.title, i.count, i.description, i.severity]);
    return { header: ['Bulgu', 'Adet', 'Açıklama', 'Risk Seviyesi'], rows };
  }

  // 2. QA/QC Raporu — sıçrama/sabit sensör/aykırı değer/bütünlük bulguları.
  function qaqcIssues(result) {
    const rows = result.issues.filter(i => i.group === 'qaqc').map(i => [i.title, i.count, i.description, i.severity]);
    return { header: ['Uygunsuzluk', 'Adet', 'Açıklama', 'Risk Seviyesi'], rows };
  }

  // 3. Veri Kullanılabilirliği Raporu.
  function availability(result) {
    const a = result.availability;
    const rows = [
      ['Beklenen Kayıt Sayısı', a.expected],
      ['Proses Açık (F=Çalışıyor) Dakika', a.prosesAcikDakika],
      ['Geçerli Ölçüm', a.gecerliOlcum],
      ['Geçersiz N₂O', a.gecersizN2O],
      ['Geçersiz Debi', a.gecersizDebi],
      ['Geçersiz D', a.gecersizD],
      ['Birden Fazla Geçersiz Parametre', a.gecersizCoklu],
      ['Toplam Geçersiz', a.gecersizOlcum],
      ['Eksik Veri', a.eksikOlcum],
      ['Genel Veri Kullanılabilirliği (%)', a.pct.toFixed(2)],
      ['N₂O Geçerli Veri (%)', result.n2oGecerliVeriYuzde.toFixed(2)],
      ['Debi Geçerli Veri (%)', result.debiGecerliVeriYuzde.toFixed(2)],
      ['D Geçerli Veri (%)', result.dGecerliVeriYuzde.toFixed(2)],
      ['Karar', a.pct >= result.options.availabilityThreshold
        ? 'Geçerli ölçümler ile hesap yapıldı (eşik: %' + result.options.availabilityThreshold + ')'
        : 'İkame Veri Hesaplaması başlatıldı (eşik: %' + result.options.availabilityThreshold + ')']
    ];
    return { header: ['Gösterge', 'Değer'], rows };
  }

  // 4. Proses Açık/Kapalı Süreleri.
  function prosesSureleri(result) {
    const p = result.prosesSureleri;
    const rows = [
      ['Proses Açık Dakika', p.acikDakika], ['Proses Açık Saat', p.acikSaat.toFixed(2)],
      ['Proses Kapalı Dakika', p.kapaliDakika], ['Proses Kapalı Saat', p.kapaliSaat.toFixed(2)],
      ['Toplam Dakika', p.acikDakika + p.kapaliDakika]
    ];
    return { header: ['Gösterge', 'Değer'], rows };
  }

  // 5. Eksik Veri Listesi — sınıf 7, dosyada hiç bulunmayan dakikalar.
  function missingList(result) {
    const rows = result.records.filter(r => r.sinif === 7).map(r => [r.dateStr, r.timeStr, 'Eksik (0 kabul edildi, ikame uygulanmaz)']);
    return { header: ['Tarih', 'Saat', 'Durum'], rows };
  }

  // 6. Geçersiz Veri Listesi — sınıf 3/4/5/6, Proses Açık ama en az bir
  // parametre eşik altında kalıp (henüz veya hiç) ikame edilmemiş kayıtlar.
  function invalidList(result) {
    const rows = result.records.filter(r => r.sinif >= 3 && r.sinif <= 6).map(r => [
      r.dateStr, r.timeStr, r.sinifAdi,
      r.c === null ? '-' : r.c.toFixed(2), r.e === null ? '-' : r.e.toFixed(0), (r.d === null || r.d === undefined) ? '-' : r.d.toFixed(4),
      gecersizlikSebebi(r)
    ]);
    return { header: ['Tarih', 'Saat', 'Veri Sınıfı', 'N₂O (mg/Nm³)', 'Debi (Nm³/h)', 'D (kg/h)', 'Geçersizlik Sebebi'], rows };
  }

  // 7. İkame Veri Listesi — sınıf 8. Her satırda YALNIZCA gerçekten
  // ikame edilen parametre(ler) dolu görünür (spec §15-17: N₂O/Debi/D
  // birbirinden bağımsız ikame edilir).
  function substitutionList(result) {
    const f2 = (v, d) => v === undefined || v === null ? '-' : v.toFixed(d);
    const rows = (result.substitutionLog || []).map(s => [
      s.dateStr, s.timeStr, (s.substituted || []).join(', '),
      f2(s.olculenC, 2), f2(s.ikameC, 2),
      f2(s.olculenE, 0), f2(s.ikameE, 0),
      f2(s.olculenD, 4), f2(s.ikameD, 4)
    ]);
    return { header: ['Tarih', 'Saat', 'İkame Edilen Parametre(ler)', 'Ölçülen N₂O', 'İkame N₂O', 'Ölçülen Debi', 'İkame Debi', 'Ölçülen D', 'İkame D'], rows };
  }

  // 8. Ölçülen Veri Emisyonu (günlük).
  function measuredEmission(result) {
    const rows = result.dailyAgg.map(d => [d.date, d.olculenKg.toFixed(4), d.olculenCo2eTon.toFixed(4)]);
    return { header: ['Tarih', 'Ölçülen N₂O (kg)', 'Ölçülen CO₂e (ton)'], rows };
  }

  // 9. İkame Veri Emisyonu (günlük).
  function substitutedEmission(result) {
    const rows = result.dailyAgg.map(d => [d.date, d.ikameKg.toFixed(4), d.ikameCo2eTon.toFixed(4)]);
    return { header: ['Tarih', 'İkame N₂O (kg)', 'İkame CO₂e (ton)'], rows };
  }

  // 10. Toplam Emisyon (günlük, ölçülen + ikame birlikte).
  function totalEmission(result) {
    const rows = result.dailyAgg.map(d => [d.date, d.workingMinutes, d.workingHours.toFixed(2), d.avgFlow.toFixed(0), d.toplamKg.toFixed(4), d.co2eTon.toFixed(4)]);
    return { header: ['Tarih', 'Çalışan Dakika', 'Çalışma Saati', 'Ort. Debi (Nm³/h)', 'Toplam N₂O (kg)', 'CO₂e (ton)'], rows };
  }

  // 11. CO2e Raporu (aylık + toplam).
  function co2eReport(result) {
    const rows = result.monthlyAgg.map(m => [m.month, m.toplamKg.toFixed(3), (m.toplamKg * result.options.gwp).toFixed(2), m.co2eTon.toFixed(3)]);
    rows.push(['TOPLAM', result.totalN2OKg.toFixed(3), result.totalCO2eKg.toFixed(2), result.totalCO2eTon.toFixed(3)]);
    return { header: ['Ay', 'N₂O (kg)', 'CO₂e (kg)', 'CO₂e (ton)'], rows };
  }

  // 12. İkame Veri Etki Oranı.
  function ikameEtkiOrani(result) {
    const rows = [
      ['Toplam Ölçülen N₂O (kg)', result.totalOlculenN2OKg.toFixed(3)],
      ['Toplam İkame N₂O (kg)', result.totalIkameN2OKg.toFixed(3)],
      ['Toplam N₂O (kg)', result.totalN2OKg.toFixed(3)],
      ['İkame Veri Etki Oranı (%)', result.ikameEtkiOrani.toFixed(2)]
    ];
    return { header: ['Gösterge', 'Değer'], rows };
  }

  // 13. Kullanılan İkame Yöntemi.
  function ikameYontemi(result) {
    const rows = [
      ['Kullanılan Yöntem', result.substitutionUsed ? result.substitutionMethodLabel : '—'],
      ['İkame Tetiklendi mi', result.substitutionUsed ? 'Evet' : 'Hayır'],
      ['Veri Kullanılabilirliği Eşiği (%)', result.options.availabilityThreshold],
      ['Gerçekleşen Veri Kullanılabilirliği (%)', result.availability.pct.toFixed(2)],
      ['İkame Edilen Kayıt Sayısı', (result.substitutionLog || []).length],
      ['D Sütunu İkame Yöntemi', result.substitutionUsed ? result.substitutionMethodLabel : '—']
    ];
    return { header: ['Gösterge', 'Değer'], rows };
  }

  // 14. Kullanılan Formüller.
  function formulas() {
    const rows = [
      ['Proses Durumu', 'Kolon F\'ten okunur ("Çalışıyor"/"Çalışmıyor"); kolon eşlenmemişse Proses Açık kabul edilir.'],
      ['N₂O Geçerliliği (Proses Açık iken)', 'C ≥ 70 mg/Nm³ → Geçerli'],
      ['Debi Geçerliliği (Proses Açık iken)', 'E ≥ 70.000 Nm³/h → Geçerli'],
      ['D Geçerliliği (Proses Açık iken)', 'D boş olmayan, sayısal, negatif olmayan bir değer → Geçerli (D sütunu dosyada yoksa D = C × E / 1.000.000 formülüyle hesaplanır ve bu hesaplanan değer her zaman geçerli kabul edilir)'],
      ['Tam Geçerli Veri (Geçerli Ölçüm)', 'C geçerli VE Debi geçerli VE D geçerli — üçü BİRDEN sağlanmalı'],
      ['N₂O Kütlesel Debisi (D sütunu yoksa)', 'D (kg/h) = C (mg/Nm³) × E (Nm³/h) / 1.000.000'],
      ['Dakikalık N₂O Kütlesi (Emisyon)', 'kg/dakika = D Kullanılan (kg/h) / 60 — D geçerliyse ölçülen D, değilse ikame D kullanılır'],
      ['Genel Veri Kullanılabilirliği', '(Geçerli Ölçüm Sayısı / Proses Açık [F=Çalışıyor] Dakika) × 100'],
      ['N₂O Geçerli Veri (%)', '(Proses Açık VE C ≥ 70 olan dakika / Proses Açık Dakika) × 100'],
      ['Debi Geçerli Veri (%)', '(Proses Açık VE E ≥ 70.000 olan dakika / Proses Açık Dakika) × 100'],
      ['D Geçerli Veri (%)', '(Proses Açık VE D geçerli olan dakika / Proses Açık Dakika) × 100'],
      ['İkame Veri Etki Oranı', '(Toplam İkame N₂O / Toplam N₂O) × 100'],
      ['CO₂e', 'Toplam N₂O (kg) × GWP(N₂O) [IPCC AR6: 273] / 1000 = ton CO₂e'],
      ['Standart Sapma', 'Popülasyon standart sapması: √(Σ(xᵢ-x̄)² / n), Nihai (Kullanılan) N₂O değerleri üzerinden']
    ];
    return { header: ['Hesaplama', 'Formül'], rows };
  }

  // 15. Hesaplama Adımları — pipeline'ın gerçek sonuçlarla adım adım özeti.
  function calculationSteps(result) {
    const a = result.availability;
    const rows = [
      ['1', 'Veri Kontrolü', `${result.issues.filter(i => i.group === 'kalite').length} bulgu tespit edildi (sıralama/yineleme/negatif C-D-E/boş C-D-E).`],
      ['2', 'Eksik Dakika Tamamlama', `${a.eksikOlcum} dakika eksikti, ızgaraya "Eksik Veri" (sınıf 7) olarak eklendi.`],
      ['3', 'Proses Durumu', `Proses Açık: ${result.prosesSureleri.acikDakika} dakika, Proses Kapalı: ${result.prosesSureleri.kapaliDakika} dakika.`],
      ['4', 'Ölçüm Sınıflandırması', `Geçerli Ölçüm: ${a.gecerliOlcum}, Geçersiz N₂O: ${a.gecersizN2O}, Geçersiz Debi: ${a.gecersizDebi}, Geçersiz D: ${a.gecersizD}, Birden Fazla Geçersiz: ${a.gecersizCoklu} (Proses Açık dakikalar içinde).`],
      ['5', 'Veri Kullanılabilirliği', `%${a.pct.toFixed(2)} (Geçerli ${a.gecerliOlcum} / Proses Açık ${a.prosesAcikDakika}). N₂O: %${result.n2oGecerliVeriYuzde.toFixed(1)}, Debi: %${result.debiGecerliVeriYuzde.toFixed(1)}, D: %${result.dGecerliVeriYuzde.toFixed(1)}.`],
      ['6', 'Karar ve İkame Veri', result.substitutionUsed
        ? `Eşiğin (%${result.options.availabilityThreshold}) altında kalındığı için "${result.substitutionMethodLabel}" yöntemiyle ${result.substitutionLog.length} kayıtta en az bir parametre (N₂O/Debi/D bağımsız olarak) ikame edildi.`
        : `Eşiğin (%${result.options.availabilityThreshold}) üzerinde olduğu için ikame veri gerekmedi.`],
      ['7', 'Ortalamalar', `N₂O — Ölçülen: ${result.olculenN2OOrtalama.toFixed(2)}, İkame: ${result.ikameN2OOrtalama.toFixed(2)}, Nihai: ${result.nihaiN2OOrtalama.toFixed(2)} mg/Nm³. `
        + `Debi — Ölçülen: ${result.olculenDebiOrtalama.toFixed(0)}, İkame: ${result.ikameDebiOrtalama.toFixed(0)}, Nihai: ${result.nihaiDebiOrtalama.toFixed(0)} Nm³/h. `
        + `D — Ölçülen: ${result.olculenDOrtalama.toFixed(4)}, İkame: ${result.ikameDOrtalama.toFixed(4)}, Nihai: ${result.nihaiDOrtalama.toFixed(4)} kg/h.`],
      ['8', 'Emisyon Hesapları', `Çalışma Dakikası (F=Çalışıyor): ${result.workingMinutes}, Çalışma Saati: ${result.workingHours.toFixed(2)}, Min N₂O: ${result.minN2O.toFixed(2)}, Maks N₂O: ${result.maxN2O.toFixed(2)}, Std. Sapma: ${result.stdDevN2O.toFixed(2)} mg/Nm³.`],
      ['9', 'İkame Veri Etki Oranı', `%${result.ikameEtkiOrani.toFixed(2)} (İkame N₂O ${result.totalIkameN2OKg.toFixed(3)} kg / Toplam N₂O ${result.totalN2OKg.toFixed(3)} kg).`],
      ['10', 'Günlük/Aylık N₂O', `${result.dailyAgg.length} güne, ${result.monthlyAgg.length} aya dağılmış sonuçlar hesaplandı.`],
      ['11', 'CO₂e', `${result.totalCO2eTon.toFixed(3)} ton CO₂e (GWP N₂O = ${result.options.gwp}, IPCC AR6).`]
    ];
    return { header: ['Adım', 'İşlem', 'Sonuç'], rows };
  }

  // 16. Sonuç Özeti.
  function summary(result) {
    const rows = [
      ['Genel Veri Kullanılabilirliği', `%${result.availability.pct.toFixed(2)}`],
      ['İkame Veri Kullanıldı mı', result.substitutionUsed ? `Evet (${result.substitutionMethodLabel})` : 'Hayır'],
      ['İkame Veri Etki Oranı', `%${result.ikameEtkiOrani.toFixed(2)}`],
      ['Çalışma Süresi', `${result.workingHours.toFixed(2)} saat (${result.workingMinutes} dakika)`],
      ['N₂O Ortalaması (Ölçülen / İkame / Nihai)', `${result.olculenN2OOrtalama.toFixed(2)} / ${result.ikameN2OOrtalama.toFixed(2)} / ${result.nihaiN2OOrtalama.toFixed(2)} mg/Nm³`],
      ['Debi Ortalaması (Ölçülen / İkame / Nihai)', `${result.olculenDebiOrtalama.toFixed(0)} / ${result.ikameDebiOrtalama.toFixed(0)} / ${result.nihaiDebiOrtalama.toFixed(0)} Nm³/h`],
      ['D Ortalaması (Ölçülen / İkame / Nihai)', `${result.olculenDOrtalama.toFixed(4)} / ${result.ikameDOrtalama.toFixed(4)} / ${result.nihaiDOrtalama.toFixed(4)} kg/h`],
      ['N₂O Geçerli Veri (%)', `%${result.n2oGecerliVeriYuzde.toFixed(1)}`],
      ['Debi Geçerli Veri (%)', `%${result.debiGecerliVeriYuzde.toFixed(1)}`],
      ['D Geçerli Veri (%)', `%${result.dGecerliVeriYuzde.toFixed(1)}`],
      ['Toplam Ölçülen N₂O', `${result.totalOlculenN2OKg.toFixed(3)} kg`],
      ['Toplam İkame N₂O', `${result.totalIkameN2OKg.toFixed(3)} kg`],
      ['Toplam N₂O', `${result.totalN2OKg.toFixed(3)} kg`],
      ['Toplam CO₂e', `${result.totalCO2eTon.toFixed(3)} ton`],
      ['Kalite/QA-QC Bulgu Sayısı', String(result.issues.length)],
      ['Yüksek Riskli Bulgu Sayısı', String(result.issues.filter(i => i.severity === 'Yüksek').length)]
    ];
    return { header: ['Gösterge', 'Değer'], rows };
  }

  window.Seos.Report = {
    riskBadgeHtml, tableHtml, gecersizlikSebebi,
    qualityIssues, qaqcIssues, availability, prosesSureleri,
    missingList, invalidList, substitutionList,
    measuredEmission, substitutedEmission, totalEmission, co2eReport,
    ikameEtkiOrani, ikameYontemi, formulas, calculationSteps, summary
  };
})();
