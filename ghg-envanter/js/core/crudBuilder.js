/*
 * crudBuilder.js — generic CRUD section builder for simple master-data
 * entities (company, facility, department, process, product, ...).
 * Renders a card with an "Ekle" button + a searchable/sortable DataTable,
 * and a modal form built from a field spec. Kept generic so modules only
 * describe *what* the entity looks like, not how CRUD wiring works.
 */
(function (global) {

  function fieldInputHtml(f, value) {
    if (f.type === 'repeater') return repeaterFieldHtml(f, Array.isArray(value) && value.length ? value : [{}]);
    const val = value === undefined || value === null ? (f.default !== undefined ? f.default : '') : value;
    const req = f.required ? 'required' : '';
    const reqStar = f.required ? 'form-required' : '';
    let input = '';
    if (f.type === 'select') {
      const opts = typeof f.options === 'function' ? f.options(val) : (f.options || []);
      const optHtml = Array.isArray(opts)
        ? opts.map(o => `<option value="${o.value}" ${String(o.value) === String(val) ? 'selected' : ''}>${o.label}</option>`).join('')
        : opts;
      input = `<select class="form-select form-select-sm" name="${f.name}" ${req}><option value="">Seçiniz...</option>${optHtml}</select>`;
    } else if (f.type === 'checkbox') {
      input = `<div class="form-check mt-1"><input type="checkbox" class="form-check-input" name="${f.name}" ${val ? 'checked' : ''}></div>`;
    } else if (f.type === 'textarea') {
      input = `<textarea class="form-control form-control-sm" name="${f.name}" rows="2" ${req}>${val || ''}</textarea>`;
    } else {
      const type = f.type || 'text';
      const step = f.step ? `step="${f.step}"` : (type === 'number' ? 'step="any"' : '');
      input = `<input type="${type}" class="form-control form-control-sm" name="${f.name}" value="${val === undefined ? '' : val}" ${req} ${step}>`;
    }
    return `<div class="col-md-${f.colSize || 6} mb-2">
      <label class="form-label text-xs ${reqStar} mb-1">${f.label}</label>
      ${input}
    </div>`;
  }

  // --- Repeater fields: N sub-rows of {subFields}, e.g. "birden fazla
  // kimyasal seçilebilecek" — a production record needs an arbitrary-length
  // list of {kimyasal, miktar} pairs, not a single value. Read via
  // data-sub/data-repeater-field markers (not `name`, which would collide
  // across rows), so this stays independent from the plain-field code path.
  function repeaterSubInputHtml(sf, value) {
    const val = value === undefined || value === null ? (sf.default !== undefined ? sf.default : '') : value;
    if (sf.type === 'select') {
      const opts = typeof sf.options === 'function' ? sf.options(val) : (sf.options || []);
      const optHtml = Array.isArray(opts)
        ? opts.map(o => `<option value="${o.value}" ${String(o.value) === String(val) ? 'selected' : ''}>${o.label}</option>`).join('')
        : opts;
      return `<select class="form-select form-select-sm" data-sub="${sf.name}"><option value="">Seçiniz...</option>${optHtml}</select>`;
    }
    const type = sf.type || 'text';
    const step = type === 'number' ? 'step="any"' : '';
    return `<input type="${type}" class="form-control form-control-sm" data-sub="${sf.name}" value="${val === undefined ? '' : val}" placeholder="${sf.label || ''}" ${step}>`;
  }

  function repeaterRowHtml(f, rowData) {
    rowData = rowData || {};
    const cells = f.subFields.map(sf => `<div class="col-md-${sf.colSize || 4}">${repeaterSubInputHtml(sf, rowData[sf.name])}</div>`).join('');
    return `<div class="row g-1 mb-1 align-items-center repeater-row">${cells}
      <div class="col-md-auto"><button type="button" class="btn btn-sm btn-outline-danger repeater-remove-row" title="Satırı Kaldır"><i class="fa-solid fa-trash"></i></button></div>
    </div>`;
  }

  function repeaterFieldHtml(f, rows) {
    return `<div class="col-md-${f.colSize || 12} mb-2">
      <label class="form-label text-xs mb-1">${f.label}</label>
      <div class="repeater-container" data-repeater-field="${f.name}">
        <div class="repeater-rows">${rows.map(r => repeaterRowHtml(f, r)).join('')}</div>
        <button type="button" class="btn btn-sm btn-outline-secondary repeater-add-row"><i class="fa-solid fa-plus"></i> ${f.addLabel || 'Satır Ekle'}</button>
      </div>
    </div>`;
  }

  function bindRepeaters(formEl, fields) {
    formEl.querySelectorAll('.repeater-container').forEach(container => {
      const f = fields.find(x => x.name === container.dataset.repeaterField);
      if (!f) return;
      container.querySelector('.repeater-add-row').addEventListener('click', () => {
        container.querySelector('.repeater-rows').insertAdjacentHTML('beforeend', repeaterRowHtml(f, {}));
      });
      container.addEventListener('click', (e) => {
        const rm = e.target.closest('.repeater-remove-row');
        if (!rm) return;
        const rowsEl = container.querySelector('.repeater-rows');
        if (rowsEl.children.length > 1) rm.closest('.repeater-row').remove();
        else rm.closest('.repeater-row').querySelectorAll('[data-sub]').forEach(el => { el.value = ''; }); // keep at least one row
      });
    });
  }

  function readForm(fields, formEl) {
    const out = {};
    fields.forEach(f => {
      if (f.type === 'repeater') {
        const container = formEl.querySelector(`.repeater-container[data-repeater-field="${f.name}"]`);
        const rows = container ? Array.from(container.querySelectorAll('.repeater-row')) : [];
        out[f.name] = rows.map(row => {
          const obj = {};
          f.subFields.forEach(sf => {
            const el = row.querySelector(`[data-sub="${sf.name}"]`);
            if (!el) return;
            obj[sf.name] = sf.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
          });
          return obj;
        }).filter(obj => Object.values(obj).some(v => v !== null && v !== '' && v !== undefined));
        return;
      }
      const el = formEl.querySelector(`[name="${f.name}"]`);
      if (!el) return;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = el.value;
    });
    return out;
  }

  function CrudBuilder(opts) {
    const key = opts.key;
    const tableId = `crud-tbl-${key}`;
    const sectionId = `crud-sec-${key}`;

    function rows() {
      let arr = Store.getAll(key);
      if (opts.filter) arr = arr.filter(opts.filter);
      return arr;
    }

    // Per-column filter row: a dropdown of the column's own distinct values
    // when there aren't too many (facility, type, status, quality — anything
    // categorical), otherwise a free-text substring box (amounts, invoice
    // numbers, ...). Built once into <thead> so it survives renderRows()
    // refreshes untouched (only <tbody> gets replaced on refresh).
    function stripTags(html) { return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }

    function filterRowHtml() {
      const allRows = rows();
      const cells = opts.columns.map((c, idx) => {
        const values = new Set();
        allRows.forEach(r => {
          const raw = c.render ? c.render(r) : (r[c.field] !== undefined && r[c.field] !== null ? r[c.field] : '');
          const text = stripTags(raw);
          if (text) values.add(text);
        });
        if (values.size === 0) return '<td></td>';
        if (values.size <= 25) {
          const sorted = Array.from(values).sort();
          return `<td><select class="form-select form-select-sm crud-col-filter" data-col="${idx}">
            <option value="">Tümü</option>
            ${sorted.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('')}
          </select></td>`;
        }
        return `<td><input type="text" class="form-control form-control-sm crud-col-filter-text" data-col="${idx}" placeholder="Filtrele..."></td>`;
      }).join('');
      return `<tr class="crud-filter-row">${cells}<td></td></tr>`;
    }

    // Yalnızca "year" alanı taşıyan (yıl bazlı) tablolarda, admin olmayan/
    // rapor olmayan kullanıcıya hangi yıllarda düzenleme yapabildiğini
    // gösterir — "diğerlerini sadece görsün" isteğinin UI tarafı: kullanıcı
    // neden bazı satırlarda Düzenle/Sil göremediğini anlar.
    function yearPermissionBannerHtml() {
      const me = Utils.currentUserRecord();
      if (!me || me.role === 'admin' || me.role === 'report') return '';
      if (!opts.fields.some(f => f.name === 'year')) return '';
      const years = (Array.isArray(me.allowedYears) ? me.allowedYears : []).slice().sort((a, b) => a - b);
      if (!years.length) {
        return `<div class="alert alert-warning small mb-2"><i class="fa-solid fa-lock"></i> Şu anda hiçbir yıl için veri girişi yetkiniz yok — kayıtları görüntüleyebilirsiniz ama ekleyip düzenleyemezsiniz. Bir yöneticiyle görüşün.</div>`;
      }
      return `<div class="alert alert-light border small mb-2"><i class="fa-solid fa-circle-info text-primary"></i> Yalnızca şu yıllarda veri girişi yapabilirsiniz: <strong>${years.join(', ')}</strong>. Diğer yıllardaki kayıtları yalnızca görüntüleyebilirsiniz.</div>`;
    }

    function html() {
      const thead = opts.columns.map(c => `<th>${c.label}</th>`).join('') + '<th class="nowrap">İşlem</th>';
      return `
      <div class="section-card" id="${sectionId}">
        <h5><i class="fa-solid ${opts.icon || 'fa-table'}"></i> ${opts.title}
          <button class="btn btn-sm btn-outline-secondary ms-auto btn-clear-filters" title="Filtreleri Temizle"><i class="fa-solid fa-filter-circle-xmark"></i></button>
          <button class="btn btn-sm btn-success btn-add"><i class="fa-solid fa-plus"></i> Yeni Ekle</button>
        </h5>
        ${yearPermissionBannerHtml()}
        <div class="table-responsive">
          <table id="${tableId}" class="table table-sm table-hover align-middle w-100">
            <thead><tr>${thead}</tr>${filterRowHtml()}</thead>
            <tbody></tbody>
          </table>
        </div>
      </div>`;
    }

    function renderRows() {
      const tbody = document.querySelector(`#${tableId} tbody`);
      if (!tbody) return;
      // DataTables' .destroy() reverts the table to whatever HTML existed at
      // the time it was first initialized — so it MUST run before we write
      // fresh rows, never after, or the fresh data gets discarded and the
      // table silently shows stale content on every refresh() after the first.
      // Also preserve the current page/search/order across a refresh — without
      // this, every single-row edit (e.g. a quick inline toggle) snaps a long,
      // paginated list back to page 1, which is disorienting mid-review.
      let savedState = null;
      if (window.jQuery && jQuery.fn.DataTable && jQuery.fn.DataTable.isDataTable(`#${tableId}`)) {
        const dt = jQuery(`#${tableId}`).DataTable();
        savedState = { page: dt.page(), search: dt.search(), order: dt.order(), columnSearches: dt.columns().search().toArray() };
        dt.destroy();
      }
      tbody.innerHTML = rows().map(r => {
        const tds = opts.columns.map(c => `<td>${c.render ? c.render(r) : (r[c.field] !== undefined && r[c.field] !== null ? r[c.field] : '-')}</td>`).join('');
        const detailBtn = opts.showCalcDetail ? `<button class="btn btn-sm btn-outline-info btn-detail" title="Hesaplama Detayı"><i class="fa-solid fa-magnifying-glass-chart"></i></button>` : '';
        // Yıl bazlı düzenleme izni (Utils.canEditYear) — kaydın "year" alanı
        // varsa VE kullanıcının o yıl için izni yoksa, satır yalnızca
        // görüntülenebilir: Düzenle/Sil düğmeleri yerine kilit ikonu gösterilir.
        const yearLocked = r.year !== undefined && !Utils.canEditYear(r.year);
        const editDeleteHtml = yearLocked
          ? `<span class="text-muted" title="${r.year} yılı için düzenleme yetkiniz yok"><i class="fa-solid fa-lock"></i></span>`
          : `<button class="btn btn-sm btn-outline-primary btn-edit" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
             <button class="btn btn-sm btn-outline-danger btn-delete" title="Sil"><i class="fa-solid fa-trash"></i></button>`;
        return `<tr data-id="${r.id}">${tds}<td class="table-actions nowrap">
          ${detailBtn}
          ${editDeleteHtml}
        </td></tr>`;
      }).join('');
      if (window.jQuery && jQuery.fn.DataTable) {
        // orderCellsTop: the filter row is the SECOND row in <thead> — without
        // this, DataTables binds its sort-click handlers to that row instead
        // of the real header (the standard fix for header+filter-row tables).
        const dt = Utils.initDataTable(`#${tableId}`, { orderCellsTop: true, columnDefs: [{ orderable: false, targets: -1 }] });
        if (savedState && dt) {
          if (savedState.columnSearches) {
            // regex:true here matters — a saved term like "^Filtre Test A$"
            // (from the dropdown's exact-match filter) is a regex pattern;
            // without this flag DataTables treats it as a literal string
            // (including the ^ and $ characters) and it matches nothing.
            dt.columns().every(function (idx) {
              if (savedState.columnSearches[idx]) this.search(savedState.columnSearches[idx], true, false);
            });
          }
          if (savedState.search) dt.search(savedState.search);
          if (savedState.order && savedState.order.length) dt.order(savedState.order);
          dt.draw(false); // false = keep current paging instead of resetting to page 0
          const pageInfo = dt.page.info();
          if (savedState.page < pageInfo.pages) dt.page(savedState.page).draw(false);
        }
      }
    }

    function openForm(id) {
      const record = id ? Store.getById(key, id) : {};
      // Defense in depth — the row's Düzenle button is already hidden for a
      // year the user can't edit, but re-check here too (e.g. if the admin
      // changed the user's allowed years in another tab mid-session).
      if (id && record && record.year !== undefined && !Utils.canEditYear(record.year)) {
        Utils.toast(`${record.year} yılı için düzenleme yetkiniz yok.`, 'danger');
        return;
      }
      const fieldsHtml = opts.fields.map(f => fieldInputHtml(f, record ? record[f.name] : undefined)).join('');
      const bodyHtml = `
        <form id="crudForm-${key}">
          <div class="row">${fieldsHtml}</div>
          <div class="text-end mt-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Vazgeç</button>
            <button type="submit" class="btn btn-success btn-sm"><i class="fa-solid fa-check"></i> Kaydet</button>
          </div>
        </form>`;
      Utils.openFormModal(`${id ? 'Düzenle' : 'Yeni'}: ${opts.title}`, bodyHtml, () => {
        const formEl = document.getElementById(`crudForm-${key}`);
        bindRepeaters(formEl, opts.fields);
        // Force select/checkbox values explicitly — many options() callbacks
        // don't forward the "selected" arg, so baked-in `selected` attributes
        // in the generated <option> markup can't be relied on.
        opts.fields.forEach(f => {
          const el = formEl.querySelector(`[name="${f.name}"]`);
          if (!el) return;
          const hasRecordValue = record && record[f.name] !== undefined && record[f.name] !== null && record[f.name] !== '';
          const val = hasRecordValue ? record[f.name] : (f.default !== undefined ? f.default : undefined);
          if (f.type === 'checkbox') { el.checked = !!val; }
          else if (f.type === 'select' && val !== undefined) { el.value = val; }
        });
        formEl.addEventListener('submit', e => {
          e.preventDefault();
          const data = readForm(opts.fields, formEl);
          if (data.year !== undefined && !Utils.canEditYear(data.year)) {
            Utils.toast(`${data.year} yılı için veri girişi yetkiniz yok. Yalnızca yöneticinin size tanımladığı yıllarda kayıt ekleyip düzenleyebilirsiniz.`, 'danger');
            return;
          }
          if (opts.beforeSave) Object.assign(data, opts.beforeSave(data, record) || {});
          try {
            let saved;
            if (id) saved = Store.update(key, id, data);
            else saved = Store.add(key, data);
            if (opts.afterSave) opts.afterSave(saved, !id);
            Utils.closeFormModal();
            Utils.toast('Kayıt kaydedildi.');
            renderRows();
            if (opts.afterChange) opts.afterChange();
          } catch (err) {
            Utils.toast(err.message, 'danger');
          }
        });
      });
    }

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function bindFilterRow() {
      const section = document.getElementById(sectionId);
      if (!section) return;
      section.querySelectorAll('.crud-col-filter').forEach(sel => {
        sel.addEventListener('change', () => {
          const dt = jQuery(`#${tableId}`).DataTable();
          const val = sel.value;
          dt.column(Number(sel.dataset.col)).search(val ? `^${escapeRegex(val)}$` : '', true, false).draw();
        });
      });
      section.querySelectorAll('.crud-col-filter-text').forEach(inp => {
        inp.addEventListener('input', () => {
          const dt = jQuery(`#${tableId}`).DataTable();
          dt.column(Number(inp.dataset.col)).search(inp.value, false, true).draw();
        });
      });
      const clearBtn = section.querySelector('.btn-clear-filters');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        const dt = jQuery(`#${tableId}`).DataTable();
        section.querySelectorAll('.crud-col-filter').forEach(sel => { sel.value = ''; });
        section.querySelectorAll('.crud-col-filter-text').forEach(inp => { inp.value = ''; });
        dt.columns().search('');
        dt.search('').draw();
      });
    }

    function bindEvents() {
      const section = document.getElementById(sectionId);
      if (!section) return;
      section.querySelector('.btn-add').addEventListener('click', () => openForm(null));
      if (window.jQuery && jQuery.fn.DataTable) bindFilterRow();
      section.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit');
        const delBtn = e.target.closest('.btn-delete');
        const detailBtn = e.target.closest('.btn-detail');
        if (detailBtn) {
          const id = detailBtn.closest('tr').dataset.id;
          const calc = Store.getAll('calculationResults').find(c => c.sourceKey === key && String(c.sourceId) === String(id));
          if (calc) {
            Utils.openDetailModal(opts.title, `<pre class="calc-trace">${calc.trace}</pre>
              <table class="table table-sm mt-2">
                <tr><th>Yöntem</th><td>${calc.method || '-'}</td></tr>
                <tr><th>Faktör Kaynağı</th><td>${calc.factorSnapshot ? (calc.factorSnapshot.source + ' (v'+calc.factorSnapshot.version+', '+calc.factorSnapshot.validYear+')') : '-'}</td></tr>
                <tr><th>GWP Seti</th><td>${calc.gwpSet || '-'}</td></tr>
                <tr><th>Hesaplama Tarihi</th><td>${new Date(calc.calculatedAt).toLocaleString('tr-TR')}</td></tr>
              </table>`);
          } else {
            Utils.toast('Bu kayıt için henüz hesaplama sonucu yok.', 'warning');
          }
        } else if (editBtn) {
          const id = editBtn.closest('tr').dataset.id;
          openForm(id);
        } else if (delBtn) {
          const id = delBtn.closest('tr').dataset.id;
          const rec = Store.getById(key, id);
          if (rec && rec.year !== undefined && !Utils.canEditYear(rec.year)) {
            Utils.toast(`${rec.year} yılı için silme yetkiniz yok.`, 'danger');
            return;
          }
          if (confirm('Bu kaydı silmek istediğinize emin misiniz?')) {
            Store.remove(key, id);
            if (opts.afterDelete) opts.afterDelete(id);
            Utils.toast('Kayıt silindi.', 'warning');
            renderRows();
            if (opts.afterChange) opts.afterChange();
          }
        }
      });
    }

    return {
      html,
      mount() { renderRows(); bindEvents(); },
      refresh: renderRows
    };
  }

  global.CrudBuilder = CrudBuilder;
})(window);
