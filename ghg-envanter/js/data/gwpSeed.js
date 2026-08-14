/*
 * gwpSeed.js — seeds the GWP registry (section 17) with IPCC AR4/AR5/AR6
 * 100-year GWP values if the collection is empty. All values are editable
 * / extendable by the user from the "GWP Yönetimi" screen; nothing here is
 * hard-coded into the calculation engine itself.
 */
(function () {
  function seed() {
    if (Store.getAll('gwpFactors').length > 0) return;

    const rows = [
      // gasName, formula, AR4, AR5, AR6, source
      ['CO2', 'CO2', 1, 1, 1],
      ['CH4', 'CH4', 25, 28, 27.9],
      ['N2O', 'N2O', 298, 265, 273],
      ['SF6', 'SF6', 22800, 23500, 25200],
      ['NF3', 'NF3', 17200, 16100, 17400],
      ['HFC-134a', 'CH2FCF3', 1430, 1300, 1526],
      ['HFC-125', 'CHF2CF3', 3500, 3170, 3740],
      ['HFC-32', 'CH2F2', 675, 677, 771],
      ['HFC-143a', 'CH3CF3', 4470, 4800, 5810],
      ['HFC-23', 'CHF3', 14800, 12400, 14600],
      ['R-404A', 'Karışım (HFC-125/143a/134a)', 3922, 3943, 4728],
      ['R-410A', 'Karışım (HFC-32/125)', 2088, 1924, 2256],
      ['R-407C', 'Karışım (HFC-32/125/134a)', 1774, 1624, 1889],
      ['R-507A', 'Karışım (HFC-125/143a)', 3985, 3985, 4784],
      ['PFC-14 (CF4)', 'CF4', 7390, 6630, 7380],
      ['PFC-116 (C2F6)', 'C2F6', 12200, 11100, 12400]
    ];

    const out = [];
    let id = 1;
    rows.forEach(([gasName, formula, ar4, ar5, ar6]) => {
      [['AR4', ar4], ['AR5', ar5], ['AR6', ar6]].forEach(([set, val]) => {
        out.push({
          id: id++,
          gasName, formula, gwpSet: set, gwp: val,
          source: `IPCC ${set} Değerlendirme Raporu (100 yıllık GWP)`,
          version: '1.0', validYear: set === 'AR4' ? 2007 : (set === 'AR5' ? 2013 : 2021),
          active: true, isDemo: false,
          status: 'approved', dataQuality: 'A',
          entryDate: Store.nowIso(), entryUser: 'system'
        });
      });
    });
    Store.setAll('gwpFactors', out);
  }
  window.seedGwp = seed;
})();
