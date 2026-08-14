/*
 * userManagement.js — admin-only screen for managing who can log in.
 * Real per-account roles live in the Firestore `users` collection (doc ID =
 * Firebase Auth UID), NOT the old self-service dropdown in Sistem Ayarları.
 * The very first person ever to log in is auto-promoted to admin (see
 * app.js) — after that, only an admin can create/manage accounts here.
 */
(function () {
  window.Modules = window.Modules || {};
  const KEY = 'users';

  const ROLES = [
    { value: 'admin', label: 'Admin (Tüm Yetkiler)' },
    { value: 'entry', label: 'Veri Giriş Kullanıcısı' },
    { value: 'control', label: 'Kontrol Kullanıcısı' },
    { value: 'report', label: 'Rapor Kullanıcısı (Salt Okunur)' }
  ];
  const roleLabel = v => (ROLES.find(r => r.value === v) || {}).label || v;

  function adminCount() {
    return Store.getAll(KEY).filter(u => u.role === 'admin' && u.active !== false).length;
  }

  // Yalnızca "entry"/"control" rollerinde anlamlı — admin her zaman tüm
  // yıllara erişir, "report" zaten tamamen salt okunur (CSS ile). Kayıtlı
  // hiçbir yıl seçilmemişse (VARSAYILAN) o kullanıcı hiçbir yılda veri
  // girişi yapamaz — bkz. utils.js#canEditYear.
  function yearCheckboxesHtml(selectedYears) {
    const years = Utils.availableYears();
    const sel = new Set((selectedYears || []).map(Number));
    return `<div class="d-flex flex-wrap gap-2">${years.map(y => `
      <div class="form-check form-check-inline m-0">
        <input type="checkbox" class="form-check-input um-year-chk" value="${y}" id="um-year-${y}" ${sel.has(y) ? 'checked' : ''}>
        <label class="form-check-label text-xs" for="um-year-${y}">${y}</label>
      </div>`).join('')}</div>`;
  }

  function readCheckedYears(root) {
    return Array.from(root.querySelectorAll('.um-year-chk:checked')).map(el => Number(el.value));
  }

  function bindRoleTogglesAllowedYears(root) {
    const roleSel = root.querySelector('[name="role"]');
    const wrap = root.querySelector('.um-years-wrap');
    if (!roleSel || !wrap) return;
    const sync = () => { wrap.style.display = (roleSel.value === 'admin' || roleSel.value === 'report') ? 'none' : ''; };
    roleSel.addEventListener('change', sync);
    sync();
  }

  function tableHtml() {
    return `
    <div class="section-card" id="um-section">
      <h5><i class="fa-solid fa-users-gear"></i> Kullanıcı Yönetimi
        <button class="btn btn-sm btn-success ms-auto" id="um-add-btn"><i class="fa-solid fa-user-plus"></i> Yeni Kullanıcı</button>
      </h5>
      <p class="text-muted small">Uygulamada kayıt ol ekranı yoktur — sadece burada eklenen e-postalar giriş yapabilir. Bir kullanıcının erişimini kaldırmak, Firebase Authentication hesabını silmez; sadece bu uygulamaya girişini engeller (istenirse hesap Firebase Console'dan da tamamen silinebilir).</p>
      <div class="table-responsive">
        <table id="um-table" class="table table-sm table-hover w-100">
          <thead><tr><th>E-posta</th><th>Rol</th><th>Veri Girişi Yılları</th><th>Durum</th><th>Eklenme</th><th class="nowrap">İşlem</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;
  }

  function renderTable() {
    const tbody = document.querySelector('#um-table tbody');
    if (!tbody) return;
    const me = Store.currentAuthUID();
    const yearsCell = (u) => {
      if (u.role === 'admin') return '<span class="text-muted small">Tümü</span>';
      if (u.role === 'report') return '<span class="text-muted small">Salt okunur</span>';
      const years = (Array.isArray(u.allowedYears) ? u.allowedYears : []).slice().sort((a, b) => a - b);
      return years.length ? years.join(', ') : '<span class="text-danger small">Yok</span>';
    };
    tbody.innerHTML = Store.getAll(KEY).map(u => `
      <tr data-id="${u.id}">
        <td>${u.email}${u.id === me ? ' <span class="badge text-bg-secondary">siz</span>' : ''}</td>
        <td>${roleLabel(u.role)}</td>
        <td>${yearsCell(u)}</td>
        <td>${u.active !== false ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Devre Dışı</span>'}</td>
        <td>${u.entryDate ? new Date(u.entryDate).toLocaleDateString('tr-TR') : '-'}</td>
        <td class="table-actions nowrap">
          <button class="btn btn-sm btn-outline-primary btn-edit" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-outline-danger btn-revoke" title="Erişimi Kaldır"><i class="fa-solid fa-user-slash"></i></button>
        </td>
      </tr>`).join('');
    Utils.initDataTable('#um-table', { columnDefs: [{ orderable: false, targets: -1 }] });
  }

  function openAddForm() {
    const body = `
      <form id="um-add-form">
        <div class="mb-2"><label class="form-label text-xs form-required">E-posta</label>
          <input type="email" name="email" class="form-control form-control-sm" required></div>
        <div class="mb-2"><label class="form-label text-xs form-required">Şifre (en az 6 karakter)</label>
          <input type="password" name="password" class="form-control form-control-sm" minlength="6" required></div>
        <div class="mb-2"><label class="form-label text-xs form-required">Rol</label>
          <select name="role" class="form-select form-select-sm" required>${ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}</select></div>
        <div class="mb-2 um-years-wrap"><label class="form-label text-xs">Veri Girişi Yapabileceği Yıllar</label>
          ${yearCheckboxesHtml([])}
          <div class="text-xs text-muted mt-1">Hiçbir yıl seçilmezse bu kullanıcı hiçbir yılda veri ekleyip düzenleyemez — yalnızca görüntüler.</div></div>
        <div class="text-danger small" id="um-add-error"></div>
        <div class="text-end mt-2">
          <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Vazgeç</button>
          <button type="submit" class="btn btn-success btn-sm" id="um-add-submit"><i class="fa-solid fa-check"></i> Oluştur</button>
        </div>
      </form>`;
    Utils.openFormModal('Yeni Kullanıcı Ekle', body, () => {
      const formEl = document.getElementById('um-add-form');
      bindRoleTogglesAllowedYears(formEl);
      formEl.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const email = fd.get('email').trim(), password = fd.get('password'), role = fd.get('role');
        const allowedYears = readCheckedYears(formEl);
        const errEl = document.getElementById('um-add-error');
        const btn = document.getElementById('um-add-submit');
        errEl.textContent = '';
        btn.disabled = true;
        Store.createUserAccount(email, password, role).then((created) => {
          if (allowedYears.length && created && created.id) Store.update(KEY, created.id, { allowedYears });
          Utils.closeFormModal();
          Utils.toast(`${email} eklendi.`);
          renderTable();
        }).catch(err => {
          const messages = {
            'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı.',
            'auth/invalid-email': 'Geçersiz e-posta adresi.',
            'auth/weak-password': 'Şifre çok zayıf (en az 6 karakter olmalı).'
          };
          errEl.textContent = messages[err.code] || err.message;
          btn.disabled = false;
        });
      });
    });
  }

  function openEditForm(id) {
    const rec = Store.getById(KEY, id);
    if (!rec) return;
    const body = `
      <form id="um-edit-form">
        <div class="mb-2"><label class="form-label text-xs">E-posta</label>
          <input type="text" class="form-control form-control-sm" value="${rec.email}" disabled></div>
        <div class="mb-2"><label class="form-label text-xs form-required">Rol</label>
          <select name="role" class="form-select form-select-sm">${ROLES.map(r => `<option value="${r.value}" ${r.value === rec.role ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
        <div class="mb-2 um-years-wrap"><label class="form-label text-xs">Veri Girişi Yapabileceği Yıllar</label>
          ${yearCheckboxesHtml(rec.allowedYears)}
          <div class="text-xs text-muted mt-1">Hiçbir yıl seçilmezse bu kullanıcı hiçbir yılda veri ekleyip düzenleyemez — yalnızca görüntüler.</div></div>
        <div class="form-check mb-2"><input type="checkbox" class="form-check-input" name="active" id="um-active" ${rec.active !== false ? 'checked' : ''}>
          <label class="form-check-label text-xs" for="um-active">Aktif (girişe izinli)</label></div>
        <div class="text-end mt-2">
          <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Vazgeç</button>
          <button type="submit" class="btn btn-success btn-sm"><i class="fa-solid fa-check"></i> Kaydet</button>
        </div>
      </form>`;
    Utils.openFormModal(`Düzenle: ${rec.email}`, body, () => {
      const formEl = document.getElementById('um-edit-form');
      bindRoleTogglesAllowedYears(formEl);
      formEl.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newRole = fd.get('role');
        const newActive = fd.get('active') === 'on';
        const allowedYears = readCheckedYears(formEl);
        const losingAdmin = rec.role === 'admin' && (newRole !== 'admin' || !newActive);
        if (losingAdmin && adminCount() <= 1) {
          Utils.toast('Son admin hesabının rolü düşürülemez/devre dışı bırakılamaz — önce başka bir admin atayın.', 'danger');
          return;
        }
        Store.update(KEY, id, { role: newRole, active: newActive, allowedYears });
        Utils.closeFormModal();
        Utils.toast('Kullanıcı güncellendi.');
        renderTable();
      });
    });
  }

  window.Modules.usermanagement = {
    render(container) {
      const me = Store.getAll(KEY).find(u => u.id === Store.currentAuthUID());
      if (!me || me.role !== 'admin') {
        container.innerHTML = `<div class="alert alert-warning"><i class="fa-solid fa-lock"></i> Bu ekranı görüntülemek için admin yetkisi gereklidir.</div>`;
        return;
      }
      container.innerHTML = tableHtml();
      renderTable();
      document.getElementById('um-add-btn').addEventListener('click', openAddForm);
      document.getElementById('um-section').addEventListener('click', e => {
        const editBtn = e.target.closest('.btn-edit');
        const revokeBtn = e.target.closest('.btn-revoke');
        if (editBtn) {
          openEditForm(editBtn.closest('tr').dataset.id);
        } else if (revokeBtn) {
          const id = revokeBtn.closest('tr').dataset.id;
          const rec = Store.getById(KEY, id);
          if (id === Store.currentAuthUID()) { Utils.toast('Kendi erişiminizi kaldıramazsınız.', 'danger'); return; }
          if (rec.role === 'admin' && adminCount() <= 1) { Utils.toast('Son admin hesabının erişimi kaldırılamaz.', 'danger'); return; }
          if (!confirm(`${rec.email} kullanıcısının erişimi kaldırılsın mı?`)) return;
          Store.remove(KEY, id);
          Utils.toast('Erişim kaldırıldı.', 'warning');
          renderTable();
        }
      });
    }
  };
})();
