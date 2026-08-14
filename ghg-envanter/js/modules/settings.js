/*
 * settings.js — section 46: Sistem Ayarları.
 * Roles are no longer self-selected here — they come from the Firestore
 * `users` collection (see userManagement.js / app.js's post-login role
 * lookup). This screen just shows your own assigned role read-only.
 * CSS-based button hiding per role is still just a UX convenience, not a
 * hard security boundary — real enforcement is Firestore Security Rules.
 */
(function () {
  window.Modules = window.Modules || {};

  const ROLES = [
    { value: 'admin', label: 'Admin (Tüm Yetkiler)' },
    { value: 'entry', label: 'Veri Giriş Kullanıcısı (Sadece Veri Girişi)' },
    { value: 'control', label: 'Kontrol Kullanıcısı (Veri Kontrolü ve Onay)' },
    { value: 'report', label: 'Rapor Kullanıcısı (Sadece Raporlama)' }
  ];
  const roleLabel = v => (ROLES.find(r => r.value === v) || {}).label || v || '-';

  // Collections that carry a "year" field directly entered by users.
  const YEAR_COLLECTIONS = [
    { key: 'productionData', label: 'Üretim Verileri' },
    { key: 'energyData', label: 'Enerji Verileri' },
    { key: 'scope1Data', label: 'Scope 1 - Mobil Yakma' },
    { key: 'scope3Data', label: 'Scope 3' },
    { key: 'processEmissionData', label: 'Proses Emisyonları' },
    { key: 'fugitiveEmissionData', label: 'Kaçak Emisyonlar' },
    { key: 'reportingYears', label: 'Raporlama Yılı Tanımı' }
  ];

  function countForYear(year) {
    return YEAR_COLLECTIONS.reduce((sum, c) => sum + Store.getAll(c.key).filter(r => Number(r.year) === Number(year)).length, 0);
  }

  // Renames a year across every data-entry collection in one go, including
  // the calculationResults derived from those records (those carry their own
  // `year` field too, snapshotted at calculation time — if we only renamed
  // the source record, dashboards/reports filtered by year would go stale).
  function bulkChangeYear(fromYear, toYear, selectedKeys) {
    let changed = 0;
    selectedKeys.forEach(key => {
      Store.getAll(key).filter(r => Number(r.year) === Number(fromYear)).forEach(r => {
        Store.update(key, r.id, { year: Number(toYear) });
        changed++;
        Store.getAll('calculationResults')
          .filter(c => c.sourceKey === key && (String(c.sourceId) === String(r.id) || c.sourceId === 'm-' + r.id))
          .forEach(c => Store.update('calculationResults', c.id, { year: Number(toYear) }));
      });
    });
    return changed;
  }

  function applyRole(role) {
    document.body.classList.remove('role-admin', 'role-entry', 'role-control', 'role-report');
    document.body.classList.add('role-' + role);
    const badge = document.getElementById('userRoleBadge');
    if (badge) badge.textContent = roleLabel(role);
  }

  window.Modules.settings = {
    applyRole,
    render(container) {
      const settings = Store.getSettings();
      const connErr = Store.getConnectionError();
      const cloudOk = Store.isReady() && !connErr;
      const me = Store.getAll('users').find(u => u.id === Store.currentAuthUID());
      const isAdmin = me && me.role === 'admin';
      container.innerHTML = `
        <div class="section-card ${cloudOk ? '' : 'border-danger'}">
          <h5><i class="fa-solid fa-cloud"></i> Firestore Bağlantı Durumu</h5>
          ${cloudOk
            ? '<span class="badge text-bg-success">Bağlı</span> <span class="text-muted small">Veriler cevre-87963 Firestore projesine gerçek zamanlı kaydediliyor/senkronize ediliyor.</span>'
            : `<span class="badge text-bg-danger">Bağlantı Sorunu</span> <span class="text-danger small">${connErr || 'Firestore\'a bağlanılamadı.'}</span>`}
        </div>
        <div class="row">
          <div class="col-md-6">
            <div class="section-card">
              <h5><i class="fa-solid fa-user-shield"></i> Hesabınız</h5>
              <p class="mb-1"><span class="text-xs text-muted">E-posta:</span> <strong>${Store.currentAuthEmail() || '-'}</strong></p>
              <p class="mb-2"><span class="text-xs text-muted">Rolünüz:</span> <strong>${roleLabel(me ? me.role : null)}</strong></p>
              ${isAdmin
                ? `<a href="#usermanagement" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-users-gear"></i> Kullanıcı Yönetimi</a>`
                : `<p class="text-muted small">Rolünüzü değiştirmek için bir admin ile görüşün.</p>`}
            </div>
          </div>
          <div class="col-md-6">
            <div class="section-card">
              <h5><i class="fa-solid fa-sliders"></i> Genel Ayarlar</h5>
              <div class="mb-2"><label class="text-xs form-label">Varsayılan GWP Seti</label>
                <select id="set-gwp" class="form-select form-select-sm">${Utils.gwpSetOptions(settings.defaultGwpSet || 'AR5')}</select></div>
              <div class="mb-2"><label class="text-xs form-label">Uygulama Adı</label>
                <input type="text" id="set-appname" class="form-control form-control-sm" value="${settings.appName || 'Kurumsal Sera Gazı Envanteri'}"></div>
              <button class="btn btn-sm btn-primary" id="set-save-general"><i class="fa-solid fa-check"></i> Kaydet</button>
            </div>
          </div>
        </div>
        <div class="section-card">
          <h5><i class="fa-solid fa-calendar-days"></i> Toplu Yıl Değiştirme</h5>
          <p class="text-muted small">Bir yıla yanlışlıkla girilmiş verileri (üretim, enerji, scope 1/3, proses, kaçak emisyon ve ilgili hesaplama sonuçlarını) toplu olarak başka bir yıla taşır. Tek tek kayıt düzenlemeye gerek kalmaz.</p>
          <div class="row g-2 align-items-end mb-2">
            <div class="col-md-3"><label class="text-xs form-label">Kaynak Yıl</label><select id="byc-from" class="form-select form-select-sm">${Utils.yearOptions()}</select></div>
            <div class="col-md-3"><label class="text-xs form-label">Hedef Yıl</label><select id="byc-to" class="form-select form-select-sm">${Utils.yearOptions()}</select></div>
            <div class="col-md-3"><span class="text-xs text-muted" id="byc-count"></span></div>
          </div>
          <div class="row mb-2">
            ${YEAR_COLLECTIONS.map(c => `<div class="col-md-4 col-6 mb-2">
              <div class="form-check">
                <input type="checkbox" class="form-check-input byc-col" id="byc-${c.key}" value="${c.key}" checked>
                <label class="form-check-label text-xs" for="byc-${c.key}">${c.label}</label>
              </div>
            </div>`).join('')}
          </div>
          <button class="btn btn-sm btn-outline-primary" id="byc-run"><i class="fa-solid fa-arrow-right-arrow-left"></i> Yılı Değiştir</button>
        </div>
        <div class="section-card">
          <h5><i class="fa-solid fa-flask-vial"></i> Demo Veri</h5>
          <p class="text-muted small">Uygulama artık açılışta örnek/demo veri oluşturmuyor. Eski bir sürümden kalma demo kayıt olup olmadığını (varsa "DEMO VERİ" etiketiyle) kontrol edip temizlemek için aşağıdaki butonu kullanabilirsiniz.</p>
          <button class="btn btn-outline-warning btn-sm" id="set-clear-demo"><i class="fa-solid fa-broom"></i> Demo Verilerini Kontrol Et ve Temizle</button>
        </div>`;

      const bycUpdateCount = () => {
        const y = document.getElementById('byc-from').value;
        document.getElementById('byc-count').textContent = `${countForYear(y)} kayıt etkilenecek`;
      };
      document.getElementById('byc-from').addEventListener('change', bycUpdateCount);
      bycUpdateCount();
      document.getElementById('byc-run').addEventListener('click', () => {
        const fromYear = document.getElementById('byc-from').value;
        const toYear = document.getElementById('byc-to').value;
        if (fromYear === toYear) { Utils.toast('Kaynak ve hedef yıl aynı.', 'warning'); return; }
        const selectedKeys = Array.from(document.querySelectorAll('.byc-col:checked')).map(el => el.value);
        if (!selectedKeys.length) { Utils.toast('En az bir veri türü seçmelisiniz.', 'warning'); return; }
        const count = YEAR_COLLECTIONS.filter(c => selectedKeys.includes(c.key))
          .reduce((sum, c) => sum + Store.getAll(c.key).filter(r => Number(r.year) === Number(fromYear)).length, 0);
        if (count === 0) { Utils.toast(`${fromYear} yılında seçili veri türlerinde kayıt bulunamadı.`); return; }
        if (!confirm(`${fromYear} yılındaki ${count} kayıt ${toYear} yılına taşınacak. Devam edilsin mi?`)) return;
        const changed = bulkChangeYear(fromYear, toYear, selectedKeys);
        Utils.toast(`${changed} kayıt ${toYear} yılına taşındı.`);
        bycUpdateCount();
      });

      document.getElementById('set-save-general').addEventListener('click', () => {
        Store.saveSettings({ defaultGwpSet: document.getElementById('set-gwp').value, appName: document.getElementById('set-appname').value });
        Utils.toast('Genel ayarlar kaydedildi.');
      });
      document.getElementById('set-clear-demo').addEventListener('click', () => {
        const demoCount = Store.KEYS.reduce((sum, k) => {
          const arr = Store.getAll(k);
          return sum + (Array.isArray(arr) ? arr.filter(r => r.isDemo).length : 0);
        }, 0);
        if (demoCount === 0) {
          Utils.toast('Demo veri bulunamadı — zaten temiz.');
          return;
        }
        if (!confirm(`${demoCount} adet DEMO VERİ kaydı bulundu ve silinecek. Devam edilsin mi?`)) return;
        try {
          Store.purgeDemoData();
          Utils.toast('Demo veriler temizlendi. Sayfa yenileniyor...', 'warning');
          setTimeout(() => location.reload(), 1000);
        } catch (err) {
          Utils.toast('Demo veriler temizlenemedi: ' + err.message, 'danger');
        }
      });
    }
  };
})();
