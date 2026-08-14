/*
 * utils.js — shared UI helpers: toasts, modals, formatting, option builders.
 */
(function (global) {

  const MONTHS = Validation.MONTHS;

  function fmt(n, decimals) {
    decimals = decimals === undefined ? 2 : decimals;
    n = Number(n) || 0;
    return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function currentUserRecord() {
    return Store.getAll('users').find(u => u.id === Store.currentAuthUID());
  }

  // Per-user, per-year veri girişi izni. Admin her zaman her yılı
  // düzenleyebilir. Diğer rollerde (özellikle "entry") bir kullanıcı
  // yalnızca admin'in userManagement.js üzerinden o kullanıcıya açıkça
  // tanımladığı yıllarda kayıt ekleyip/düzenleyip/silebilir — allowedYears
  // boş/tanımsızsa VARSAYILAN DAVRANIŞ HİÇBİR YILA İZİN VERMEMEKTİR ("sadece
  // admin'in belirlediği yıllarda veri girişi yapabilsin" — admin bir yıl
  // atamadığı sürece kullanıcı hiçbir yılda düzenleme yapamaz, sadece görür).
  // "report" rolü zaten CSS ile tamamen salt-okunur; burada da tutarlı
  // olsun diye false döner.
  function canEditYear(year) {
    const me = currentUserRecord();
    if (!me) return false;
    if (me.role === 'admin') return true;
    if (me.role === 'report') return false;
    if (year === undefined || year === null) return true; // yıl alanı olmayan (yıl bazlı olmayan) kayıtlar bu kısıtlamaya tabi değil
    return Array.isArray(me.allowedYears) && me.allowedYears.map(Number).includes(Number(year));
  }

  function toast(message, type) {
    type = type || 'success';
    const icon = { success: 'circle-check', danger: 'circle-xmark', warning: 'triangle-exclamation', info: 'circle-info' }[type] || 'circle-info';
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
    el.innerHTML = `<div class="d-flex"><div class="toast-body"><i class="fa-solid fa-${icon} me-2"></i>${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button></div>`;
    document.getElementById('toastHost').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function openFormModal(title, bodyHtml, onShown) {
    document.getElementById('formModalTitle').innerHTML = title;
    document.getElementById('formModalBody').innerHTML = bodyHtml;
    const modalEl = document.getElementById('formModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
    if (onShown) setTimeout(onShown, 30);
    return modal;
  }

  function closeFormModal() {
    const modalEl = document.getElementById('formModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  function openDetailModal(title, bodyHtml) {
    document.getElementById('detailModalBody').innerHTML = bodyHtml;
    document.querySelector('#detailModal .modal-title').innerHTML = `<i class="fa-solid fa-magnifying-glass-chart"></i> ${title}`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('detailModal')).show();
  }

  function facilityOptions(selected) {
    return Store.getAll('facilityData').filter(f => f.active !== false).map(f =>
      `<option value="${f.id}" ${String(f.id) === String(selected) ? 'selected' : ''}>${f.name}</option>`).join('');
  }
  function departmentOptions(selected, facilityId) {
    let list = Store.getAll('departmentData');
    if (facilityId) list = list.filter(d => String(d.facilityId) === String(facilityId));
    return list.map(d => `<option value="${d.id}" ${String(d.id) === String(selected) ? 'selected' : ''}>${d.name}</option>`).join('');
  }
  function processOptions(selected, facilityId) {
    let list = Store.getAll('processData');
    if (facilityId) list = list.filter(p => String(p.facilityId) === String(facilityId));
    return list.map(p => `<option value="${p.id}" ${String(p.id) === String(selected) ? 'selected' : ''}>${p.name}</option>`).join('');
  }
  function productOptions(selected) {
    return Store.getAll('productData').filter(p => p.active !== false).map(p =>
      `<option value="${p.id}" ${String(p.id) === String(selected) ? 'selected' : ''}>${p.name} (${p.code || ''})</option>`).join('');
  }
  function chemicalOptions(selected) {
    return Store.getAll('chemicalData').filter(c => c.active !== false).map(c =>
      `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${c.name}${c.unit ? ' (' + c.unit + ')' : ''}</option>`).join('');
  }
  function monthOptions(selected) {
    return MONTHS.map((m, i) => `<option value="${i+1}" ${Number(selected) === i+1 ? 'selected' : ''}>${m}</option>`).join('');
  }
  // Union of: years formally defined in "Raporlama Yılı", years that already
  // have real data in any collection, and a generous +/- range around the
  // current year — so past/future years are always pickable everywhere
  // (global year selector, report filters, comparison screen) without first
  // requiring a "Raporlama Yılı" record for them.
  function availableYears() {
    const fromReportingYears = Store.getAll('reportingYears').map(y => Number(y.year));
    const dataKeys = ['productionData', 'energyData', 'scope1Data', 'scope3Data', 'processEmissionData', 'fugitiveEmissionData', 'waterSupplyData', 'waterConsumptionData'];
    const fromData = dataKeys.flatMap(k => Store.getAll(k).map(r => Number(r.year)));
    const now = new Date().getFullYear();
    const range = [];
    for (let y = now - 5; y <= now + 3; y++) range.push(y);
    const all = Array.from(new Set([...fromReportingYears, ...fromData, ...range])).filter(y => y && !isNaN(y));
    return all.sort((a, b) => b - a);
  }

  function yearOptions(selected) {
    return availableYears().map(y => `<option value="${y}" ${Number(selected) === Number(y) ? 'selected' : ''}>${y}</option>`).join('');
  }
  function factorOptions(selected, scope) {
    let list = Store.getAll('emissionFactors').filter(f => f.active !== false);
    if (scope) list = list.filter(f => String(f.scope) === String(scope));
    return list.map(f => `<option value="${f.id}" ${String(f.id) === String(selected) ? 'selected' : ''}>${f.activity} - ${f.fuel || ''} (${f.factorUnit || ''}) v${f.version||''}</option>`).join('');
  }
  function gwpSetOptions(selected) {
    const sets = ['AR4', 'AR5', 'AR6'];
    return sets.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
  }
  function dataQualityOptions(selected) {
    return Object.keys(Store.DATA_QUALITY_LABELS).map(k =>
      `<option value="${k}" ${k === selected ? 'selected' : ''}>${Store.DATA_QUALITY_LABELS[k]}</option>`).join('');
  }
  function statusBadge(status) {
    const cls = { draft: 'status-draft', review: 'status-review', checked: 'status-checked', approved: 'status-approved', locked: 'status-locked' }[status] || 'status-draft';
    return `<span class="status-pill ${cls}">${Store.STATUS_LABELS[status] || status}</span>`;
  }
  function dqBadge(dq) {
    return `<span class="dq-badge dq-${dq}">${dq || '-'}</span>`;
  }
  function demoBadge(isDemo) {
    return isDemo ? '<span class="demo-badge">DEMO VERİ</span>' : '';
  }

  function facilityName(id) { const f = Store.getById('facilityData', id); return f ? f.name : '-'; }
  function departmentName(id) { const d = Store.getById('departmentData', id); return d ? d.name : '-'; }
  function processName(id) { const p = Store.getById('processData', id); return p ? p.name : '-'; }
  function productName(id) { const p = Store.getById('productData', id); return p ? p.name : '-'; }
  function chemicalName(id) { const c = Store.getById('chemicalData', id); return c ? c.name : '-'; }

  function initDataTable(selector, opts) {
    if (window.jQuery && jQuery.fn.DataTable) {
      if (jQuery.fn.DataTable.isDataTable(selector)) {
        jQuery(selector).DataTable().destroy();
      }
      return jQuery(selector).DataTable(Object.assign({
        pageLength: 10,
        language: {
          search: 'Ara:', lengthMenu: 'Sayfa başına _MENU_ kayıt', info: 'Toplam _TOTAL_ kayıttan _START_-_END_ arası',
          paginate: { previous: 'Önceki', next: 'Sonraki' }, zeroRecords: 'Kayıt bulunamadı', infoEmpty: 'Kayıt yok'
        }
      }, opts || {}));
    }
  }

  function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(c => `"${String(c === undefined || c === null ? '' : c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function currentYear() {
    return Number(Store.getSettings().selectedYear) || new Date().getFullYear();
  }

  function exportTableToExcel(filename, sheetName, headerRow, dataRows) {
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sayfa1');
    XLSX.writeFile(wb, filename);
  }

  // jsPDF's built-in standard fonts (Helvetica/Times/Courier) only cover the
  // WinAnsi/Latin-1 code page, which is missing Turkish letters (ı, İ, ğ, Ğ,
  // ş, Ş plus their diacritics) — those came out as the wrong glyph (e.g.
  // "ı" → "1", "ş" → "_"). Embedding Open Sans (full Latin Extended-A
  // coverage) fixes this for every PDF export in the app. Registered once
  // per jsPDF instance (jsPDF has no global font cache) and reused for both
  // page text and autoTable's head/body styles.
  function registerPdfFont(doc) {
    const font = window.PDF_FONT_TR;
    if (!font) return null; // pdfFont.js failed to load — falls back to default font
    doc.addFileToVFS(font.fileName, font.base64);
    doc.addFont(font.fileName, font.name, 'normal');
    doc.setFont(font.name, 'normal');
    return font.name;
  }

  function exportTableToPDF(title, headerRow, dataRows, filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fontName = registerPdfFont(doc);
    doc.setFontSize(13);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.text('Oluşturulma: ' + new Date().toLocaleString('tr-TR'), 14, 21);
    doc.autoTable({
      head: [headerRow], body: dataRows, startY: 26, styles: { fontSize: 8, font: fontName || 'helvetica' },
      headStyles: { fillColor: [27, 94, 58], font: fontName || 'helvetica', fontStyle: 'normal' }
    });
    doc.save(filename);
  }

  global.Utils = {
    fmt, toast, el, openFormModal, closeFormModal, openDetailModal,
    facilityOptions, departmentOptions, processOptions, productOptions, chemicalOptions,
    monthOptions, yearOptions, availableYears, factorOptions, gwpSetOptions, dataQualityOptions,
    exportTableToExcel, exportTableToPDF, registerPdfFont,
    statusBadge, dqBadge, demoBadge,
    facilityName, departmentName, processName, productName, chemicalName,
    currentUserRecord, canEditYear,
    initDataTable, downloadJSON, downloadCSV, currentYear
  };
})(window);
