/*
 * seos/ui.js — screen rendering: (1) file upload, (2) column mapping,
 * (3) tabbed results dashboard. Pure DOM/event wiring — all numbers come
 * from Seos.Calculation; all report tables from Seos.Report; all exports
 * from Seos.Export.
 */
(function () {
  window.Seos = window.Seos || {};

  let state = {}; // transient: { workbook, sheetName, headers, aoa, fileName }

  function cappedRows(rows, n) {
    return rows.length > n ? { rows: rows.slice(0, n), truncated: true, total: rows.length } : { rows, truncated: false, total: rows.length };
  }

  function exportButtonsHtml(key) {
    return `<div class="ms-auto"><button class="btn btn-sm btn-outline-success seos-exp-xlsx" data-key="${key}"><i class="fa-solid fa-file-excel"></i> Excel</button>
      <button class="btn btn-sm btn-outline-danger seos-exp-pdf" data-key="${key}"><i class="fa-solid fa-file-pdf"></i> PDF</button></div>`;
  }

  // Row/badge styling keyed by the V5 8-class taxonomy (process.js/
  // substitution.js). Sınıf 3-6 (Geçersiz N₂O/Debi/D/Birden Fazla) all
  // share the same "invalid" red styling — spec §26 colors them all
  // Kırmızı, the Veri Sınıfı column's text already distinguishes which.
  const SINIF_ROW_CLASS = { 1: 'seos-row-kapali', 3: 'seos-row-invalid', 4: 'seos-row-invalid', 5: 'seos-row-invalid', 6: 'seos-row-invalid', 7: 'seos-row-missing', 8: 'seos-row-substituted' };
  const SINIF_STATUS_CLASS = { 1: 'seos-status-kapali', 2: 'seos-status-ok', 3: 'seos-status-invalid', 4: 'seos-status-invalid', 5: 'seos-status-invalid', 6: 'seos-status-invalid', 7: 'seos-status-missing', 8: 'seos-status-substituted' };

  // ---------------------------------------------------------------------
  // Step 1 — Upload
  // ---------------------------------------------------------------------
  function renderUpload(container, handlers) {
    container.innerHTML = `
      <div class="section-card">
        <h5><i class="fa-solid fa-satellite-dish"></i> SEÖS N₂O Sera Gazı Hesaplama ve Veri Doğrulama Sistemi</h5>
        <p class="text-muted small">Sürekli Emisyon Ölçüm Sistemi'nden (SEÖS) alınan dakikalık verileri içeren Excel dosyasını yükleyin.
          Veri kalite kontrolü, eksik dakika tamamlama, proses çalışma kontrolü, veri kullanılabilirliği, gerekirse ikame veri
          hesaplaması ve tam emisyon/CO₂e hesabı otomatik olarak yapılır. Ham dakikalık veri yalnızca bu tarayıcıda
          (LocalStorage) saklanır, herhangi bir sunucuya gönderilmez.</p>
        <div class="row g-3 align-items-end">
          <div class="col-md-8">
            <label class="text-xs form-label mb-1">SEÖS Excel Dosyası (.xlsx, .xls, .csv)</label>
            <input type="file" id="seos-file-input" class="form-control" accept=".xlsx,.xls,.csv">
          </div>
          <div class="col-md-4">
            <button class="btn btn-outline-secondary w-100" id="seos-template-btn"><i class="fa-solid fa-file-arrow-down"></i> Örnek Şablon İndir</button>
          </div>
        </div>
        <div id="seos-upload-status" class="mt-3"></div>
      </div>
      <div id="seos-mapping-area"></div>`;

    document.getElementById('seos-template-btn').addEventListener('click', () => {
      Utils.exportTableToExcel('SEOS_Veri_Sablonu.xlsx', 'SEÖS Verisi',
        ['Tarih Saat', 'B', 'N2O Konsantrasyonu (mg/Nm3)', 'N2O Kütlesel Debisi (kg/h)', 'Baca Gazı Debisi (Nm3/h)', 'Proses Durumu'],
        [['01.01.2026 00:00', '', 85.4, 6.1, 71500, 'Açık'], ['01.01.2026 00:01', '', 84.9, 6.0, 71200, 'Açık']]);
    });

    document.getElementById('seos-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const statusEl = document.getElementById('seos-upload-status');
      statusEl.innerHTML = '<div class="text-muted small"><i class="fa-solid fa-spinner fa-spin"></i> Dosya okunuyor...</div>';
      try {
        const workbook = await window.Seos.Data.readWorkbook(file);
        const sheetName = workbook.SheetNames[0];
        statusEl.innerHTML = '';
        state = { workbook, sheetName, fileName: file.name };
        renderMapping(document.getElementById('seos-mapping-area'), handlers);
      } catch (err) {
        console.error(err);
        statusEl.innerHTML = `<div class="alert alert-danger">Dosya okunamadı: ${err.message}</div>`;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Step 2 — Column mapping
  // ---------------------------------------------------------------------
  function renderMapping(container, handlers) {
    const aoa = window.Seos.Data.sheetToAOA(state.workbook, state.sheetName);
    const headers = (aoa[0] || []).map((h, i) => h || `(Sütun ${i + 1})`);
    state.aoa = aoa; state.headers = headers;
    const guess = window.Seos.Data.guessMapping(headers);
    const savedSettings = window.Seos.Data.loadSettings() || { availabilityThreshold: 80, substitutionMethod: 'daily-average' };

    const colOptions = (selected, allowNone) => {
      let html = allowNone ? `<option value="-1">Kullanılmıyor</option>` : `<option value="-1">Seçiniz...</option>`;
      headers.forEach((h, i) => { html += `<option value="${i}" ${i === selected ? 'selected' : ''}>${h}</option>`; });
      return html;
    };

    const sheetSelectHtml = state.workbook.SheetNames.length > 1
      ? `<div class="col-md-4"><label class="text-xs form-label mb-1">Sayfa (Sheet)</label>
          <select id="seos-sheet-select" class="form-select form-select-sm">
            ${state.workbook.SheetNames.map(s => `<option value="${s}" ${s === state.sheetName ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>` : '';

    const methodOptions = Object.keys(window.Seos.Substitution.METHODS).map(k => {
      const implemented = window.Seos.Substitution.IMPLEMENTED.includes(k);
      return `<option value="${k}" ${!implemented ? 'disabled' : ''} ${k === savedSettings.substitutionMethod && implemented ? 'selected' : ''}>${window.Seos.Substitution.METHODS[k]}${implemented ? '' : ' (Yakında)'}</option>`;
    }).join('');

    const previewRows = aoa.slice(1, 9);

    container.innerHTML = `
      <div class="section-card">
        <h5><i class="fa-solid fa-table-columns"></i> Sütun Eşleştirme</h5>
        <p class="text-muted small">Dosyanızdaki sütun başlıkları otomatik tahmin edildi; gerekirse düzeltin. "N₂O Kütlesel Debisi" alanı
          boş bırakılırsa, Konsantrasyon × Baca Gazı Debisi / 1.000.000 formülüyle otomatik hesaplanır.</p>
        <div class="row g-3">
          ${sheetSelectHtml}
          <div class="col-md-4"><label class="text-xs form-label mb-1 form-required">Tarih Saat Sütunu</label>
            <select id="seos-map-ts" class="form-select form-select-sm">${colOptions(guess.tsCol, false)}</select></div>
          <div class="col-md-4"><label class="text-xs form-label mb-1 form-required">N₂O Konsantrasyonu (mg/Nm³) Sütunu</label>
            <select id="seos-map-c" class="form-select form-select-sm">${colOptions(guess.cCol, false)}</select></div>
          <div class="col-md-4"><label class="text-xs form-label mb-1">N₂O Kütlesel Debisi (kg/h) Sütunu (opsiyonel)</label>
            <select id="seos-map-d" class="form-select form-select-sm">${colOptions(guess.dCol, true)}</select></div>
          <div class="col-md-4"><label class="text-xs form-label mb-1 form-required">Baca Gazı Debisi (Nm³/h) Sütunu</label>
            <select id="seos-map-e" class="form-select form-select-sm">${colOptions(guess.eCol, false)}</select></div>
          <div class="col-md-4"><label class="text-xs form-label mb-1">Proses Durumu (Çalışıyor/Çalışmıyor) Sütunu (opsiyonel)</label>
            <select id="seos-map-f" class="form-select form-select-sm">${colOptions(guess.fCol, true)}</select>
            <div class="text-xs text-muted mt-1">Boş bırakılırsa proses her zaman "Çalışıyor" kabul edilir, sınıflandırma C/Debi/D geçerlilik kontrollerine göre yapılır.</div></div>
          <div class="col-md-4"><label class="text-xs form-label mb-1">İkame Veri Yöntemi</label>
            <select id="seos-map-method" class="form-select form-select-sm">${methodOptions}</select></div>
          <div class="col-md-4"><label class="text-xs form-label mb-1">Veri Kullanılabilirliği Eşiği (%)</label>
            <input type="number" id="seos-map-threshold" class="form-control form-control-sm" value="${savedSettings.availabilityThreshold || 80}" min="0" max="100"></div>
        </div>
        <h6 class="mt-3">Önizleme (ilk ${previewRows.length} satır)</h6>
        <div class="table-responsive"><table class="table table-sm table-bordered">
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${previewRows.map(r => `<tr>${headers.map((_, i) => `<td>${r[i] instanceof Date ? r[i].toISOString() : (r[i] === null || r[i] === undefined ? '' : r[i])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <div id="seos-calc-status" class="mb-2"></div>
        <button class="btn btn-success" id="seos-calc-btn"><i class="fa-solid fa-calculator"></i> Hesapla</button>
      </div>`;

    const sheetSelect = document.getElementById('seos-sheet-select');
    if (sheetSelect) sheetSelect.addEventListener('change', (e) => { state.sheetName = e.target.value; renderMapping(container, handlers); });

    document.getElementById('seos-calc-btn').addEventListener('click', () => {
      const mapping = {
        tsCol: Number(document.getElementById('seos-map-ts').value),
        cCol: Number(document.getElementById('seos-map-c').value),
        dCol: Number(document.getElementById('seos-map-d').value),
        eCol: Number(document.getElementById('seos-map-e').value),
        fCol: Number(document.getElementById('seos-map-f').value)
      };
      if (mapping.tsCol < 0 || mapping.cCol < 0 || mapping.eCol < 0) {
        Utils.toast('Tarih Saat, N₂O Konsantrasyonu ve Baca Gazı Debisi sütunları zorunludur.', 'danger');
        return;
      }
      const options = {
        substitutionMethod: document.getElementById('seos-map-method').value,
        availabilityThreshold: Number(document.getElementById('seos-map-threshold').value) || 80,
        gwp: window.Seos.Calculation.GWP_N2O_AR6
      };
      window.Seos.Data.saveSettings({ substitutionMethod: options.substitutionMethod, availabilityThreshold: options.availabilityThreshold });

      const statusEl = document.getElementById('seos-calc-status');
      statusEl.innerHTML = '<div class="text-muted small"><i class="fa-solid fa-spinner fa-spin"></i> Hesaplanıyor, büyük dosyalarda birkaç saniye sürebilir...</div>';
      setTimeout(() => {
        try {
          const built = window.Seos.Data.buildRecords(state.aoa, mapping);
          if (built.parseErrors) Utils.toast(`${built.parseErrors} satırda tarih/saat okunamadığı için atlandı.`, 'warning');
          if (!built.records.length) { statusEl.innerHTML = '<div class="alert alert-danger">Geçerli hiç kayıt bulunamadı.</div>'; return; }
          options.dColumnMapped = built.dColumnMapped;
          const result = window.Seos.Calculation.runFullPipeline(built.records, options);
          handlers.onCalculated({ fileName: state.fileName, mapping, options, result, savedAt: Date.now() });
        } catch (err) {
          console.error(err);
          statusEl.innerHTML = `<div class="alert alert-danger">Hesaplama sırasında hata oluştu: ${err.message}</div>`;
        }
      }, 30);
    });
  }

  // ---------------------------------------------------------------------
  // Step 3 — Results
  // ---------------------------------------------------------------------
  function summaryTabHtml(result) {
    const a = result.availability;
    const card = (label, value, unit, icon, accent) => `<div class="kpi-card ${accent}"><div class="kpi-label">${label}</div><div class="kpi-value">${value} <span class="kpi-unit">${unit}</span></div><i class="fa-solid ${icon} kpi-icon"></i></div>`;
    const R = window.Seos.Report;
    const steps = R.calculationSteps(result), formulas = R.formulas(), summary = R.summary(result);
    return `
      <div class="kpi-row">
        ${card('Veri Kullanılabilirliği', Utils.fmt(a.pct, 1), '%', 'fa-database', a.pct >= result.options.availabilityThreshold ? 'accent-total' : 'accent-1')}
        ${card('Çalışma Süresi', Utils.fmt(result.workingHours, 1), 'saat', 'fa-clock', 'accent-2')}
        ${card('Ortalama N₂O', Utils.fmt(result.avgN2O, 2), 'mg/Nm³', 'fa-wind', 'accent-1')}
        ${card('Toplam N₂O', Utils.fmt(result.totalN2OKg, 3), 'kg', 'fa-cloud', 'accent-1')}
        ${card('Toplam CO₂e', Utils.fmt(result.totalCO2eTon, 3), 'ton', 'fa-earth-americas', 'accent-total')}
        ${card('İkame Veri Etki Oranı', Utils.fmt(result.ikameEtkiOrani, 1), '%', 'fa-rotate', result.substitutionUsed ? 'accent-1' : 'accent-2')}
      </div>
      <div class="kpi-row">
        ${card('Ölçülen N₂O', Utils.fmt(result.totalOlculenN2OKg, 3), 'kg', 'fa-ruler', 'accent-2')}
        ${card('İkame N₂O', Utils.fmt(result.totalIkameN2OKg, 3), 'kg', 'fa-fill-drip', 'accent-1')}
        ${card('N₂O Geçerli Veri', Utils.fmt(result.n2oGecerliVeriYuzde, 1), '%', 'fa-check-double', 'accent-total')}
        ${card('Debi Geçerli Veri', Utils.fmt(result.debiGecerliVeriYuzde, 1), '%', 'fa-check-double', 'accent-total')}
        ${card('D Geçerli Veri', Utils.fmt(result.dGecerliVeriYuzde, 1), '%', 'fa-check-double', 'accent-total')}
      </div>
      <div class="section-card">
        <h6>Sonuç Özeti ${exportButtonsHtml('summary')}</h6>
        ${R.tableHtml(summary.header, summary.rows)}
      </div>
      <div class="section-card">
        <h6>Hesaplama Adımları ${exportButtonsHtml('steps')}</h6>
        ${R.tableHtml(steps.header, steps.rows)}
      </div>
      <div class="section-card">
        <h6>Kullanılan Formüller ${exportButtonsHtml('formulas')}</h6>
        ${R.tableHtml(formulas.header, formulas.rows)}
      </div>`;
  }

  function qualityTabHtml(result) {
    const R = window.Seos.Report;
    const quality = R.qualityIssues(result), qaqc = R.qaqcIssues(result);
    const withRisk = (t) => ({ header: t.header, rows: t.rows.map(r => r.slice(0, -1).concat([R.riskBadgeHtml(r[r.length - 1])])) });
    const q1 = withRisk(quality), q2 = withRisk(qaqc);
    return `
      <div class="section-card">
        <h6><i class="fa-solid fa-clipboard-check"></i> Veri Kalite Raporu ${exportButtonsHtml('quality')}</h6>
        ${R.tableHtml(q1.header, q1.rows)}
      </div>
      <div class="section-card">
        <h6><i class="fa-solid fa-magnifying-glass-chart"></i> QA/QC Raporu ${exportButtonsHtml('qaqc')}</h6>
        ${R.tableHtml(q2.header, q2.rows)}
      </div>`;
  }

  function availabilityTabHtml(result) {
    const R = window.Seos.Report;
    const av = R.availability(result);
    const proses = R.prosesSureleri(result);
    const ikameYontemi = R.ikameYontemi(result);
    const missing = cappedRows(R.missingList(result).rows, 500);
    const invalid = cappedRows(R.invalidList(result).rows, 500);
    const sub = cappedRows(R.substitutionList(result).rows, 500);
    return `
      <div class="row">
        <div class="col-lg-6">
          <div class="section-card">
            <h6>Veri Kullanılabilirliği Raporu ${exportButtonsHtml('availability')}</h6>
            ${R.tableHtml(av.header, av.rows)}
          </div>
        </div>
        <div class="col-lg-6"><div class="chart-card"><h6>Veri Kullanılabilirliği Dağılımı (Proses Açık Dakika)</h6><div class="chart-wrap"><canvas id="seos-chart-availability"></canvas></div></div></div>
      </div>
      <div class="row">
        <div class="col-lg-6">
          <div class="section-card">
            <h6>Proses Açık/Kapalı Süreleri ${exportButtonsHtml('proses-sureleri')}</h6>
            ${R.tableHtml(proses.header, proses.rows)}
          </div>
        </div>
        <div class="col-lg-6"><div class="chart-card"><h6>Çalışma / Duruş Süresi</h6><div class="chart-wrap"><canvas id="seos-chart-uptime"></canvas></div></div></div>
      </div>
      <div class="section-card">
        <h6>Kullanılan İkame Yöntemi ${exportButtonsHtml('ikame-yontemi')}</h6>
        ${R.tableHtml(ikameYontemi.header, ikameYontemi.rows)}
      </div>
      <div class="section-card">
        <h6>Eksik Veri Listesi ${exportButtonsHtml('missing')}</h6>
        <p class="text-muted small">Dosyada hiç bulunmayan dakikalar (sınıf 7) — ikame edilmez, emisyona 0 katkı sağlar.</p>
        ${missing.truncated ? `<p class="text-muted small">İlk 500 / ${missing.total} kayıt gösteriliyor — tam liste Excel çıktısında.</p>` : ''}
        ${R.tableHtml(R.missingList(result).header, missing.rows)}
      </div>
      <div class="section-card">
        <h6>Geçersiz Veri Listesi ${exportButtonsHtml('invalid')}</h6>
        <p class="text-muted small">Proses Açık iken N₂O/Debi/D parametrelerinden en az biri eşik altında kalıp henüz (veya hiç) ikame edilmemiş kayıtlar (sınıf 3-6).</p>
        ${invalid.truncated ? `<p class="text-muted small">İlk 500 / ${invalid.total} kayıt gösteriliyor — tam liste Excel çıktısında.</p>` : ''}
        ${R.tableHtml(R.invalidList(result).header, invalid.rows)}
      </div>
      <div class="section-card">
        <h6>İkame Veri Listesi ${exportButtonsHtml('substitution')}</h6>
        ${result.substitutionUsed ? '' : '<p class="text-muted small">Bu dönemde veri kullanılabilirliği eşiğin üzerinde olduğu için ikame veri hesaplaması çalıştırılmadı.</p>'}
        ${sub.truncated ? `<p class="text-muted small">İlk 500 / ${sub.total} kayıt gösteriliyor — tam liste Excel çıktısında.</p>` : ''}
        ${R.tableHtml(R.substitutionList(result).header, sub.rows)}
      </div>`;
  }

  function emissionTabHtml(result) {
    const R = window.Seos.Report;
    const measured = R.measuredEmission(result), substituted = R.substitutedEmission(result),
      total = R.totalEmission(result), co2e = R.co2eReport(result), etkiOrani = R.ikameEtkiOrani(result);
    return `
      <div class="row">
        <div class="col-lg-8">
          <div class="section-card">
            <h6>İkame Veri Etki Oranı ${exportButtonsHtml('ikame-etki')}</h6>
            ${R.tableHtml(etkiOrani.header, etkiOrani.rows)}
          </div>
        </div>
        <div class="col-lg-4"><div class="chart-card"><h6>Ölçülen / İkame Karşılaştırması</h6><div class="chart-wrap"><canvas id="seos-chart-compare"></canvas></div></div></div>
      </div>
      <div class="section-card">
        <h6>Günlük Emisyon (Ölçülen + İkame) ${exportButtonsHtml('total-emission')}</h6>
        <div class="chart-wrap mb-3" style="height:220px"><canvas id="seos-chart-daily"></canvas></div>
        ${R.tableHtml(total.header, total.rows)}
      </div>
      <div class="section-card">
        <h6>Aylık Emisyon (Ölçülen + İkame + CO₂e) ${exportButtonsHtml('co2e')}</h6>
        <div class="chart-wrap mb-3" style="height:220px"><canvas id="seos-chart-monthly"></canvas></div>
        ${R.tableHtml(co2e.header, co2e.rows)}
      </div>
      <div class="row">
        <div class="col-lg-6">
          <div class="section-card">
            <h6>Ölçülen Veri Emisyonu ${exportButtonsHtml('measured-emission')}</h6>
            ${R.tableHtml(measured.header, measured.rows)}
          </div>
        </div>
        <div class="col-lg-6">
          <div class="section-card">
            <h6>İkame Veri Emisyonu ${exportButtonsHtml('substituted-emission')}</h6>
            ${R.tableHtml(substituted.header, substituted.rows)}
          </div>
        </div>
      </div>`;
  }

  function chartsTabHtml() {
    const pane = (title, id) => `<div class="col-lg-6"><div class="chart-card"><h6>${title}</h6><div class="chart-wrap"><canvas id="${id}"></canvas></div></div></div>`;
    return `<div class="row">
      ${pane('Baca Gazı Debisi Trendi', 'seos-chart-flow')}
      ${pane('N₂O Konsantrasyonu Trendi', 'seos-chart-n2o')}
      ${pane('D (N₂O Kütlesel Debisi) Trendi', 'seos-chart-d')}
      ${pane('N₂O Geçerli/Geçersiz Dağılımı', 'seos-chart-n2o-validity')}
      ${pane('Debi Geçerli/Geçersiz Dağılımı', 'seos-chart-debi-validity')}
      ${pane('D Geçerli/Geçersiz Dağılımı', 'seos-chart-d-validity')}
      ${pane('Histogram (N₂O Dağılımı)', 'seos-chart-histogram')}
      ${pane('Box Plot (N₂O)', 'seos-chart-boxplot')}
      ${pane('Aykırı Değer Grafiği', 'seos-chart-outlier')}
    </div>`;
  }

  function rawTabHtml(result) {
    if (!result.records || !result.records.length) {
      return `<div class="alert alert-warning">Ham dakikalık veri bu oturumda saklanamadı (tarayıcı depolama sınırı nedeniyle yalnızca özet sonuçlar kaydedildi).
        Satır bazında incelemek için dosyayı tekrar yükleyip hesaplayın.</div>`;
    }
    return `<div class="section-card">
      <h6>Ham Veri / Hesaplama Sonuçları
        <div class="ms-auto"><button class="btn btn-sm btn-outline-success" id="seos-raw-xlsx"><i class="fa-solid fa-file-excel"></i> Ham Veriyi Excel'e Aktar</button></div>
      </h6>
      <p class="text-muted small">
        <span class="seos-status seos-status-kapali">Proses Kapalı</span>
        <span class="seos-status seos-status-ok">Geçerli Ölçüm</span>
        <span class="seos-status seos-status-invalid">Geçersiz N₂O / Debi / D / Birden Fazla</span>
        <span class="seos-status seos-status-missing">Eksik Veri</span>
        <span class="seos-status seos-status-substituted">İkame Veri</span>
        — büyük veri setlerinde tablo yüklenmesi birkaç saniye sürebilir.
      </p>
      <table id="seos-raw-table" class="table table-sm table-hover w-100">
        <thead><tr>
          <th>Tarih</th><th>Saat</th><th>Proses Durumu</th>
          <th>N₂O Ölçülen</th><th>N₂O Durumu</th><th>Debi Ölçülen</th><th>Debi Durumu</th><th>D Ölçülen</th><th>D Durumu</th>
          <th>Veri Sınıfı</th>
          <th>N₂O İkame</th><th>Debi İkame</th><th>D İkame</th>
          <th>N₂O Kullanılan</th><th>Debi Kullanılan</th><th>D Kullanılan</th>
          <th>N₂O Kütlesel Debi</th><th>Dakikalık Emisyon (kg)</th><th>CO₂e (kg)</th><th>Açıklama</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  }

  const GECERLILIK_LABEL = { true: 'Geçerli', false: 'Geçersiz' };
  const gecerlilikCell = (v) => v === undefined || v === null ? '-' : GECERLILIK_LABEL[v];
  const numCell = (v, d) => v === undefined || v === null ? '-' : Utils.fmt(v, d);

  function buildRawTable(result) {
    if (!result.records || !result.records.length) return;
    const R = window.Seos.Report;
    const statusBadge = (r) => `<span class="seos-status ${SINIF_STATUS_CLASS[r.sinif] || 'seos-status-ok'}">${r.sinifAdi || '-'}</span>`;
    const aciklama = (r) => {
      if (r.sinif === 1) return 'Proses Kapalı';
      if (r.sinif === 7) return 'Eksik Veri (0 kabul edildi, ikame uygulanmaz)';
      if (r.sinif === 2) return 'Geçerli Ölçüm';
      if (r.sinif === 8) return `İkame Veri (${result.substitutionMethodLabel || window.Seos.Substitution.METHODS['daily-average']})`;
      if (r.sinif >= 3 && r.sinif <= 6) return R.gecersizlikSebebi(r);
      return '-';
    };
    Utils.initDataTable('#seos-raw-table', {
      data: result.records, deferRender: true, pageLength: 25,
      columns: [
        { data: 'dateStr' }, { data: 'timeStr' },
        { data: 'prosesDurumu', render: v => v || '-' },
        { data: 'c', render: v => numCell(v, 2) },
        { data: 'n2oGecerli', render: gecerlilikCell },
        { data: 'e', render: v => numCell(v, 0) },
        { data: 'debiGecerli', render: gecerlilikCell },
        { data: 'd', render: v => numCell(v, 4) },
        { data: 'dGecerli', render: gecerlilikCell },
        { data: null, render: (r) => statusBadge(r) },
        { data: 'ikameC', render: v => numCell(v, 2) },
        { data: 'ikameE', render: v => numCell(v, 0) },
        { data: 'ikameD', render: v => numCell(v, 4) },
        { data: 'n2oKullanilan', render: v => numCell(v, 2) },
        { data: 'debiKullanilan', render: v => numCell(v, 0) },
        { data: 'dKullanilan', render: v => numCell(v, 4) },
        { data: 'dKullanilan', render: v => numCell(v, 4) },
        { data: 'n2oKg', render: v => Utils.fmt(v, 5) },
        { data: 'co2eKg', render: v => Utils.fmt(v, 3) },
        { data: null, render: (r) => aciklama(r) }
      ],
      createdRow: (row, data) => {
        const cls = SINIF_ROW_CLASS[data.sinif];
        if (cls) row.classList.add(cls);
      }
    });
  }

  function buildAllCharts(result) {
    const C = window.Seos.Charts;
    if (result.records && result.records.length) {
      C.flowTrendChart('seos-chart-flow', result.records);
      C.n2oTrendChart('seos-chart-n2o', result.records);
      C.dTrendChart('seos-chart-d', result.records);
      const nihaiN2O = result.records.filter(r => r.n2oKullanilan !== null && r.n2oKullanilan !== undefined).map(r => r.n2oKullanilan);
      C.histogramChart('seos-chart-histogram', nihaiN2O);
      C.boxPlotChart('seos-chart-boxplot', nihaiN2O);
      C.outlierChart('seos-chart-outlier', result.records);
      C.validityChart('seos-chart-n2o-validity', result.records, 'n2oGecerli', 'N₂O');
      C.validityChart('seos-chart-debi-validity', result.records, 'debiGecerli', 'Debi');
      C.validityChart('seos-chart-d-validity', result.records, 'dGecerli', 'D');
    }
  }

  function renderResults(container, payload, handlers) {
    const result = payload.result;
    container.innerHTML = `
      <div class="section-card d-flex align-items-center flex-wrap gap-2">
        <div>
          <h5 class="mb-0"><i class="fa-solid fa-satellite-dish"></i> SEÖS N₂O Sonuçları</h5>
          <p class="text-muted small mb-0">${payload.fileName || 'Dosya'} — ${new Date(payload.savedAt || result.generatedAt).toLocaleString('tr-TR')}</p>
        </div>
        <div class="ms-auto d-flex gap-2">
          <button class="btn btn-outline-success" id="seos-export-all"><i class="fa-solid fa-file-excel"></i> Tüm Raporu Excel'e Aktar</button>
          <button class="btn btn-outline-secondary" id="seos-new-file"><i class="fa-solid fa-rotate"></i> Yeni Dosya Yükle</button>
        </div>
      </div>
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#seos-t-summary">Özet</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#seos-t-quality">Veri Kalitesi / QA-QC</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#seos-t-availability">Kullanılabilirlik</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#seos-t-emission">Emisyon Sonuçları</button></li>
        <li class="nav-item"><button class="nav-link" id="seos-charts-tab-btn" data-bs-toggle="tab" data-bs-target="#seos-t-charts">Grafikler</button></li>
        <li class="nav-item"><button class="nav-link" id="seos-raw-tab-btn" data-bs-toggle="tab" data-bs-target="#seos-t-raw">Ham Veri</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="seos-t-summary">${summaryTabHtml(result)}</div>
        <div class="tab-pane fade" id="seos-t-quality">${qualityTabHtml(result)}</div>
        <div class="tab-pane fade" id="seos-t-availability">${availabilityTabHtml(result)}</div>
        <div class="tab-pane fade" id="seos-t-emission">${emissionTabHtml(result)}</div>
        <div class="tab-pane fade" id="seos-t-charts">${chartsTabHtml()}</div>
        <div class="tab-pane fade" id="seos-t-raw">${rawTabHtml(result)}</div>
      </div>`;

    // Daily/monthly/availability/uptime/comparison charts live outside the
    // lazy "Grafikler" tab so they're visible immediately on their own tabs
    // (Kullanılabilirlik / Emisyon Sonuçları) without an extra click.
    window.Seos.Charts.dailyEmissionChart('seos-chart-daily', result.dailyAgg);
    window.Seos.Charts.monthlyEmissionChart('seos-chart-monthly', result.monthlyAgg);
    window.Seos.Charts.availabilityChart('seos-chart-availability', result.availability);
    window.Seos.Charts.uptimeChart('seos-chart-uptime', result.prosesSureleri);
    window.Seos.Charts.measuredVsSubstitutedChart('seos-chart-compare', result.totalOlculenN2OKg, result.totalIkameN2OKg);

    document.getElementById('seos-charts-tab-btn').addEventListener('shown.bs.tab', () => buildAllCharts(result));
    document.getElementById('seos-raw-tab-btn').addEventListener('shown.bs.tab', () => buildRawTable(result));

    document.getElementById('seos-export-all').addEventListener('click', () => window.Seos.Export.exportAllExcel(result));
    document.getElementById('seos-new-file').addEventListener('click', () => {
      if (!confirm('Mevcut SEÖS sonuçları tarayıcı belleğinden silinecek ve yeni bir dosya yükleyebileceksiniz. Devam edilsin mi?')) return;
      window.Seos.Data.clearDataset();
      handlers.onReset();
    });
    const rawXlsx = document.getElementById('seos-raw-xlsx');
    if (rawXlsx) rawXlsx.addEventListener('click', () => window.Seos.Export.exportRawData(result));

    container.addEventListener('click', (e) => {
      const xlsxBtn = e.target.closest('.seos-exp-xlsx');
      if (xlsxBtn) { window.Seos.Export.exportExcel(xlsxBtn.dataset.key, result); return; }
      const pdfBtn = e.target.closest('.seos-exp-pdf');
      if (pdfBtn) window.Seos.Export.exportPDF(pdfBtn.dataset.key, result);
    });
  }

  window.Seos.UI = { renderUpload, renderResults };
})();
