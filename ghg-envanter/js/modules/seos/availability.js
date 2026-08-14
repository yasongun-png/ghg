/*
 * seos/availability.js — pipeline step of the V5 spec (Veri
 * Kullanılabilirliği). Must run AFTER process.js has classified every
 * record (sınıf 1-7) and BEFORE substitution.js, since the %80 threshold
 * decision has to reflect genuinely measured data, not values we're about
 * to manufacture ourselves.
 *
 * V5 change from V4 (spec §31, "EN ÖNEMLİ KURAL", repeated three times):
 * the denominator is EXCLUSIVELY "F = Çalışıyor kayıt sayısı" — Eksik Veri
 * (sınıf 7) rows have no F=Çalışıyor designation at all (their Proses
 * Durumu is literally "Eksik Veri", a third value distinct from
 * Açık/Kapalı), so they are now excluded from both numerator and
 * denominator. This reverses V4's deliberate "count them conservatively"
 * choice — the V5 spec is unambiguous and repeats the rule three times, so
 * it wins over the earlier judgment call.
 */
(function () {
  window.Seos = window.Seos || {};

  function compute(records) {
    let prosesKapaliDakika = 0, gecerli = 0, gecersizN2O = 0, gecersizDebi = 0, gecersizD = 0, gecersizCoklu = 0, eksik = 0;
    records.forEach(r => {
      if (r.sinif === 1) prosesKapaliDakika++;
      else if (r.sinif === 2) gecerli++;
      else if (r.sinif === 3) gecersizN2O++;
      else if (r.sinif === 4) gecersizDebi++;
      else if (r.sinif === 5) gecersizD++;
      else if (r.sinif === 6) gecersizCoklu++;
      else if (r.sinif === 7) eksik++;
      // sınıf 8 (İkame) doesn't exist yet at this point in the pipeline —
      // substitution.js runs strictly after this function.
    });
    const gecersizToplam = gecersizN2O + gecersizDebi + gecersizD + gecersizCoklu;
    const prosesAcikDakika = gecerli + gecersizToplam; // V5: SADECE F=Çalışıyor (eksik veri hariç)
    const pct = prosesAcikDakika ? (gecerli / prosesAcikDakika) * 100 : 0;
    return {
      expected: records.length, prosesKapaliDakika, prosesAcikDakika,
      gecerliOlcum: gecerli, gecersizOlcum: gecersizToplam,
      gecersizN2O, gecersizDebi, gecersizD, gecersizCoklu,
      eksikOlcum: eksik, pct
    };
  }

  window.Seos.Availability = { compute };
})();
