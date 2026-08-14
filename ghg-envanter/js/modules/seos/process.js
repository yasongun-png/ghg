/*
 * seos/process.js — pipeline steps 6-11 of the V5 spec (Proses Durumu,
 * C/E/D geçerlilik kontrolleri, Ölçüm Sınıflandırması).
 *
 * V5 change from V4: D (N₂O Kütlesel Debisi) is now a THIRD independently
 * validated parameter, not just a derived convenience value — "Geçerli
 * Ölçüm" requires C ≥ 70 mg/Nm³ AND E ≥ 70000 Nm³/h AND D geçerli (boş
 * olmayan, sayısal, negatif olmayan). A record failing exactly one
 * parameter gets its own granular sınıf (Geçersiz N₂O / Geçersiz Debi /
 * Geçersiz D) instead of one generic "Geçersiz Ölçüm" bucket, and a record
 * failing 2+ parameters gets "Birden Fazla Geçersiz Parametre" — this lets
 * QA/QC and the parametre-bazlı veri kullanılabilirlik % (calculation.js)
 * pinpoint exactly which sensor is the problem.
 *
 * Every record ends up in exactly one of 8 classes (`sinif` 1-8 +
 * `sinifAdi`, shown as its own column in the Ham Veri table):
 *   1 Proses Kapalı
 *   2 Geçerli Ölçüm
 *   3 Geçersiz N₂O            (only C failed)
 *   4 Geçersiz Debi           (only E failed)
 *   5 Geçersiz D              (only D failed)
 *   6 Birden Fazla Geçersiz Parametre (2-3 failed)
 *   7 Eksik Veri              (already assigned by validation.js — this
 *                               module never touches those rows)
 *   8 İkame Veri              (assigned later by substitution.js, upgrading
 *                               some sınıf 3/4/5/6 rows once the overall
 *                               %80 threshold triggers substitution)
 */
(function () {
  window.Seos = window.Seos || {};

  const SINIF_ADI = {
    1: 'Proses Kapalı', 2: 'Geçerli Ölçüm', 3: 'Geçersiz N₂O', 4: 'Geçersiz Debi',
    5: 'Geçersiz D', 6: 'Birden Fazla Geçersiz Parametre', 7: 'Eksik Veri', 8: 'İkame Veri'
  };

  // dColumnMapped: when the file has no D column at all, D is a calculated
  // value (kütlesel debi = konsantrasyon × debi / 1.000.000 — the standard
  // CEMS formula, not an imputed guess), so it's always "valid" whenever
  // C and E themselves are present, exactly like the V3/V4 fallback. When
  // the file DOES provide a measured D column, D is validated as-provided
  // per the V5 spec (boş/negatif → geçersiz), independent of C and E.
  function classify(records, dColumnMapped) {
    records.forEach(r => {
      if (r.sinif === 7) return; // Eksik Veri — never reclassified here

      if (!dColumnMapped && (r.d === null || r.d === undefined) && r.c !== null && r.e !== null) {
        r.d = (r.c * r.e) / 1e6;
      }

      const prosesDurumu = r.prosesDurumuGirilen || 'Açık'; // no column F → assume Açık (Faz 1 behaviour)
      r.prosesDurumu = prosesDurumu;

      if (prosesDurumu !== 'Açık') {
        r.sinif = 1;
        r.sinifAdi = SINIF_ADI[1];
        return;
      }

      r.n2oGecerli = r.c !== null && r.c >= 70;
      r.debiGecerli = r.e !== null && r.e >= 70000;
      r.dGecerli = r.d !== null && r.d !== undefined && !isNaN(r.d) && r.d >= 0;

      const failCount = (r.n2oGecerli ? 0 : 1) + (r.debiGecerli ? 0 : 1) + (r.dGecerli ? 0 : 1);
      let sinif;
      if (failCount === 0) sinif = 2;
      else if (failCount >= 2) sinif = 6;
      else if (!r.n2oGecerli) sinif = 3;
      else if (!r.debiGecerli) sinif = 4;
      else sinif = 5; // !r.dGecerli
      r.sinif = sinif;
      r.sinifAdi = SINIF_ADI[sinif];
    });
    return records;
  }

  window.Seos.Process = { classify, SINIF_ADI };
})();
