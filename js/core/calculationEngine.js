/*
 * calculationEngine.js — central GHG calculation engine.
 *
 * Rule of the app: Aktivite Verisi x Emisyon Faktörü = Gaz Emisyonu
 *                   Gaz Emisyonu x GWP = CO2e
 * Every result is written to Store 'calculationResults' together with the
 * full audit trail (source data, factor, factor version/source, GWP set,
 * method) so results are always traceable back to their inputs (section 39-41).
 */
(function (global) {

  const GAS_KEYS = ['co2', 'ch4', 'n2o', 'hfc', 'pfc', 'sf6', 'nf3'];

  function getGwpLookup(gwpSetName) {
    const all = Store.getAll('gwpFactors').filter(g => g.gwpSet === gwpSetName);
    const map = {};
    all.forEach(g => { map[g.gasName] = Number(g.gwp) || 0; });
    return map;
  }

  // Core math: activityValue * factor(record) -> gas emissions -> * GWP -> CO2e
  function calculate(activityValue, factorRecord, gwpSetName) {
    activityValue = Number(activityValue) || 0;
    factorRecord = factorRecord || {};
    const gwp = getGwpLookup(gwpSetName);

    const gasEmissions = {};
    GAS_KEYS.forEach(g => { gasEmissions[g] = activityValue * (Number(factorRecord[g]) || 0); });
    // some factors (grid electricity, refrigerant blends) are already expressed directly in CO2e per unit
    const co2eDirect = activityValue * (Number(factorRecord.co2eFactor) || 0);

    const co2eByGas = {};
    let totalCO2e = co2eDirect;
    GAS_KEYS.forEach(g => {
      const gwpKey = g.toUpperCase();
      const gwpVal = gwp[gwpKey] !== undefined ? gwp[gwpKey] : (g === 'co2' ? 1 : 0);
      co2eByGas[g] = gasEmissions[g] * gwpVal;
      totalCO2e += co2eByGas[g];
    });

    return {
      activityValue: activityValue,
      gasEmissions: gasEmissions,     // kg of each gas
      co2eDirect: co2eDirect,         // kg CO2e (for pre-aggregated factors)
      co2eByGas: co2eByGas,           // kg CO2e per gas
      totalCO2eKg: totalCO2e,
      totalCO2eTon: totalCO2e / 1000,
      gwpSetUsed: gwpSetName,
      gwpValuesUsed: gwp
    };
  }

  function buildTrace(meta, factorRecord, result) {
    const lines = [];
    lines.push(`Kaynak: ${meta.category || meta.module}`);
    lines.push(`Aktivite verisi: ${meta.activityValue} ${meta.activityUnit || ''}`);
    if (factorRecord) {
      if (factorRecord.co2 || factorRecord.co2eFactor) {
        lines.push(`Emisyon faktörü: ${factorRecord.activity || factorRecord.fuel || ''} = ${(factorRecord.co2 || factorRecord.co2eFactor || 0)} ${factorRecord.factorUnit || ''}`);
      } else {
        lines.push(`Yöntem: ${factorRecord.activity || '-'}`);
      }
      lines.push(`Faktör kaynağı: ${factorRecord.source || '-'} (v${factorRecord.version || '-'}, ${factorRecord.validYear || '-'})`);
    }
    lines.push(`GWP seti: ${result.gwpSetUsed || '-'}`);
    GAS_KEYS.forEach(g => {
      if (result.gasEmissions[g]) {
        lines.push(`  ${g.toUpperCase()}: ${meta.activityValue} x ${factorRecord ? (factorRecord[g] || 0) : 0} = ${result.gasEmissions[g].toFixed(4)} kg -> x GWP ${result.gwpValuesUsed[g.toUpperCase()] || (g === 'co2' ? 1 : 0)} = ${result.co2eByGas[g].toFixed(4)} kg CO2e`);
      }
    });
    if (result.co2eDirect) lines.push(`  Doğrudan CO2e faktörü: ${meta.activityValue} x ${factorRecord ? (factorRecord.co2eFactor || 0) : 0} = ${result.co2eDirect.toFixed(4)} kg CO2e`);
    lines.push(`SONUÇ: ${result.totalCO2eKg.toFixed(3)} kg CO2e  =  ${result.totalCO2eTon.toFixed(4)} tCO2e`);
    return lines.join('\n');
  }

  /**
   * Runs a calculation for one source record and (re)stores it in calculationResults.
   * meta: { module, sourceKey, sourceId, year, month, facilityId, departmentId, processId,
   *         productId, scope, category, activityValue, activityUnit, factorId, gwpSet, method,
   *         locationBased (bool, optional for scope2), marketBased (bool, optional) }
   */
  function runAndStore(meta) {
    const factorRecord = meta.factorId ? Store.getById('emissionFactors', meta.factorId) : (meta.manualFactor || null);
    const result = calculate(meta.activityValue, factorRecord, meta.gwpSet);
    const trace = buildTrace(meta, factorRecord, result);

    // remove previous calculation(s) tied to this exact source record so recalculation doesn't duplicate
    // (targeted deletes, not a full-collection rewrite — this runs on every save)
    Store.getAll('calculationResults')
      .filter(c => c.sourceKey === meta.sourceKey && String(c.sourceId) === String(meta.sourceId))
      .forEach(c => Store.remove('calculationResults', c.id));

    const stored = Store.add('calculationResults', Object.assign({}, meta, {
      factorSnapshot: factorRecord ? {
        id: factorRecord.id, activity: factorRecord.activity, fuel: factorRecord.fuel,
        source: factorRecord.source, sourceDocument: factorRecord.sourceDocument,
        version: factorRecord.version, validYear: factorRecord.validYear, factorUnit: factorRecord.factorUnit
      } : null,
      gasEmissions: result.gasEmissions,
      co2eDirect: result.co2eDirect,
      co2eByGas: result.co2eByGas,
      totalCO2eKg: result.totalCO2eKg,
      totalCO2eTon: result.totalCO2eTon,
      trace: trace,
      calculatedAt: Store.nowIso()
    }), { reason: 'Otomatik hesaplama' });

    return stored;
  }

  function removeForSource(sourceKey, sourceId) {
    Store.getAll('calculationResults')
      .filter(c => c.sourceKey === sourceKey && String(c.sourceId) === String(sourceId))
      .forEach(c => Store.remove('calculationResults', c.id));
  }

  function resultsFor(filter) {
    filter = filter || {};
    return Store.getAll('calculationResults').filter(r => {
      if (filter.year && Number(r.year) !== Number(filter.year)) return false;
      if (filter.month && Number(r.month) !== Number(filter.month)) return false;
      if (filter.scope && Number(r.scope) !== Number(filter.scope)) return false;
      if (filter.facilityId && String(r.facilityId) !== String(filter.facilityId)) return false;
      if (filter.departmentId && String(r.departmentId) !== String(filter.departmentId)) return false;
      if (filter.processId && String(r.processId) !== String(filter.processId)) return false;
      if (filter.productId && String(r.productId) !== String(filter.productId)) return false;
      if (filter.module && r.module !== filter.module) return false;
      return true;
    });
  }

  function sumCO2eTon(filter) {
    return resultsFor(filter).reduce((s, r) => s + (Number(r.totalCO2eTon) || 0), 0);
  }

  // Groups calculationResults by category, summing each gas (kg), CO2e
  // (kg/ton), and the underlying activity data (e.g. total Sm³ of doğalgaz).
  function breakdownByCategory(filter) {
    const groups = {};
    resultsFor(filter).forEach(r => {
      const key = r.category || r.module || '-';
      if (!groups[key]) {
        groups[key] = { category: key, co2: 0, ch4: 0, n2o: 0, hfc: 0, pfc: 0, sf6: 0, nf3: 0, co2eDirect: 0, totalCO2eKg: 0, totalCO2eTon: 0, activityTotal: 0, activityUnit: '', count: 0 };
      }
      const g = groups[key];
      GAS_KEYS.forEach(gas => { g[gas] += (r.gasEmissions && r.gasEmissions[gas]) || 0; });
      g.co2eDirect += r.co2eDirect || 0;
      g.totalCO2eKg += r.totalCO2eKg || 0;
      g.totalCO2eTon += r.totalCO2eTon || 0;
      g.activityTotal += Number(r.activityValue) || 0;
      if (!g.activityUnit) g.activityUnit = r.activityUnit || '';
      g.count++;
    });
    return Object.values(groups).sort((a, b) => b.totalCO2eTon - a.totalCO2eTon);
  }

  global.Calc = {
    GAS_KEYS, getGwpLookup, calculate, buildTrace, runAndStore, removeForSource, resultsFor, sumCO2eTon, breakdownByCategory
  };
})(window);
