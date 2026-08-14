/*
 * processEmissions.js — section 14 & 15: Proses Emisyonları + Nitrik Asit özel hesabı.
 * NOx is tracked for information only and is explicitly NEVER added into CO2e —
 * N2O (a greenhouse gas) and NOx (a criteria air pollutant) are different things,
 * and the UI calls this out wherever NOx appears (section 15 requirement).
 */
(function () {
  window.Modules = window.Modules || {};
  const KEY = 'processEmissionData';

  const PROCESS_TYPES = ['Nitrik Asit', 'Amonyak', 'Üre', 'CAN', 'AN', 'AS', 'Fosforik Asit', 'Sülfürik Asit', 'Diğer'];
  const METHODS = [
    { value: 'measurement', label: '1. Ölçüm Bazlı' },
    { value: 'factor', label: '2. Emisyon Faktörü Bazlı' },
    { value: 'massbalance', label: '3. Kütle Dengesi' },
    { value: 'activity', label: '4. Aktivite Verisi Bazlı' },
    { value: 'manual', label: '5. Manuel Hesaplama' }
  ];

  function rowsFiltered() { return Store.getAll(KEY); }

  function tableHtml() {
    return `
    <div class="section-card" id="pe-section">
      <h5><i class="fa-solid fa-flask"></i> Proses Emisyonları
        <button class="btn btn-sm btn-success ms-auto" id="pe-add-btn"><i class="fa-solid fa-plus"></i> Yeni Ekle</button>
      </h5>
      <div class="table-responsive">
        <table id="pe-table" class="table table-sm table-hover w-100">
          <thead><tr><th>Yıl</th><th>Ay</th><th>Tesis</th><th>Proses</th><th>Yöntem</th><th>Aktivite</th><th>N2O (kg)</th><th>CO2e (ton)</th><th>Durum</th><th class="nowrap">İşlem</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;
  }

  function renderTable() {
    const tbody = document.querySelector('#pe-table tbody');
    if (!tbody) return;
    tbody.innerHTML = rowsFiltered().map(r => {
      const calc = Store.getAll('calculationResults').find(c => c.sourceKey === KEY && String(c.sourceId) === String(r.id));
      const yearLocked = !Utils.canEditYear(r.year);
      const editDeleteHtml = yearLocked
        ? `<span class="text-muted" title="${r.year} yılı için düzenleme yetkiniz yok"><i class="fa-solid fa-lock"></i></span>`
        : `<button class="btn btn-sm btn-outline-primary btn-edit" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
           <button class="btn btn-sm btn-outline-danger btn-delete" title="Sil"><i class="fa-solid fa-trash"></i></button>`;
      return `<tr data-id="${r.id}">
        <td>${r.year}</td><td>${Validation.MONTHS[r.month-1]||''}</td><td>${Utils.facilityName(r.facilityId)}</td>
        <td>${r.processType}</td><td>${(METHODS.find(m=>m.value===r.calcMethod)||{}).label||''}</td>
        <td>${Utils.fmt(r.activityValue)} ${r.unit||''}</td>
        <td>${calc && calc.gasEmissions ? Utils.fmt(calc.gasEmissions.n2o,3) : '-'}</td>
        <td><strong>${calc ? Utils.fmt(calc.totalCO2eTon,3) : '-'}</strong></td>
        <td>${Utils.statusBadge(r.status)}${Utils.demoBadge(r.isDemo)}</td>
        <td class="table-actions nowrap">
          ${calc ? '<button class="btn btn-sm btn-outline-info btn-detail" title="Hesaplama Detayı"><i class="fa-solid fa-magnifying-glass-chart"></i></button>' : ''}
          ${editDeleteHtml}
        </td></tr>`;
    }).join('');
    Utils.initDataTable('#pe-table', { columnDefs: [{ orderable: false, targets: -1 }] });
  }

  function formHtml(r) {
    r = r || {};
    return `
    <form id="pe-form">
      <div class="row">
        <div class="col-md-3 mb-2"><label class="form-label text-xs form-required">Yıl</label><input type="number" name="year" class="form-control form-control-sm" value="${r.year||new Date().getFullYear()}" required></div>
        <div class="col-md-3 mb-2"><label class="form-label text-xs form-required">Ay</label><select name="month" class="form-select form-select-sm" required>${Utils.monthOptions(r.month)}</select></div>
        <div class="col-md-3 mb-2"><label class="form-label text-xs form-required">Tesis</label><select name="facilityId" class="form-select form-select-sm" required>${Utils.facilityOptions(r.facilityId)}</select></div>
        <div class="col-md-3 mb-2"><label class="form-label text-xs">Proses</label><select name="processId" class="form-select form-select-sm">${Utils.processOptions(r.processId)}</select></div>

        <div class="col-md-4 mb-2"><label class="form-label text-xs form-required">Proses Türü</label>
          <select name="processType" id="pe-processType" class="form-select form-select-sm" required>
            <option value="">Seçiniz...</option>${PROCESS_TYPES.map(p=>`<option value="${p}" ${p===r.processType?'selected':''}>${p}</option>`).join('')}
          </select></div>
        <div class="col-md-4 mb-2"><label class="form-label text-xs form-required">Hesaplama Yöntemi</label>
          <select name="calcMethod" id="pe-calcMethod" class="form-select form-select-sm" required>
            <option value="">Seçiniz...</option>${METHODS.map(m=>`<option value="${m.value}" ${m.value===r.calcMethod?'selected':''}>${m.label}</option>`).join('')}
          </select></div>
        <div class="col-md-4 mb-2"><label class="form-label text-xs">Ürün (bağlantı)</label><select name="productId" class="form-select form-select-sm">${Utils.productOptions(r.productId)}</select></div>

        <div class="col-md-4 mb-2"><label class="form-label text-xs form-required">Aktivite Verisi</label><input type="number" step="any" name="activityValue" class="form-control form-control-sm" value="${r.activityValue||''}" required></div>
        <div class="col-md-4 mb-2"><label class="form-label text-xs">Birim</label><input type="text" name="unit" class="form-control form-control-sm" value="${r.unit||'ton'}"></div>
        <div class="col-md-4 mb-2"><label class="form-label text-xs">Veri Kalitesi</label><select name="dataQuality" class="form-select form-select-sm">${Utils.dataQualityOptions(r.dataQuality||'C')}</select></div>

        <div class="col-12 mb-2" id="pe-factor-wrap"><label class="form-label text-xs">Emisyon Faktörü (Emisyon Faktörü / Aktivite Verisi Bazlı yöntemler için)</label>
          <select name="factorId" class="form-select form-select-sm">${Utils.factorOptions(r.factorId, 1)}</select></div>
        <div class="col-md-6 mb-2" id="pe-manual-wrap"><label class="form-label text-xs">Manuel CO2e (ton) — Kütle Dengesi / Manuel için</label>
          <input type="number" step="any" name="manualCO2eTon" class="form-control form-control-sm" value="${r.manualCO2eTon||''}"></div>
        <div class="col-md-6 mb-2"><label class="form-label text-xs">GWP Seti</label><select name="gwpSet" class="form-select form-select-sm">${Utils.gwpSetOptions(r.gwpSet)}</select></div>

        <div class="col-12" id="pe-nitric-block" style="display:none">
          <hr>
          <div class="alert alert-warning small"><i class="fa-solid fa-triangle-exclamation"></i>
            <strong>Önemli:</strong> NOx (azot oksitler) bir sera gazı DEĞİLDİR ve CO2e hesabına dahil edilmez.
            Sadece N2O (diazot monoksit) sera gazı envanterine eklenir. Aşağıdaki NOx alanı bilgi/izleme amaçlıdır.</div>
          <div class="row">
            <div class="col-md-4 mb-2"><label class="form-label text-xs">Çalışma Süresi (saat)</label><input type="number" name="workingDuration" class="form-control form-control-sm" value="${r.workingDuration||''}"></div>
            <div class="col-md-4 mb-2"><label class="form-label text-xs">Baca Gazı Debisi (Nm³/h)</label><input type="number" name="fluegasFlow" class="form-control form-control-sm" value="${r.fluegasFlow||''}"></div>
            <div class="col-md-4 mb-2"><label class="form-label text-xs">Ölçüm Tarihi</label><input type="date" name="measurementDate" class="form-control form-control-sm" value="${r.measurementDate||''}"></div>
            <div class="col-md-4 mb-2"><label class="form-label text-xs text-success">N2O Konsantrasyonu (mg/Nm³)</label><input type="number" name="n2oConcentration" class="form-control form-control-sm" value="${r.n2oConcentration||''}"></div>
            <div class="col-md-4 mb-2"><label class="form-label text-xs text-danger">NOx Konsantrasyonu (mg/Nm³) — sera gazı değil, bilgi amaçlı</label><input type="number" name="noxConcentration" class="form-control form-control-sm" value="${r.noxConcentration||''}"></div>
            <div class="col-md-4 mb-2"><label class="form-label text-xs">Ölçüm Cihazı</label><input type="text" name="measurementDevice" class="form-control form-control-sm" value="${r.measurementDevice||''}"></div>
            <div class="col-md-6 mb-2"><label class="form-label text-xs">Azaltım Sistemi</label><input type="text" name="abatementSystem" class="form-control form-control-sm" value="${r.abatementSystem||''}" placeholder="ör. NSCR, Tersiyer Azaltım"></div>
            <div class="col-md-6 mb-2"><label class="form-label text-xs">Katalizör Bilgisi / Çalışma Süresi</label><input type="text" name="catalystInfo" class="form-control form-control-sm" value="${r.catalystInfo||''}"></div>
          </div>
        </div>

        <div class="col-md-6 mb-2"><label class="form-label text-xs">Ölçüm Raporu / Belge</label><input type="text" name="measurementReport" class="form-control form-control-sm" value="${r.measurementReport||''}"></div>
        <div class="col-12 mb-2"><label class="form-label text-xs">Açıklama</label><textarea name="description" class="form-control form-control-sm" rows="2">${r.description||''}</textarea></div>
      </div>
      <div class="text-end mt-2">
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Vazgeç</button>
        <button type="submit" class="btn btn-success btn-sm"><i class="fa-solid fa-check"></i> Kaydet</button>
      </div>
    </form>`;
  }

  function toggleConditional(form) {
    const type = form.querySelector('[name=processType]').value;
    const method = form.querySelector('[name=calcMethod]').value;
    form.querySelector('#pe-nitric-block').style.display = (type === 'Nitrik Asit') ? '' : 'none';
    form.querySelector('#pe-factor-wrap').style.display = (method === 'factor' || method === 'activity') ? '' : 'none';
    form.querySelector('#pe-manual-wrap').style.display = (method === 'massbalance' || method === 'manual') ? '' : 'none';
  }

  function readForm(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((v, k) => obj[k] = v);
    ['year','month','activityValue','manualCO2eTon','workingDuration','fluegasFlow','n2oConcentration','noxConcentration'].forEach(k => {
      if (obj[k] !== undefined && obj[k] !== '') obj[k] = Number(obj[k]);
    });
    return obj;
  }

  function calculateAndStore(rec) {
    const meta = {
      sourceKey: KEY, sourceId: rec.id, module: 'process', scope: 1,
      category: `Proses - ${rec.processType}`, year: rec.year, month: rec.month,
      facilityId: rec.facilityId, processId: rec.processId, productId: rec.productId,
      gwpSet: rec.gwpSet || 'AR5'
    };

    if (rec.calcMethod === 'factor' || rec.calcMethod === 'activity') {
      Calc.runAndStore(Object.assign({}, meta, {
        activityValue: rec.activityValue, activityUnit: rec.unit,
        factorId: rec.factorId, method: (METHODS.find(m=>m.value===rec.calcMethod)||{}).label
      }));
    } else if (rec.calcMethod === 'measurement') {
      // N2O mass (kg) = concentration(mg/Nm3) * flue gas flow (Nm3/h) * duration (h) / 1e6
      const massKg = ((Number(rec.n2oConcentration)||0) * (Number(rec.fluegasFlow)||0) * (Number(rec.workingDuration)||0)) / 1e6;
      Calc.runAndStore(Object.assign({}, meta, {
        activityValue: massKg, activityUnit: 'kg N2O (doğrudan ölçüm)',
        manualFactor: { n2o: 1, activity: 'Doğrudan Ölçüm (CEMS)', source: 'Baca gazı ölçüm sistemi', version: '-', validYear: rec.measurementDate ? new Date(rec.measurementDate).getFullYear() : '' },
        method: '1. Ölçüm Bazlı (N2O konsantrasyonu x debi x süre)'
      }));
    } else { // massbalance or manual
      const co2eKg = (Number(rec.manualCO2eTon) || 0) * 1000;
      Calc.runAndStore(Object.assign({}, meta, {
        activityValue: co2eKg, activityUnit: 'kg CO2e (manuel)',
        manualFactor: { co2eFactor: 1, activity: 'Manuel/Kütle Dengesi Girişi', source: 'Kullanıcı girişi', version: '-', validYear: rec.year },
        method: (METHODS.find(m=>m.value===rec.calcMethod)||{}).label
      }));
    }
  }

  function openForm(id) {
    const record = id ? Store.getById(KEY, id) : {};
    if (id && record && record.year !== undefined && !Utils.canEditYear(record.year)) {
      Utils.toast(`${record.year} yılı için düzenleme yetkiniz yok.`, 'danger');
      return;
    }
    Utils.openFormModal(`${id ? 'Düzenle' : 'Yeni'}: Proses Emisyonu`, formHtml(record), () => {
      const form = document.getElementById('pe-form');
      toggleConditional(form);
      form.querySelector('[name=processType]').addEventListener('change', () => toggleConditional(form));
      form.querySelector('[name=calcMethod]').addEventListener('change', () => toggleConditional(form));
      form.addEventListener('submit', e => {
        e.preventDefault();
        const data = readForm(form);
        if (data.year !== undefined && !Utils.canEditYear(data.year)) {
          Utils.toast(`${data.year} yılı için veri girişi yetkiniz yok.`, 'danger');
          return;
        }
        try {
          const saved = id ? Store.update(KEY, id, data) : Store.add(KEY, data);
          calculateAndStore(saved);
          Utils.closeFormModal();
          Utils.toast('Proses emisyonu kaydedildi ve hesaplandı.');
          renderTable();
        } catch (err) { Utils.toast(err.message, 'danger'); }
      });
    });
  }

  window.Modules.processemissions = {
    render(container) {
      container.innerHTML = tableHtml();
      renderTable();
      document.getElementById('pe-add-btn').addEventListener('click', () => openForm(null));
      document.getElementById('pe-section').addEventListener('click', e => {
        const editBtn = e.target.closest('.btn-edit');
        const delBtn = e.target.closest('.btn-delete');
        const detailBtn = e.target.closest('.btn-detail');
        const id = (editBtn || delBtn || detailBtn) ? (editBtn||delBtn||detailBtn).closest('tr').dataset.id : null;
        if (detailBtn) {
          const calc = Store.getAll('calculationResults').find(c => c.sourceKey === KEY && String(c.sourceId) === String(id));
          if (calc) Utils.openDetailModal('Proses Emisyonu Hesaplama Detayı', `<pre class="calc-trace">${calc.trace}</pre>`);
        } else if (editBtn) { openForm(id); }
        else if (delBtn) {
          const rec = Store.getById(KEY, id);
          if (rec && rec.year !== undefined && !Utils.canEditYear(rec.year)) {
            Utils.toast(`${rec.year} yılı için silme yetkiniz yok.`, 'danger');
            return;
          }
          if (confirm('Bu kaydı silmek istediğinize emin misiniz?')) {
            Store.remove(KEY, id); Calc.removeForSource(KEY, id);
            Utils.toast('Kayıt silindi.', 'warning'); renderTable();
          }
        }
      });
    },
    runCalc: calculateAndStore,
    refresh: renderTable,
    PROCESS_TYPES, METHODS
  };
})();
