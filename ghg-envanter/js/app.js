/*
 * app.js — application bootstrap: requires a real signed-in Firebase user
 * (no self-service sign-up — accounts are created by an admin in the Firebase
 * Console, on purpose, so not just anyone can get in), connects to Firestore,
 * seeds core reference data, wires the global year selector / sidebar / role,
 * then hands off to the router.
 */
(function () {
  function refreshYearSelector() {
    const sel = document.getElementById('globalYearSelect');
    const years = Utils.availableYears(); // past/future years too, not just ones with a "Raporlama Yılı" record
    const current = Utils.currentYear();
    sel.innerHTML = years.map(y => `<option value="${y}" ${Number(y) === current ? 'selected' : ''}>${y}</option>`).join('');
    if (!years.includes(current)) {
      Store.saveSettings({ selectedYear: years[0] });
      sel.value = years[0];
    }
  }

  function showFatalError(message) {
    document.getElementById('loginScreen').style.display = 'none';
    const overlay = document.getElementById('cloudLoadingOverlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `<div class="cloud-loading-box" style="max-width:520px">
      <i class="fa-solid fa-triangle-exclamation" style="color:#ffd43b"></i>
      <div class="cloud-loading-text">Firestore'a bağlanılamadı</div>
      <div style="font-size:.85rem; margin-top:.6rem; opacity:.9; white-space:pre-wrap;">${message}</div>
    </div>`;
  }

  function showLoginScreen() {
    document.getElementById('cloudLoadingOverlay').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
  }

  function wireLoginForm() {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      const btn = document.getElementById('login-submit');
      errEl.textContent = '';
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Giriş yapılıyor...';
      Store.login(email, password).then(() => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('cloudLoadingOverlay').style.display = 'flex';
      }).catch(err => {
        const messages = {
          'auth/invalid-credential': 'E-posta veya şifre hatalı.',
          'auth/invalid-email': 'Geçersiz e-posta adresi.',
          'auth/user-not-found': 'Bu e-posta ile kayıtlı bir kullanıcı yok.',
          'auth/wrong-password': 'Şifre hatalı.',
          'auth/too-many-requests': 'Çok fazla başarısız deneme. Lütfen bir süre sonra tekrar deneyin.',
          'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
          'auth/operation-not-allowed': 'E-posta/şifre girişi Firebase projesinde henüz etkinleştirilmemiş (Authentication > Sign-in method > Email/Password).'
        };
        errEl.textContent = messages[err.code] || ('Giriş başarısız: ' + err.message);
      }).finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Giriş Yap';
      });
    });
  }

  // Real per-account role lookup (Firestore `users/{uid}`), replacing the old
  // self-service dropdown. The very first person who ever logs in has no
  // `users` collection to check against yet, so they're auto-promoted to
  // admin — after that, only an admin can add more accounts (see
  // userManagement.js). Anyone whose account was removed/deactivated there
  // gets signed back out immediately.
  function resolveMyAccess() {
    const uid = Store.currentAuthUID();
    const allUsers = Store.getAll('users');
    let me = allUsers.find(u => u.id === uid);
    if (!me) {
      if (allUsers.length === 0) {
        me = Store.add('users', { email: Store.currentAuthEmail(), role: 'admin', active: true },
          { id: uid, reason: 'İlk kullanıcı otomatik admin yapıldı' });
      } else {
        return { ok: false, reason: 'Hesabınız bu uygulamaya yetkilendirilmemiş.\nBir yöneticinin sizi Kullanıcı Yönetimi ekranından eklemesi gerekiyor.' };
      }
    }
    if (me.active === false) {
      return { ok: false, reason: 'Hesabınız devre dışı bırakılmış.\nBir yöneticiyle görüşün.' };
    }
    return { ok: true, role: me.role };
  }

  function wireUiChrome(role) {
    document.getElementById('globalYearSelect').addEventListener('change', (e) => {
      Store.saveSettings({ selectedYear: Number(e.target.value) });
      Router.render();
    });

    window.Modules.settings.applyRole(role || 'report');

    const emailEl = document.getElementById('loggedInEmail');
    if (emailEl) emailEl.textContent = Store.currentAuthEmail() || '';

    document.getElementById('logoutBtn').addEventListener('click', () => {
      if (!confirm('Çıkış yapmak istediğinize emin misiniz?')) return;
      Store.logout().then(() => location.reload());
    });

    document.getElementById('sidebarToggle').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (window.innerWidth <= 900) sidebar.classList.toggle('mobile-open');
      else sidebar.classList.toggle('collapsed');
    });

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(a => {
      a.addEventListener('click', () => { if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('mobile-open'); });
    });
  }

  let renderQueued = false;
  function queueRerender() {
    // Firestore can fire several snapshots in quick succession (e.g. a
    // multi-collection setAll); coalesce into a single re-render per tick.
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      // If an admin deactivated/removed this account while it was mid-session,
      // kick them out immediately rather than letting them keep working.
      const me = Store.getAll('users').find(u => u.id === Store.currentAuthUID());
      if (!me || me.active === false) {
        Store.logout().then(() => showFatalError('Erişiminiz bir yönetici tarafından kaldırıldı.'));
        return;
      }
      window.Modules.settings.applyRole(me.role || 'report');

      // A full Router.render() tears down and rebuilds the whole view —
      // resetting scroll position, table pagination/search, and active tabs.
      // Most of these sync events are just the echo of THIS tab's own write
      // (Firestore's listener fires again once the server confirms it), so
      // prefer each module's own lightweight refresh() when it has one —
      // it already knows how to update in place without losing that state.
      // Scroll position is restored regardless, as a safety net either way.
      const scrollY = window.scrollY;
      const route = Router.currentRoute();
      const mod = window.Modules[route];
      if (mod && typeof mod.refresh === 'function') {
        mod.refresh();
      } else {
        Router.render();
      }
      window.scrollTo(0, scrollY);
      refreshYearSelector();
    }, 150);
  }

  // One-time correction: Scope 2 used to be calculated from total electricity
  // *consumption*, which is wrong for a site that also generates its own
  // electricity (self-generated energy was never "purchased" from anyone).
  // Scope 2 now comes only from Enerji Satın Alma Bilgileri (purchases); this
  // purges any Scope 2 result still hanging around from the old, incorrect
  // consumption-based calculation. Safe to run every load — a no-op once
  // there's nothing left to clean.
  function purgeLegacyConsumptionScope2() {
    const stale = Store.getAll('calculationResults').filter(c =>
      c.sourceKey === 'energyData' && (c.module === 'scope2-location' || c.module === 'scope2-market'));
    stale.forEach(c => Store.remove('calculationResults', c.id));
    return stale.length;
  }

  function init() {
    Store.init();
    wireLoginForm();
    Store.initFirebase(showLoginScreen).then(() => {
      seedGwp();
      seedEmissionFactors();
      Store.purgeDemoData();
      purgeLegacyConsumptionScope2();

      const access = resolveMyAccess();
      if (!access.ok) {
        Store.logout().then(() => showFatalError(access.reason));
        return;
      }

      wireUiChrome(access.role);
      refreshYearSelector();

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('cloudLoadingOverlay').style.display = 'none';
      document.getElementById('app-shell').classList.add('ready');

      if (!location.hash) location.hash = '#dashboard';
      Router.render();

      // Live updates: re-render the current view when another device/tab changes data.
      Store.onChange(queueRerender);
    }).catch(err => {
      console.error('Firebase bağlantı hatası:', err);
      showFatalError((err && err.message) || String(err));
    });
  }

  window.App = { refreshYearSelector };
  document.addEventListener('DOMContentLoaded', init);
})();
