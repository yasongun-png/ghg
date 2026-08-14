/*
 * storage.js — Firestore-backed data layer (project "cevre-87963").
 *
 * Every collection in KEYS (except systemSettings, which is a per-device UI
 * preference, not shared data) lives in Firestore as a top-level collection,
 * one document per record (doc ID = record.id, a Firestore auto-generated
 * string id). A real-time onSnapshot listener per collection keeps an
 * in-memory `cache` in sync; reads (getAll/getById) are synchronous against
 * that cache. Writes (add/update/remove/setAll) write straight to Firestore
 * AND optimistically patch the local cache immediately, so every module that
 * calls Store.add(...) and then re-reads via Store.getAll(...) in the same
 * tick keeps working exactly as it did with LocalStorage — no module code
 * needed to change for this migration.
 *
 * Approval workflow (draft -> review -> checked -> approved -> locked) and
 * revision history behave the same as before.
 */
(function (global) {
  const KEYS = [
    'companyData', 'facilityData', 'departmentData', 'processData', 'emissionSourceData',
    'reportingYears',
    'productData', 'productionData', 'chemicalData',
    'energyData', 'energyProductionData', 'energySalesData', 'energyPurchaseData',
    'scope1Data', 'scope2Data', 'scope3Data',
    'processEmissionData', 'fugitiveEmissionData',
    'waterSourceData', 'waterSupplyData', 'waterConsumptionPointData', 'waterConsumptionData',
    'emissionFactors', 'gwpFactors',
    'calculationResults', 'validationResults', 'revisionHistory',
    'documents', 'systemSettings', 'users'
  ];

  // Stays on this device only — never synced to Firestore.
  const LOCAL_ONLY_KEYS = ['systemSettings'];
  const SYNCED_KEYS = KEYS.filter(k => !LOCAL_ONLY_KEYS.includes(k));

  const STATUS = {
    DRAFT: 'draft',
    REVIEW: 'review',
    CHECKED: 'checked',
    APPROVED: 'approved',
    LOCKED: 'locked'
  };

  const STATUS_LABELS = {
    draft: 'Taslak',
    review: 'Kontrol Bekliyor',
    checked: 'Kontrol Edildi',
    approved: 'Onaylandı',
    locked: 'Kilitlendi'
  };

  const DATA_QUALITY_LABELS = {
    A: 'A - Ölçülmüş / yüksek kalite',
    B: 'B - Fatura / sayaç',
    C: 'C - Hesaplanmış',
    D: 'D - Tahmini',
    E: 'E - Varsayılan'
  };

  // ---- in-memory cache (mirrors Firestore, kept live by onSnapshot) ----
  const cache = {};
  SYNCED_KEYS.forEach(k => { cache[k] = []; });

  let db = null;
  let ready = false;
  let connectionError = null;
  let currentAuthUser = null;
  const changeListeners = [];

  function onChange(cb) { changeListeners.push(cb); }
  function notifyChange() { changeListeners.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); }

  // Firestore rejects any `undefined` value, including nested inside objects
  // (e.g. revisionHistory's oldValue/newValue are full copies of records that
  // can have undefined fields) — strip recursively, not just top-level.
  function stripUndefined(value) {
    if (Array.isArray(value)) return value.map(stripUndefined);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const out = {};
      Object.keys(value).forEach(k => {
        out[k] = value[k] === undefined ? null : stripUndefined(value[k]);
      });
      return out;
    }
    return value;
  }

  // One-time cleanup: every collection except systemSettings used to live in
  // LocalStorage before the Firestore migration. Leftover browsers can have
  // that old data still sitting there (possibly close to the ~5-10MB quota),
  // which then makes Firestore's own small localStorage writes fail with
  // QuotaExceededError and cascade into repeating internal errors. Clear it.
  function purgeLegacyLocalStorage() {
    KEYS.forEach(k => {
      if (k === 'systemSettings') return;
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  }

  // ---- Firestore bootstrap ----
  // Resolves once a real user is signed in AND every collection has received
  // its first snapshot. Anonymous auth is intentionally NOT used here — this
  // app requires a real email/password account (created by an admin in the
  // Firebase Console, not self-service) so only permitted people can get in.
  // `onNeedsLogin` is called whenever there's no signed-in user, so the caller
  // can show a login screen; the returned promise only resolves after a
  // successful sign-in.
  function initFirebase(onNeedsLogin) {
    purgeLegacyLocalStorage();
    return new Promise((resolve, reject) => {
      try {
        firebase.initializeApp(window.FIREBASE_CONFIG);
        db = firebase.firestore();
        // No enablePersistence(): offline IndexedDB caching isn't needed for
        // this app (real-time onSnapshot sync is what matters), and its
        // multi-tab coordination writes a small amount of LocalStorage that
        // has caused QuotaExceededError -> cascading Firestore internal
        // errors when a browser's LocalStorage for this origin was full.
        firebase.auth().onAuthStateChanged(user => {
          // A leftover anonymous session from before login was required (or
          // anyone calling signInAnonymously() directly) must NOT count as
          // being logged in — only a real email/password account does.
          if (user && user.isAnonymous) {
            firebase.auth().signOut();
            return; // onAuthStateChanged will fire again with user=null
          }
          if (user) {
            currentAuthUser = user;
            attachListeners(resolve, reject);
          } else {
            currentAuthUser = null;
            ready = false;
            if (onNeedsLogin) onNeedsLogin();
          }
        }, err => reject(err));
      } catch (e) {
        reject(e);
      }
    });
  }

  function login(email, password) {
    return firebase.auth().signInWithEmailAndPassword(email, password);
  }

  function logout() {
    return firebase.auth().signOut();
  }

  function currentAuthEmail() {
    return currentAuthUser ? currentAuthUser.email : null;
  }

  function attachListeners(resolve, reject) {
    let pending = SYNCED_KEYS.length;
    let settled = false;
    const markOneReady = () => {
      pending--;
      if (pending === 0 && !settled) { settled = true; ready = true; resolve(); }
    };
    SYNCED_KEYS.forEach(k => {
      let first = true;
      db.collection(k).onSnapshot(snap => {
        cache[k] = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
        if (first) { first = false; markOneReady(); }
        if (ready) notifyChange();
      }, err => {
        console.error('Firestore dinleme hatası:', k, err);
        connectionError = `Firestore okuma hatası (${k}): ${err.message}`;
        if (first) { first = false; markOneReady(); }
      });
    });
  }

  function isReady() { return ready; }
  function getConnectionError() { return connectionError; }

  function init() {
    // kept for compatibility with earlier call sites; real bootstrap is initFirebase()
  }

  function getAll(key) {
    if (LOCAL_ONLY_KEYS.includes(key)) return [];
    return cache[key] || [];
  }

  function setAll(key, arr) {
    if (LOCAL_ONLY_KEYS.includes(key)) return;
    const oldIds = new Set((cache[key] || []).map(r => String(r.id)));
    const newIds = new Set(arr.map(r => String(r.id)));
    cache[key] = arr.slice();
    notifyChange();
    if (!db) return;
    // Firestore batches cap at 500 ops — chunk defensively.
    const toDelete = [...oldIds].filter(id => !newIds.has(id));
    const ops = arr.map(r => ({ type: 'set', id: String(r.id), data: stripUndefined(r) }))
      .concat(toDelete.map(id => ({ type: 'delete', id })));
    commitInChunks(key, ops);
  }

  function commitInChunks(key, ops) {
    const chunkSize = 450;
    const chunks = [];
    for (let i = 0; i < ops.length; i += chunkSize) chunks.push(ops.slice(i, i + chunkSize));
    let p = Promise.resolve();
    chunks.forEach(chunk => {
      p = p.then(() => {
        const batch = db.batch();
        chunk.forEach(op => {
          const ref = db.collection(key).doc(op.id);
          if (op.type === 'set') batch.set(ref, op.data);
          else batch.delete(ref);
        });
        return batch.commit();
      });
    });
    p.catch(err => console.error('Firestore toplu yazma hatası', key, err));
  }

  function getById(key, id) {
    return getAll(key).find(r => String(r.id) === String(id)) || null;
  }

  function newId(key) {
    return db ? db.collection(key).doc().id : String(Date.now()) + Math.random().toString(36).slice(2);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function currentUser() {
    if (currentAuthUser && currentAuthUser.email) return currentAuthUser.email;
    const s = getSettings();
    return (s && s.currentUser) || 'admin';
  }

  function currentAuthUID() {
    return currentAuthUser ? currentAuthUser.uid : null;
  }

  function add(key, record, opts) {
    opts = opts || {};
    const id = opts.id || newId(key); // opts.id: e.g. users/{uid} needs a specific doc id, not an auto one
    const rec = Object.assign({
      status: STATUS.DRAFT,
      dataQuality: record.dataQuality || 'C',
      entryDate: nowIso(),
      entryUser: currentUser(),
      isDemo: !!opts.isDemo
    }, record, { id });
    cache[key] = (cache[key] || []).concat([rec]);
    if (db) db.collection(key).doc(id).set(stripUndefined(rec)).catch(err => reportWriteError(key, err));
    logRevision(key, id, null, rec, opts.reason || 'Kayıt oluşturuldu');
    notifyChange();
    return rec;
  }

  function update(key, id, patch, opts) {
    opts = opts || {};
    const arr = getAll(key);
    const idx = arr.findIndex(r => String(r.id) === String(id));
    if (idx === -1) return null;
    const old = Object.assign({}, arr[idx]);
    if (old.status === STATUS.LOCKED && !opts.forceUnlock) {
      if (!opts.revisionReason) {
        throw new Error('Bu kayıt kilitli. Değişiklik için revizyon nedeni gereklidir.');
      }
    }
    const updated = Object.assign({}, old, patch, { id: old.id });
    cache[key] = arr.map(r => String(r.id) === String(id) ? updated : r);
    if (db) db.collection(key).doc(String(id)).set(stripUndefined(updated)).catch(err => reportWriteError(key, err));
    logRevision(key, id, old, updated, opts.revisionReason || opts.reason || 'Kayıt güncellendi');
    notifyChange();
    return updated;
  }

  function remove(key, id) {
    const rec = getAll(key).find(r => String(r.id) === String(id));
    cache[key] = getAll(key).filter(r => String(r.id) !== String(id));
    if (db) db.collection(key).doc(String(id)).delete().catch(err => reportWriteError(key, err));
    if (rec) logRevision(key, id, rec, null, 'Kayıt silindi');
    notifyChange();
  }

  function reportWriteError(key, err) {
    console.error('Firestore yazma hatası', key, err);
    if (global.Utils && global.Utils.toast) {
      global.Utils.toast(`Bulut kaydı başarısız oldu (${key}): ${err.message}`, 'danger');
    }
  }

  function setStatus(key, id, status, opts) {
    return update(key, id, { status: status, statusChangedAt: nowIso(), statusChangedBy: currentUser() }, opts || {});
  }

  // Append-only — never rewrites the whole history collection (that would
  // mean re-writing every past revision to Firestore on every single edit).
  function logRevision(collectionKey, recordId, oldVal, newVal, reason) {
    const id = newId('revisionHistory');
    const entry = {
      id, collection: collectionKey, recordId: recordId,
      oldValue: oldVal, newValue: newVal,
      changeDate: nowIso(), changedBy: currentUser(), reason: reason || ''
    };
    cache.revisionHistory = (cache.revisionHistory || []).concat([entry]);
    if (db) db.collection('revisionHistory').doc(id).set(stripUndefined(entry)).catch(err => reportWriteError('revisionHistory', err));
  }

  function getRevisionsFor(collectionKey, recordId) {
    return getAll('revisionHistory').filter(r => r.collection === collectionKey && String(r.recordId) === String(recordId));
  }

  function addDocument(meta) {
    return add('documents', meta);
  }

  function getSettings() {
    try {
      const v = localStorage.getItem('systemSettings');
      return v ? JSON.parse(v) : {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(patch) {
    const merged = Object.assign({}, getSettings(), patch);
    try {
      localStorage.setItem('systemSettings', JSON.stringify(merged));
    } catch (e) {
      console.error('systemSettings kaydedilemedi', e);
    }
    return merged;
  }

  function exportAll() {
    const dump = { exportedAt: nowIso(), version: 2, data: {} };
    KEYS.forEach(k => { dump.data[k] = LOCAL_ONLY_KEYS.includes(k) ? getSettings() : getAll(k); });
    return dump;
  }

  function importAll(dump) {
    if (!dump || !dump.data) throw new Error('Geçersiz yedek dosyası');
    KEYS.forEach(k => {
      if (dump.data[k] === undefined) return;
      if (LOCAL_ONLY_KEYS.includes(k)) {
        localStorage.setItem(k, JSON.stringify(dump.data[k]));
      } else {
        setAll(k, Array.isArray(dump.data[k]) ? dump.data[k] : []);
      }
    });
  }

  function wipeAll() {
    SYNCED_KEYS.forEach(k => setAll(k, []));
    localStorage.setItem('systemSettings', JSON.stringify({}));
  }

  // Removes every isDemo:true record from every collection, plus any
  // calculationResults derived from them (those aren't flagged isDemo
  // themselves since they're computed, not entered).
  function purgeDemoData() {
    let removedTotal = 0;
    const removedIdsByKey = {};
    SYNCED_KEYS.forEach(k => {
      if (k === 'calculationResults') return;
      const arr = getAll(k);
      const removedIds = arr.filter(r => r.isDemo).map(r => String(r.id));
      if (removedIds.length) {
        removedIdsByKey[k] = removedIds;
        removedTotal += removedIds.length;
        setAll(k, arr.filter(r => !r.isDemo));
      }
    });
    if (removedTotal > 0) {
      const keptCalc = getAll('calculationResults').filter(c => {
        const removedIds = removedIdsByKey[c.sourceKey];
        if (!removedIds) return true;
        const rawId = String(c.sourceId).replace(/^m-/, '');
        return !removedIds.includes(rawId);
      });
      setAll('calculationResults', keptCalc);
    }
    return removedTotal;
  }

  // Creates a new Firebase Auth account (email/password) WITHOUT signing the
  // admin out of their own session — Firebase's client SDK signs in as
  // whichever account you just created, so this uses a throwaway secondary
  // app instance for that call, then tears it down immediately.
  function createUserAccount(email, password, role) {
    const secondary = firebase.initializeApp(window.FIREBASE_CONFIG, 'secondary-' + Date.now());
    return secondary.auth().createUserWithEmailAndPassword(email, password)
      .then(cred => {
        const uid = cred.user.uid;
        return secondary.auth().signOut()
          .then(() => secondary.delete())
          .then(() => add('users', { email, role, active: true }, { id: uid, reason: 'Kullanıcı oluşturuldu' }));
      })
      .catch(err => {
        secondary.delete().catch(() => {});
        throw err;
      });
  }

  global.Store = {
    KEYS, STATUS, STATUS_LABELS, DATA_QUALITY_LABELS,
    init, initFirebase, isReady, getConnectionError, onChange,
    login, logout, currentAuthEmail, currentAuthUID, createUserAccount,
    getAll, setAll, getById, add, update, remove, setStatus,
    logRevision, getRevisionsFor, addDocument,
    getSettings, saveSettings,
    exportAll, importAll, wipeAll, purgeDemoData,
    nowIso, currentUser,
    isStorageAvailable: () => true
  };
})(window);
