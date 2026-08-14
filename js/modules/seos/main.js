/*
 * seos/main.js — module entry point. Wires the upload → mapping → results
 * flow together and exposes the single window.Modules.seos = {render,
 * refresh} contract the router/app shell expects from every screen.
 */
(function () {
  window.Modules = window.Modules || {};

  // Bumped whenever the saved result's shape changes (V3 added
  // `sinif`/`prosesSureleri`/ölçülen-ikame split; V4 added independent N₂O/
  // Debi geçerlilik tracking; V5 added the D parameter as a third
  // independent signal + the 8-class sınıf taxonomy) — a dataset saved by
  // an older version of this module would otherwise render fine (no error
  // at save time) but crash on load once the UI/Charts code starts reading
  // fields the old result never had. Rather than chase every such field
  // defensively, we just detect the mismatch up front and ask for a
  // recalculation.
  const SCHEMA_VERSION = 4;

  // schemaVersion alone isn't a reliable signal — during active development
  // the result shape can change more than once while SCHEMA_VERSION stays
  // put, so a dataset saved mid-revision passes the version check yet still
  // crashes the UI on a field that got added later (e.g. prosesSureleri).
  // Check the fields the current UI/Charts code actually dereferences,
  // including V5's D-parameter fields specifically (dGecerliVeriYuzde,
  // nihaiDOrtalama) since those are new enough that a V4 result — which
  // already has prosesSureleri/availability/dailyAgg/monthlyAgg — would
  // otherwise slip past this check and crash on the D columns instead.
  function isCompatibleResult(result) {
    return !!(result && result.prosesSureleri && result.availability &&
      Array.isArray(result.dailyAgg) && Array.isArray(result.monthlyAgg) &&
      typeof result.dGecerliVeriYuzde === 'number' && typeof result.nihaiDOrtalama === 'number');
  }

  function boot(container) {
    const saved = window.Seos.Data.loadDataset();
    let usable = saved && saved.result && saved.schemaVersion === SCHEMA_VERSION && isCompatibleResult(saved.result);
    if (usable) {
      try {
        window.Seos.UI.renderResults(container, saved, { onReset: () => boot(container) });
        return;
      } catch (err) {
        console.error('SEÖS: kayıtlı sonuç render edilemedi, temizleniyor.', err);
        usable = false;
      }
    }
    if (saved && saved.result) {
      // Stale/incompatible dataset from an older or mid-revision app
      // version — its result shape no longer matches what the UI expects.
      // Drop it and start fresh instead of crashing.
      window.Seos.Data.clearDataset();
      Utils.toast('Kayıtlı SEÖS sonucu uygulamanın önceki bir sürümünden kalmış; lütfen dosyayı tekrar yükleyip hesaplayın.', 'warning');
    }
    window.Seos.UI.renderUpload(container, {
      onCalculated: (payload) => {
        payload.schemaVersion = SCHEMA_VERSION;
        const saveInfo = window.Seos.Data.saveDataset(payload);
        if (!saveInfo.ok) {
          Utils.toast('Hesaplama tamamlandı ancak sonuçlar tarayıcı belleğine kaydedilemedi (depolama sınırı) — sayfa yenilenirse kaybolur.', 'danger');
        } else if (saveInfo.droppedRaw) {
          Utils.toast('Veri seti büyük olduğu için ham dakikalık veri kalıcı olarak saklanamadı; özet sonuçlar kaydedildi. Detay için sayfayı yenilemeden önce dışa aktarın.', 'warning');
        } else {
          Utils.toast('Hesaplama tamamlandı ve sonuçlar tarayıcıda kaydedildi.');
        }
        window.Seos.UI.renderResults(container, payload, { onReset: () => boot(container) });
      }
    });
  }

  window.Modules.seos = {
    render(container) { boot(container); },
    // No Firestore-backed live data here — an unrelated sync echo from
    // another module must never blow away an in-progress upload/mapping
    // step or a rendered result, so this is intentionally a no-op.
    refresh() {}
  };
})();
