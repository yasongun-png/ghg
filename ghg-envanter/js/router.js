/*
 * router.js — simple hash router mapping #route to Modules[route].render().
 */
(function (global) {
  const PAGE_TITLES = {
    dashboard: 'Dashboard', corporate: 'Kurumsal Tanımlar', reportingyear: 'Raporlama Yılı',
    production: 'Üretim Bilgileri', energy: 'Enerji Verileri', water: 'Su Verileri', scope1: 'Scope 1', scope2: 'Scope 2',
    scope3: 'Scope 3', processemissions: 'Proses Emisyonları', fugitive: 'Kaçak Emisyonlar',
    seos: 'SEÖS N₂O Doğrulama',
    factors: 'Emisyon Faktörleri', gwp: 'GWP Yönetimi', calculations: 'Hesaplamalar',
    dataquality: 'Veri Kalitesi', controls: 'Kontrol ve Uyarılar', reports: 'Raporlar',
    excel: 'Excel İşlemleri', backup: 'Veri Yedekleme', usermanagement: 'Kullanıcı Yönetimi',
    settings: 'Sistem Ayarları'
  };

  function currentRoute() {
    const hash = (location.hash || '#dashboard').replace('#', '');
    return PAGE_TITLES[hash] ? hash : 'dashboard';
  }

  function render() {
    const route = currentRoute();
    const container = document.getElementById('viewContainer');
    document.getElementById('pageTitle').textContent = PAGE_TITLES[route];
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === route));

    const mod = window.Modules && window.Modules[route];
    if (mod && mod.render) {
      try {
        mod.render(container);
      } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="alert alert-danger">Ekran yüklenirken hata oluştu: ${err.message}</div>`;
      }
    } else {
      container.innerHTML = `<div class="alert alert-warning">Bu modül henüz yüklenmedi.</div>`;
    }

    // collapse sidebar on mobile after navigation
    if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('mobile-open');
  }

  global.Router = { render, currentRoute };
  window.addEventListener('hashchange', render);
})(window);
