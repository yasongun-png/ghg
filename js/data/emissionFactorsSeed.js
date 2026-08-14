/*
 * emissionFactorsSeed.js — seeds a starter Emission Factor database (section 16)
 * so the app is usable out of the box. Every row is fully editable/removable from
 * the "Emisyon Faktörleri" screen and every row's description explicitly marks it
 * as a REFERENCE value that must be validated/replaced with the facility's own
 * measured or supplier-specific factor before being relied on for reporting
 * (section 41: no factor may be used without the user seeing its source).
 */
(function () {
  function row(id, scope, category, activity, fuel, unit, factorUnit, gases, source, sourceDocument, version, validYear, gwpSet, note) {
    return Object.assign({
      id, scope, category, activity, fuel, unit, factorUnit,
      source, sourceDocument, version, validYear, gwpSet, country: 'Türkiye / Genel',
      description: 'REFERANS DEĞER — kullanıma almadan önce doğrulayın veya tesise/tedarikçiye özgü faktörle değiştirin. ' + (note || ''),
      active: true, isDemo: false, status: 'approved', dataQuality: 'C',
      entryDate: Store.nowIso(), entryUser: 'system'
    }, gases);
  }

  function seed() {
    if (Store.getAll('emissionFactors').length > 0) return;

    const list = [
      // ---- Scope 1: Sabit Yakma ----
      row(1, 1, 'Sabit Yakma', 'Doğalgaz Yakma', 'Doğalgaz', 'Sm³', 'kg gaz / Sm³',
        { co2: 1.89, ch4: 0.00003, n2o: 0.000003 },
        'IPCC 2006 Guidelines Vol.2 Ch.2 (varsayılan)', 'IPCC 2006 GL V2C2 Table 2.2', '1.0', 2006, 'AR5'),
      row(2, 1, 'Sabit Yakma', 'Fuel-Oil Yakma', 'Fuel-Oil (No.6)', 'kg', 'kg gaz / kg',
        { co2: 3.15, ch4: 0.00001, n2o: 0.0000006 },
        'IPCC 2006 Guidelines Vol.2 Ch.2 (varsayılan)', 'IPCC 2006 GL V2C2 Table 2.2', '1.0', 2006, 'AR5'),
      row(3, 1, 'Sabit Yakma', 'Kömür Yakma', 'Kömür (bitümlü, ort.)', 'kg', 'kg gaz / kg',
        { co2: 2.30, ch4: 0.00001, n2o: 0.0000015 },
        'IPCC 2006 Guidelines Vol.2 Ch.2 (varsayılan)', 'IPCC 2006 GL V2C2 Table 2.2', '1.0', 2006, 'AR5'),
      row(4, 1, 'Sabit Yakma', 'LPG Yakma', 'LPG', 'kg', 'kg gaz / kg',
        { co2: 2.98, ch4: 0.00001, n2o: 0.0000001 },
        'IPCC 2006 Guidelines Vol.2 Ch.2 (varsayılan)', 'IPCC 2006 GL V2C2 Table 2.2', '1.0', 2006, 'AR5'),
      row(5, 1, 'Sabit Yakma', 'Satın Alınan Buhar (dahili kazan)', 'Kızgın Yağ / Buhar', 'kg', 'kgCO2e / kg (doğrudan)',
        { co2eFactor: 0.196 },
        'Tesis içi örnek hesaplama', 'Yerel referans', '1.0', 2024, 'AR5', 'Kazan yakıt karışımına göre güncellenmelidir.'),

      // ---- Scope 1: Mobil Yakma ----
      row(6, 1, 'Mobil Yakma', 'Motorin (Araç)', 'Motorin', 'lt', 'kg gaz / lt',
        { co2: 2.68, ch4: 0.00009, n2o: 0.00006 },
        'IPCC 2006 Guidelines Vol.2 Ch.3 (varsayılan)', 'IPCC 2006 GL V2C3', '1.0', 2006, 'AR5'),
      row(7, 1, 'Mobil Yakma', 'Benzin (Araç)', 'Benzin', 'lt', 'kg gaz / lt',
        { co2: 2.31, ch4: 0.00025, n2o: 0.00002 },
        'IPCC 2006 Guidelines Vol.2 Ch.3 (varsayılan)', 'IPCC 2006 GL V2C3', '1.0', 2006, 'AR5'),
      row(8, 1, 'Mobil Yakma', 'LPG (Forklift/Araç)', 'LPG', 'lt', 'kg gaz / lt',
        { co2: 1.51, ch4: 0.00005, n2o: 0.00001 },
        'IPCC 2006 Guidelines Vol.2 Ch.3 (varsayılan)', 'IPCC 2006 GL V2C3', '1.0', 2006, 'AR5'),

      // ---- Scope 1: Proses ----
      row(9, 1, 'Proses Emisyonu', 'Nitrik Asit Üretimi (kontrolsüz)', 'Proses (N2O)', 'ton HNO3', 'kg N2O / ton HNO3',
        { n2o: 2.0 },
        'IPCC 2006 Guidelines Vol.3 Ch.3 (varsayılan, azaltımsız)', 'IPCC 2006 GL V3C3 Table 3.3', '1.0', 2006, 'AR5',
        'Katalizör/NSCR azaltım sistemi varsa ölçüme dayalı düşük faktör kullanılmalıdır.'),
      row(10, 1, 'Proses Emisyonu', 'Nitrik Asit Üretimi (NSCR azaltımlı)', 'Proses (N2O)', 'ton HNO3', 'kg N2O / ton HNO3',
        { n2o: 0.4 },
        'IPCC 2006 Guidelines Vol.3 Ch.3 (azaltım sistemi ile örnek)', 'IPCC 2006 GL V3C3', '1.0', 2006, 'AR5'),
      row(11, 1, 'Proses Emisyonu', 'Amonyak Üretimi (Doğalgaz Reforming)', 'Proses (CO2)', 'ton NH3', 'kg CO2 / ton NH3',
        { co2: 1694 },
        'IPCC 2006 Guidelines Vol.3 Ch.3 (varsayılan)', 'IPCC 2006 GL V3C3', '1.0', 2006, 'AR5'),

      // ---- Scope 2: Elektrik / Buhar / Isıtma / Soğutma ----
      row(12, 2, 'Elektrik (Location-Based)', 'Şebeke Elektriği - Location Based', 'Elektrik', 'kWh', 'kgCO2e / kWh (doğrudan)',
        { co2eFactor: 0.442 },
        'Örnek ulusal şebeke ortalama faktörü', 'Ulusal Sera Gazı Envanteri / T.C. Enerji Bakanlığı (örnek)', '1.0', 2023, 'AR5',
        'Güncel yıl için resmi ulusal şebeke faktörü ile değiştirilmelidir.'),
      row(13, 2, 'Elektrik (Market-Based)', 'Tedarikçi Sözleşmeli Elektrik - Market Based', 'Elektrik', 'kWh', 'kgCO2e / kWh (doğrudan)',
        { co2eFactor: 0.442 },
        'Tedarikçiye özgü kalıntı karışım faktörü (örnek, garanti kökenli sertifika yoksa şebeke ile aynı alınır)',
        'Tedarikçi Belgesi / Residual Mix', '1.0', 2023, 'AR5', 'Yeşil enerji sertifikası (I-REC/GO) varsa 0 olarak güncellenmelidir.'),
      row(14, 2, 'Buhar', 'Satın Alınan Buhar', 'Buhar', 'kg', 'kgCO2e / kg (doğrudan)',
        { co2eFactor: 0.196 }, 'Tedarikçi Beyanı (örnek)', 'Yerel referans', '1.0', 2024, 'AR5'),
      row(15, 2, 'Isıtma', 'Bölgesel Isıtma', 'Isı', 'kWh', 'kgCO2e / kWh (doğrudan)',
        { co2eFactor: 0.180 }, 'Tedarikçi Beyanı (örnek)', 'Yerel referans', '1.0', 2024, 'AR5'),
      row(16, 2, 'Soğutma', 'Bölgesel Soğutma', 'Soğutma', 'kWh', 'kgCO2e / kWh (doğrudan)',
        { co2eFactor: 0.120 }, 'Tedarikçi Beyanı (örnek)', 'Yerel referans', '1.0', 2024, 'AR5'),

      // ---- Scope 3 örnek faktörler ----
      row(17, 3, 'Kategori 6 - İş Seyahati', 'Uçak (kısa mesafe, kişi.km)', 'Havayolu', 'kişi.km', 'kgCO2e / kişi.km (doğrudan)',
        { co2eFactor: 0.15 }, 'DEFRA benzeri örnek faktör', 'Örnek referans - DEFRA/GHG Protocol', '1.0', 2023, 'AR5'),
      row(18, 3, 'Kategori 7 - Çalışan İşe Geliş Gidiş', 'Otomobil (ortalama, km)', 'Karayolu', 'km', 'kgCO2e / km (doğrudan)',
        { co2eFactor: 0.17 }, 'DEFRA benzeri örnek faktör', 'Örnek referans - DEFRA/GHG Protocol', '1.0', 2023, 'AR5'),
      row(19, 3, 'Kategori 5 - Atık', 'Karışık Atık - Düzenli Depolama', 'Atık', 'ton', 'kgCO2e / ton (doğrudan)',
        { co2eFactor: 458 }, 'DEFRA benzeri örnek faktör', 'Örnek referans - DEFRA/GHG Protocol', '1.0', 2023, 'AR5'),
      row(20, 3, 'Kategori 1 - Satın Alınan Mal ve Hizmetler', 'Genel Harcama Bazlı (örnek)', 'Harcama', 'TL', 'kgCO2e / TL (doğrudan)',
        { co2eFactor: 0.05 }, 'Harcama bazlı örnek faktör (EEIO benzeri)', 'Örnek referans', '1.0', 2023, 'AR5',
        'Mümkünse tedarikçi bazlı (supplier-specific) faktörle değiştirilmelidir.')
    ];

    Store.setAll('emissionFactors', list);
  }
  window.seedEmissionFactors = seed;
})();
