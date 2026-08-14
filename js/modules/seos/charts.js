/*
 * seos/charts.js — the 9 required Chart.js visualizations. Built lazily
 * (only when their tab is actually shown, wired by ui.js) since a full
 * minute-level dataset is too large to chart directly — trend charts are
 * decimated to a manageable point count first.
 */
(function () {
  window.Seos = window.Seos || {};
  const registry = {};

  function destroy(id) {
    if (registry[id]) { registry[id].destroy(); delete registry[id]; }
  }

  function decimate(arr, maxPoints) {
    if (arr.length <= maxPoints) return arr;
    const step = Math.ceil(arr.length / maxPoints);
    return arr.filter((_, i) => i % step === 0);
  }

  const COLORS = { brand: '#2e8b57', scope1: '#d9480f', scope2: '#1971c2', scope3: '#9c36b5', warn: '#f08c00', ok: '#2b8a3e', bad: '#c92a2a', gray: '#868e96' };

  function flowTrendChart(canvasId, records) {
    destroy(canvasId);
    const rows = decimate(records, 2000);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels: rows.map(r => window.Seos.Data.dateTimeStr(r.ts)), datasets: [
        { label: 'Baca Gazı Debisi (Nm³/h)', data: rows.map(r => r.e), borderColor: COLORS.scope2, backgroundColor: 'rgba(25,113,194,.1)', fill: true, pointRadius: 0, tension: .15 },
        { label: 'Proses Eşiği (70.000)', data: rows.map(() => 70000), borderColor: COLORS.bad, borderDash: [6, 4], pointRadius: 0 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 10 } } } }
    });
  }

  function n2oTrendChart(canvasId, records) {
    destroy(canvasId);
    const rows = decimate(records, 2000);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels: rows.map(r => window.Seos.Data.dateTimeStr(r.ts)), datasets: [
        { label: 'N₂O Konsantrasyonu (mg/Nm³)', data: rows.map(r => r.c), borderColor: COLORS.scope1, backgroundColor: 'rgba(217,72,15,.1)', fill: true, pointRadius: 0, tension: .15 },
        { label: 'Proses Eşiği (70)', data: rows.map(() => 70), borderColor: COLORS.bad, borderDash: [6, 4], pointRadius: 0 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 10 } } } }
    });
  }

  // V5 — D (N₂O Kütlesel Debisi) is now its own independently validated
  // parameter (spec §7/§29), so it gets its own time-series chart too.
  function dTrendChart(canvasId, records) {
    destroy(canvasId);
    const rows = decimate(records, 2000);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels: rows.map(r => window.Seos.Data.dateTimeStr(r.ts)), datasets: [
        { label: 'N₂O Kütlesel Debisi (kg/h)', data: rows.map(r => r.d), borderColor: COLORS.warn, backgroundColor: 'rgba(240,140,0,.1)', fill: true, pointRadius: 0, tension: .15 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 10 } } } }
    });
  }

  // V5 — Geçerli/Geçersiz dağılımı per parameter (spec §29): counts Proses
  // Açık rows by their independent geçerlilik flag (n2oGecerli/debiGecerli/
  // dGecerli), regardless of the OTHER two parameters' status.
  function validityChart(canvasId, records, field, label) {
    destroy(canvasId);
    const acik = records.filter(r => r.prosesDurumu === 'Açık');
    const gecerli = acik.filter(r => r[field] === true).length;
    const gecersiz = acik.filter(r => r[field] === false).length;
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: { labels: [`${label} Geçerli`, `${label} Geçersiz`], datasets: [{ data: [gecerli, gecersiz], backgroundColor: [COLORS.ok, COLORS.bad] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Stacked so the ölçülen/ikame composition of each day's emission is
  // visible at a glance, not just the total — same population split the
  // reports (Ölçülen Veri Emisyonu / İkame Veri Emisyonu) use.
  function dailyEmissionChart(canvasId, dailyAgg) {
    destroy(canvasId);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: dailyAgg.map(d => d.date), datasets: [
        { label: 'Ölçülen N₂O (kg)', data: dailyAgg.map(d => d.olculenKg), backgroundColor: COLORS.brand, stack: 'n2o' },
        { label: 'İkame N₂O (kg)', data: dailyAgg.map(d => d.ikameKg), backgroundColor: COLORS.warn, stack: 'n2o' }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, ticks: { maxTicksLimit: 15 } }, y: { stacked: true } } }
    });
  }

  function monthlyEmissionChart(canvasId, monthlyAgg) {
    destroy(canvasId);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: monthlyAgg.map(m => m.month), datasets: [
        { label: 'Ölçülen N₂O (kg)', data: monthlyAgg.map(m => m.olculenKg), backgroundColor: COLORS.brand, stack: 'n2o', yAxisID: 'y' },
        { label: 'İkame N₂O (kg)', data: monthlyAgg.map(m => m.ikameKg), backgroundColor: COLORS.warn, stack: 'n2o', yAxisID: 'y' },
        { label: 'CO₂e (ton)', data: monthlyAgg.map(m => m.co2eTon), backgroundColor: COLORS.scope2, type: 'line', yAxisID: 'y1' }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: {
        x: { stacked: true },
        y: { stacked: true, position: 'left', title: { display: true, text: 'kg N₂O' } },
        y1: { position: 'right', title: { display: true, text: 'ton CO₂e' }, grid: { drawOnChartArea: false } }
      } }
    });
  }

  // Veri Kullanılabilirliği: Geçerli / Geçersiz (toplam N₂O+Debi+D+Birden
  // Fazla) / Eksik dağılımı. V5: yalnızca Geçerli+Geçersiz "Proses Açık
  // Dakika" paydasını oluşturur — Eksik Veri denklemde yer almaz, burada
  // yalnızca oransal karşılaştırma için gösterilir.
  function availabilityChart(canvasId, availability) {
    destroy(canvasId);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: { labels: ['Geçerli Ölçüm', 'Geçersiz Ölçüm', 'Eksik Veri'], datasets: [{ data: [availability.gecerliOlcum, availability.gecersizOlcum, availability.eksikOlcum], backgroundColor: [COLORS.ok, COLORS.warn, COLORS.bad] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function uptimeChart(canvasId, prosesSureleri) {
    destroy(canvasId);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: { labels: ['Proses Açık', 'Proses Kapalı'], datasets: [{ data: [prosesSureleri.acikDakika, prosesSureleri.kapaliDakika], backgroundColor: [COLORS.brand, COLORS.gray] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Ölçülen / İkame Emisyon Karşılaştırması — the visual companion to the
  // İkame Veri Etki Oranı figure shown in the Özet tab.
  function measuredVsSubstitutedChart(canvasId, totalOlculenN2OKg, totalIkameN2OKg) {
    destroy(canvasId);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: { labels: ['Ölçülen N₂O (kg)', 'İkame N₂O (kg)'], datasets: [{ data: [totalOlculenN2OKg, totalIkameN2OKg], backgroundColor: [COLORS.brand, COLORS.warn] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function histogramChart(canvasId, values) {
    destroy(canvasId);
    const h = window.Seos.Statistics.histogram(values, 14);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: h.labels, datasets: [{ label: 'Kayıt Sayısı', data: h.counts, backgroundColor: COLORS.scope1 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 10 } } } }
    });
  }

  // Approximated box plot: whisker (min-max, thin/light) + box (Q1-Q3,
  // solid) as Chart.js "floating bar" ranges, median marked as a point —
  // no boxplot plugin dependency needed.
  function boxPlotChart(canvasId, values, label) {
    destroy(canvasId);
    const Stat = window.Seos.Statistics;
    const q = Stat.quartiles(values);
    const lo = Stat.min(values), hi = Stat.max(values);
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: [label || 'N₂O Konsantrasyonu'], datasets: [
        { label: 'Min–Maks', data: [[lo, hi]], backgroundColor: 'rgba(134,142,150,.25)', barThickness: 14 },
        { label: 'Q1–Q3 (IQR)', data: [[q.q1, q.q3]], backgroundColor: COLORS.scope2, barThickness: 34 },
        { label: 'Medyan', data: [[q.median - 0.3, q.median + 0.3]], backgroundColor: COLORS.bad, barThickness: 34 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { title: { display: true, text: 'mg/Nm³' } } } }
    });
  }

  // Scatter of the averaging population's concentrations (n2oKullanilan —
  // same "nihai" population used for Ortalama/Min/Maks/StdSapma) over
  // time, outliers (IQR rule) highlighted in red.
  function outlierChart(canvasId, records) {
    destroy(canvasId);
    const running = decimate(records.filter(r => r.n2oKullanilan !== null && r.n2oKullanilan !== undefined).map(r => ({ ts: r.ts, c: r.n2oKullanilan })), 3000);
    const { lowerBound, upperBound } = window.Seos.Statistics.outliersIQR(running.map(r => r.c));
    const points = running.map((r, i) => ({ x: i, y: r.c, outlier: r.c < lowerBound || r.c > upperBound }));
    registry[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'scatter',
      data: { datasets: [{ label: 'N₂O Konsantrasyonu', data: points.map(p => ({ x: p.x, y: p.y })),
        pointBackgroundColor: points.map(p => p.outlier ? COLORS.bad : COLORS.brand),
        pointRadius: points.map(p => p.outlier ? 4 : 2) }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Örnek Sırası' } }, y: { title: { display: true, text: 'mg/Nm³' } } },
        plugins: { legend: { display: false } } }
    });
  }

  window.Seos.Charts = {
    flowTrendChart, n2oTrendChart, dTrendChart, dailyEmissionChart, monthlyEmissionChart,
    availabilityChart, uptimeChart, measuredVsSubstitutedChart, histogramChart, boxPlotChart, outlierChart, validityChart, destroy
  };
})();
