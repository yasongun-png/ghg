/*
 * seos/statistics.js — pure numeric helpers shared by calculation.js
 * (running-minute stats) and charts.js (histogram / box plot / outliers).
 * No DOM, no Store, no Chart.js — safe to unit-reason about in isolation.
 */
(function () {
  window.Seos = window.Seos || {};

  function nums(arr) {
    return (arr || []).filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
  }

  function mean(arr) {
    const v = nums(arr);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
  }

  function min(arr) {
    const v = nums(arr);
    return v.length ? Math.min(...v) : 0;
  }

  function max(arr) {
    const v = nums(arr);
    return v.length ? Math.max(...v) : 0;
  }

  // Population standard deviation (we describe the full running-minute
  // population for the period, not a sample drawn from it).
  function stddev(arr) {
    const v = nums(arr);
    if (!v.length) return 0;
    const m = mean(v);
    return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length);
  }

  function sortedCopy(arr) {
    return nums(arr).slice().sort((a, b) => a - b);
  }

  // Linear-interpolation percentile (common "type 7" method) — good enough
  // for environmental reporting quartiles/box plots.
  function percentile(arr, p) {
    const s = sortedCopy(arr);
    if (!s.length) return 0;
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }

  function median(arr) { return percentile(arr, 0.5); }

  function quartiles(arr) {
    const q1 = percentile(arr, 0.25);
    const q3 = percentile(arr, 0.75);
    return { q1, median: percentile(arr, 0.5), q3, iqr: q3 - q1 };
  }

  // Classic 1.5×IQR fence rule. Returns bounds plus the indices (into the
  // ORIGINAL arr, not the sorted copy) that fall outside them.
  function outliersIQR(arr) {
    const { q1, q3, iqr } = quartiles(arr);
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outlierIndices = [];
    (arr || []).forEach((v, i) => {
      if (v === null || v === undefined || isNaN(v)) return;
      if (Number(v) < lower || Number(v) > upper) outlierIndices.push(i);
    });
    return { lowerBound: lower, upperBound: upper, outlierIndices };
  }

  function histogram(arr, bucketCount) {
    bucketCount = bucketCount || 12;
    const v = nums(arr);
    if (!v.length) return { labels: [], counts: [] };
    const lo = Math.min(...v), hi = Math.max(...v);
    const width = (hi - lo) / bucketCount || 1;
    const counts = new Array(bucketCount).fill(0);
    v.forEach(x => {
      let idx = Math.floor((x - lo) / width);
      if (idx >= bucketCount) idx = bucketCount - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    });
    const labels = counts.map((_, i) => `${(lo + i * width).toFixed(1)}–${(lo + (i + 1) * width).toFixed(1)}`);
    return { labels, counts };
  }

  window.Seos.Statistics = { mean, min, max, stddev, median, quartiles, outliersIQR, histogram, percentile };
})();
