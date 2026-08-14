/*
 * backup.js — section 32: Veri Yedekleme (JSON tam yedekleme / geri yükleme).
 */
(function () {
  window.Modules = window.Modules || {};

  function doBackup() {
    const dump = Store.exportAll();
    Utils.downloadJSON(`GHG_Envanter_Yedek_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`, dump);
    Utils.toast('Yedek dosyası indirildi.');
  }

  function doRestore(file, statusEl) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dump = JSON.parse(e.target.result);
        if (!confirm('Mevcut tüm veriler yedek dosyasındaki verilerle DEĞİŞTİRİLECEK. Devam etmek istiyor musunuz?')) return;
        Store.importAll(dump);
        statusEl.innerHTML = '<span class="text-success">Geri yükleme tamamlandı. Sayfa yenileniyor...</span>';
        Utils.toast('Yedek başarıyla geri yüklendi.');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        statusEl.innerHTML = `<span class="text-danger">Hata: ${err.message}</span>`;
      }
    };
    reader.readAsText(file);
  }

  function doWipe() {
    if (!confirm('TÜM VERİLER Firestore\'daki bulut veritabanından (tüm cihazlar / tüm kullanıcılar için) kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?')) return;
    if (!confirm('Son onay: gerçekten TÜM BULUT VERİTABANINI sıfırlamak istiyor musunuz?')) return;
    Store.wipeAll();
    Utils.toast('Sistem sıfırlandı. Sayfa yenileniyor...', 'warning');
    setTimeout(() => location.reload(), 1000);
  }

  window.Modules.backup = {
    render(container) {
      const stats = Store.KEYS.map(k => ({ key: k, count: Store.getAll(k).length }));
      container.innerHTML = `
        <div class="row">
          <div class="col-md-6">
            <div class="section-card">
              <h5><i class="fa-solid fa-cloud-arrow-up"></i> Tam Yedekleme (JSON)</h5>
              <p class="text-muted small">Tüm sistemi (firma/tesis tanımları, üretim, enerji, Scope 1/2/3, faktörler, GWP, hesaplama sonuçları, revizyon geçmişi) tek bir JSON dosyasına yedekler.</p>
              <button class="btn btn-success" id="bk-backup"><i class="fa-solid fa-download"></i> Yedek Al</button>
            </div>
          </div>
          <div class="col-md-6">
            <div class="section-card">
              <h5><i class="fa-solid fa-cloud-arrow-down"></i> Yedekten Geri Yükle</h5>
              <p class="text-muted small">Daha önce alınmış bir JSON yedek dosyasını yükleyerek sistemi o ana geri döndürür. Mevcut veriler değiştirilir.</p>
              <input type="file" id="bk-restore-file" class="form-control form-control-sm mb-2" accept=".json">
              <div id="bk-restore-status" class="text-xs"></div>
            </div>
          </div>
        </div>
        <div class="section-card">
          <h5><i class="fa-solid fa-database"></i> Veri Tabanı Özeti</h5>
          <div class="row">${stats.map(s => `<div class="col-md-2 col-4 text-center mb-2"><div class="fw-bold">${s.count}</div><div class="text-xs text-muted">${s.key}</div></div>`).join('')}</div>
        </div>
        <div class="section-card border-danger">
          <h5 class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Tehlikeli Bölge</h5>
          <p class="text-muted small">Firestore bulut veritabanındaki tüm verileri kalıcı olarak siler — bu, sadece bu tarayıcıyı değil, bu Firebase projesine bağlı <strong>tüm cihaz ve kullanıcıları</strong> etkiler. Önce yedek almanız önerilir.</p>
          <button class="btn btn-outline-danger btn-sm" id="bk-wipe"><i class="fa-solid fa-bomb"></i> Tüm Sistemi Sıfırla</button>
        </div>`;
      document.getElementById('bk-backup').addEventListener('click', doBackup);
      document.getElementById('bk-restore-file').addEventListener('change', (e) => {
        if (e.target.files[0]) doRestore(e.target.files[0], document.getElementById('bk-restore-status'));
      });
      document.getElementById('bk-wipe').addEventListener('click', doWipe);
    }
  };
})();
