/*
 * excelIO.js — section 30: Excel İşlemleri.
 * Every data-entry screen gets its own downloadable template + import, not
 * just Production/Energy/Scope3 as in the original spec — this also covers
 * fuel invoices (mazot/motorin, benzin, LPG, doğalgaz...) entered through the
 * Enerji Verileri ledger, Scope 1 mobile combustion, process and fugitive
 * emissions. Plus a full "export everything" workbook.
 */
(function () {
  window.Modules = window.Modules || {};

  function findFacilityByCode(code) {
    const f = Store.getAll('facilityData').find(x => String(x.code).toLowerCase() === String(code).toLowerCase());
    return f ? f.id : null;
  }
  function findProductByCode(code) {
    const p = Store.getAll('productData').find(x => String(x.code).toLowerCase() === String(code).toLowerCase());
    return p ? p.id : null;
  }
  function monthNumber(v) {
    if (!v) return null;
    if (!isNaN(Number(v))) return Number(v);
    const idx = Validation.MONTHS.findIndex(m => m.toLowerCase() === String(v).trim().toLowerCase());
    return idx >= 0 ? idx + 1 : null;
  }

  const TEMPLATES = [
    {
      key: 'productionData', label: 'Üretim Verileri', icon: 'fa-industry',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Ürün Kodu', 'Üretim Miktarı', 'Birim'],
      sample: [[2026, 'Ocak', 'TESIS1', 'URUN1', 1000, 'ton']],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        const productId = findProductByCode(row[3]);
        if (!facilityId || !productId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, productId, quantity: Number(row[4]), unit: row[5] || 'ton', dataQuality: 'B', dataSource: 'Excel İçe Aktarım' };
      },
      afterImport: () => window.Modules.production && window.Modules.production.renderAnalytics && window.Modules.production.renderAnalytics()
    },
    {
      key: 'energyData', label: 'Enerji Tüketim Verileri (Elektrik, Doğalgaz, Motorin/Mazot, Benzin, LPG, Kömür, Buhar...)', icon: 'fa-bolt',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Enerji Türü', 'Tüketim', 'Fatura No', 'Veri Kaynağı'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Motorin (Mazot)', 500, 'FAT-2026-001', 'Fatura']],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        let energyType = String(row[3] || '').replace('(Mazot)', '').trim();
        if (!window.Modules.energy.ENERGY_TYPES[energyType]) {
          // normalize common aliases
          if (/mazot|motorin/i.test(row[3])) energyType = 'Motorin';
          else if (/doğalgaz|dogalgaz|gaz/i.test(row[3])) energyType = 'Doğalgaz';
          else if (/benzin/i.test(row[3])) energyType = 'Benzin';
          else if (/elektrik/i.test(row[3])) energyType = 'Elektrik';
        }
        if (!window.Modules.energy.ENERGY_TYPES[energyType]) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, energyType, consumption: Number(row[4]), invoiceNo: row[5] || '', dataSource: row[6] || 'Fatura', dataQuality: 'B' };
      },
      afterSaveEach: (rec) => window.Modules.energy.runCalc(rec)
    },
    {
      key: 'energyProductionData', label: 'Enerji Üretim Bilgileri (tesis içi üretim)', icon: 'fa-solar-panel',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Enerji Türü', 'Üretim Kaynağı', 'Üretim Miktarı'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Elektrik', 'Güneş (GES)', 5000]],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, energyType: row[3], source: row[4] || '', amount: Number(row[5]), dataQuality: 'B', dataSource: 'Excel İçe Aktarım' };
      }
    },
    {
      key: 'energySalesData', label: 'Enerji Satışı Bilgileri', icon: 'fa-right-left',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Enerji Türü', 'Alıcı', 'Satış Miktarı', 'Fatura No'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Elektrik', 'Şebekeye Satış', 1200, 'FAT-SAT-2026-001']],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, energyType: row[3], buyer: row[4] || '', amount: Number(row[5]), invoiceNo: row[6] || '', dataQuality: 'B', dataSource: 'Excel İçe Aktarım' };
      }
    },
    {
      key: 'energyPurchaseData', label: 'Enerji Satın Alma Bilgileri (Tedarikçi/Sözleşme/Maliyet)', icon: 'fa-file-signature',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Enerji Türü', 'Tedarikçi', 'Sözleşme/Sertifika Türü', 'Miktar', 'Birim Fiyat', 'Toplam Tutar', 'Fatura No'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Elektrik', 'ABC Enerji A.Ş.', 'Serbest Tüketici', 50000, 2.5, 125000, 'FAT-2026-001']],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, energyType: row[3], supplier: row[4] || '',
          contractType: row[5] || '', amount: Number(row[6]), unitPrice: Number(row[7]) || null, totalCost: Number(row[8]) || null,
          invoiceNo: row[9] || '', dataQuality: 'B', dataSource: 'Excel İçe Aktarım' };
      },
      afterSaveEach: (rec) => window.Modules.energy.runPurchaseCalc(rec)
    },
    {
      key: 'scope1Data', label: 'Scope 1 - Mobil Yakma (Araç Yakıt Faturaları)', icon: 'fa-truck',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Araç Türü', 'Yakıt Türü', 'Tüketim', 'Birim'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Kamyon', 'Motorin', 200, 'lt']],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, category: 'mobile', vehicleType: row[3], fuelType: row[4], consumption: Number(row[5]), unit: row[6] || 'lt', dataQuality: 'C' };
      },
      afterSaveEach: (rec) => window.Modules.scope1.runMobileCalc(rec)
    },
    {
      key: 'scope3Data', label: 'Scope 3 (15 Kategori)', icon: 'fa-truck-fast',
      headers: ['Yıl', 'Ay', 'Kategori No', 'Aktivite Açıklaması', 'Miktar', 'Birim'],
      sample: [[2026, 'Ocak', '6. Business Travel', 'Uçak seyahati', 5000, 'kişi.km']],
      parseRow(row) {
        return { year: Number(row[0]), month: monthNumber(row[1]), categoryNo: row[2], activityDescription: row[3], activityValue: Number(row[4]), unit: row[5] || '', dataQuality: 'D' };
      },
      afterSaveEach: (rec) => window.Modules.scope3.runCalc(rec)
    },
    {
      key: 'processEmissionData', label: 'Proses Emisyonları', icon: 'fa-flask',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Proses Türü', 'Yöntem (factor/measurement/massbalance/activity/manual)', 'Aktivite Verisi', 'Birim'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Nitrik Asit', 'factor', 3200, 'ton HNO3']],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, processType: row[3], calcMethod: row[4] || 'factor', activityValue: Number(row[5]), unit: row[6] || '', dataQuality: 'C', gwpSet: 'AR5' };
      },
      afterSaveEach: (rec) => window.Modules.processemissions.runCalc(rec)
    },
    {
      key: 'fugitiveEmissionData', label: 'Kaçak Emisyonlar', icon: 'fa-wind',
      headers: ['Yıl', 'Ay', 'Tesis Kodu', 'Ekipman Türü', 'Gaz Türü', 'Kaçak Miktarı (kg)'],
      sample: [[2026, 'Ocak', 'TESIS1', 'Soğutma Sistemi', 'R-404A', 5]],
      parseRow(row) {
        const facilityId = findFacilityByCode(row[2]);
        if (!facilityId) return null;
        return { year: Number(row[0]), month: monthNumber(row[1]), facilityId, equipmentType: row[3], gasType: row[4], leakedMass: Number(row[5]), dataQuality: 'C', gwpSet: 'AR5' };
      },
      afterSaveEach: (rec) => window.Modules.fugitive.runCalc(rec)
    }
  ];

  function downloadTemplate(tpl) {
    Utils.exportTableToExcel(`Sablon_${tpl.key}.xlsx`, tpl.label.slice(0, 30), tpl.headers, tpl.sample);
  }

  function handleImport(tpl, file, statusEl) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1).filter(r => r && r.length && r[0] !== undefined && r[0] !== '');
        let ok = 0, fail = 0;
        rows.forEach(row => {
          const data = tpl.parseRow(row);
          if (!data) { fail++; return; }
          const saved = Store.add(tpl.key, data, { reason: 'Excel içe aktarım' });
          if (tpl.afterSaveEach) tpl.afterSaveEach(saved);
          ok++;
        });
        if (tpl.afterImport) tpl.afterImport();
        statusEl.innerHTML = `<span class="text-success">${ok} kayıt içe aktarıldı.</span>${fail ? ` <span class="text-danger">${fail} satır atlandı (tesis/ürün kodu bulunamadı veya geçersiz).</span>` : ''}`;
        Utils.toast(`${tpl.label}: ${ok} kayıt içe aktarıldı.`);
      } catch (err) {
        statusEl.innerHTML = `<span class="text-danger">Hata: ${err.message}</span>`;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportAllToExcel() {
    const wb = XLSX.utils.book_new();
    Store.KEYS.forEach(key => {
      const data = Store.getAll(key);
      if (!Array.isArray(data)) return;
      const ws = data.length ? XLSX.utils.json_to_sheet(data) : XLSX.utils.aoa_to_sheet([['(veri yok)']]);
      XLSX.utils.book_append_sheet(wb, ws, key.slice(0, 30));
    });
    XLSX.writeFile(wb, `GHG_Envanter_Tum_Veriler_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  window.Modules.excel = {
    render(container) {
      container.innerHTML = `
        <div class="section-card">
          <h5><i class="fa-solid fa-file-export"></i> Tüm Verileri Excel'e Aktar</h5>
          <p class="text-muted small">Tüm veri koleksiyonlarını (üretim, enerji, scope 1/2/3, faktörler, hesaplama sonuçları vb.) tek bir Excel dosyasında, her biri ayrı sayfada dışa aktarır.</p>
          <button class="btn btn-success btn-sm" id="excel-export-all"><i class="fa-solid fa-download"></i> Tüm Verileri İndir (.xlsx)</button>
        </div>
        ${TEMPLATES.map((tpl, i) => `
        <div class="section-card">
          <h5><i class="fa-solid ${tpl.icon}"></i> ${tpl.label}</h5>
          <div class="row align-items-center g-2">
            <div class="col-auto"><button class="btn btn-sm btn-outline-primary btn-tpl-download" data-i="${i}"><i class="fa-solid fa-file-arrow-down"></i> Şablon İndir</button></div>
            <div class="col-auto"><input type="file" class="form-control form-control-sm file-import" data-i="${i}" accept=".xlsx,.xls,.csv"></div>
            <div class="col text-xs" id="import-status-${i}"></div>
          </div>
          <div class="text-xs text-muted mt-1">Kolonlar: ${tpl.headers.join(' | ')}</div>
        </div>`).join('')}`;

      document.getElementById('excel-export-all').addEventListener('click', exportAllToExcel);
      container.querySelectorAll('.btn-tpl-download').forEach(btn => {
        btn.addEventListener('click', () => downloadTemplate(TEMPLATES[Number(btn.dataset.i)]));
      });
      container.querySelectorAll('.file-import').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const i = Number(inp.dataset.i);
          const file = e.target.files[0];
          if (file) handleImport(TEMPLATES[i], file, document.getElementById(`import-status-${i}`));
        });
      });
    }
  };
})();
