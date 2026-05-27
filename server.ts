import express from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ─── Helper: cari kolom secara case-insensitive ───────────────────────────────
const findCol = (keys: string[], candidates: string[]): string | undefined => {
  const lowerKeys = keys.map(k => k.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lowerKeys.indexOf(c.toLowerCase().trim());
    if (idx !== -1) return keys[idx];
  }
  // Partial match fallback
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
};

// ─── Helper: bersihkan string untuk matching ─────────────────────────────────
const cleanForMatch = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

// ─── Helper: ekstrak product/material key dari berbagai format Odoo ───────────
// Format 1 (Technical/External ID): "__export__.product_product_82210_3f10c400"
//   → ini adalah internal DB id, TIDAK bisa di-match langsung dengan kode material POT
//   → perlu file Odoo yang di-export dengan kolom "Product" dalam format display name
// Format 2 (Display name): "[8890CN] TE Buffer Solution pH 8.0"
//   → strip prefix "[kode] " → "8890CN" atau pakai kode-nya langsung
// Format 3 (Kode langsung): "8890CN"
//   → langsung dipakai
const extractProductKey = (val: string): string => {
  if (!val) return '';
  const s = val.trim();

  // Format __export__.xxx → kembalikan apa adanya (tidak bisa di-match dengan POT)
  if (s.startsWith('__export__')) {
    // Ambil angka terakhir sebelum underscore-hash sebagai fallback key
    const m = s.match(/product_product_(\d+)/i);
    return m ? m[1] : s;
  }

  // Format "[KODE] Nama Produk" → ambil KODE
  const bracketMatch = s.match(/^\[([^\]]+)\]/);
  if (bracketMatch) return bracketMatch[1].trim();

  // Format "XX Nama Produk" (prefix 2 karakter + spasi) → strip prefix
  if (s.length > 3 && s[2] === ' ') {
    return s.substring(3).trim();
  }

  return s;
};

// ─── Helper: ekstrak PO key dari Order Reference Odoo ────────────────────────
// Format technical: "__export__.purchase_order_11557_87c5b20f" → "11557"
// Format display  : "PO/2024/0001" atau "2504535" → langsung dipakai
const extractPoKey = (val: string): string => {
  if (!val) return '';
  const s = val.trim();
  if (s.startsWith('__export__')) {
    const m = s.match(/purchase_order_(\d+)/i);
    return m ? m[1] : s;
  }
  return s;
};

// ─── API Endpoint ─────────────────────────────────────────────────────────────
app.post('/api/convert', upload.fields([
  { name: 'odooFile', maxCount: 1 },
  { name: 'potFile', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files.odooFile || !files.potFile) {
      return res.status(400).json({ error: 'Kedua file (Odoo & POT) wajib diupload.' });
    }

    // ── Baca file Odoo ──
    const wbOdoo     = xlsx.read(files.odooFile[0].buffer, { type: 'buffer' });
    const dfOdoo: any[] = xlsx.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]]);

    if (dfOdoo.length === 0) {
      return res.status(400).json({ error: 'File Odoo kosong atau tidak bisa dibaca.' });
    }

    const odooKeys = Object.keys(dfOdoo[0]);

    // Deteksi kolom ID (untuk output)
    const colId = findCol(odooKeys, [
      'external id', 'external_id', 'id',
    ]);

    // Deteksi kolom Order/PO
    const colOrder = findCol(odooKeys, [
      'order_id', 'order reference', 'order_reference',
      'purchase order', 'po number', 'po_number', 'no po',
    ]);

    // Deteksi kolom Produk/Material
    const colProduct = findCol(odooKeys, [
      'product_id', 'product', 'product name',
      'material', 'material id', 'item', 'sku', 'kode produk',
    ]);

    console.log(`[Odoo] Kolom → id:"${colId}", order:"${colOrder}", product:"${colProduct}"`);
    console.log(`[Odoo] Semua kolom: ${odooKeys.join(' | ')}`);

    if (!colOrder || !colProduct) {
      return res.status(400).json({
        error:
          `Kolom Odoo tidak dikenali. Kolom tersedia: [${odooKeys.join(', ')}]. ` +
          `Diperlukan kolom PO (misal: "Order Reference" / "order_id") ` +
          `dan kolom Produk (misal: "Product" / "product_id").`
      });
    }

    // Deteksi apakah format Odoo = External ID (tidak bisa match langsung ke POT material code)
    const sampleProduct = String(dfOdoo[0][colProduct] ?? '');
    const isExternalIdFormat = sampleProduct.startsWith('__export__');

    if (isExternalIdFormat) {
      console.warn(
        `[Odoo] PERHATIAN: Kolom "${colProduct}" berisi External ID Odoo (format __export__...).` +
        ` Matching akan menggunakan ID numerik internal. ` +
        `Untuk hasil terbaik, export Odoo menggunakan kolom "Product" dalam format Display Name (misal: "[KODE] Nama Produk").`
      );
    }

    const processedOdoo = dfOdoo.map(row => ({
      ...row,
      _po_key:  cleanForMatch(extractPoKey(String(row[colOrder!] ?? ''))),
      _mat_key: cleanForMatch(extractProductKey(String(row[colProduct!] ?? ''))),
    }));

    // ── Baca file POT (semua sheet) ──
    const wbPot = xlsx.read(files.potFile[0].buffer, { type: 'buffer' });
    const potDatabase: Record<string, { status: any; item_status: any; est: any; remarks: any }> = {};
    let potRowCount = 0;

    wbPot.SheetNames.forEach(sheetName => {
      const dfPot: any[] = xlsx.utils.sheet_to_json(wbPot.Sheets[sheetName]);
      if (dfPot.length === 0) return;

      const potKeys = Object.keys(dfPot[0]);

      const c_po  = findCol(potKeys, [
        'purchase order number', 'purchase order', 'po number',
        'po_number', 'no po', 'nomor po', 'order_id',
      ]);
      const c_mat = findCol(potKeys, [
        'material', 'material id', 'part number', 'part no',
        'product', 'item', 'article', 'sku', 'kode',
      ]);

      if (!c_po || !c_mat) {
        console.warn(`[POT Sheet:"${sheetName}"] Kolom PO/Material tidak ditemukan. Kolom: ${potKeys.join(', ')}`);
        return;
      }

      const c_status      = findCol(potKeys, ['status']);
      const c_item_status = findCol(potKeys, ['item status', 'item_status']);
      const c_est         = findCol(potKeys, [
        'estimated received by dealers (date)_details',
        'estimated received', 'est received', 'eta', 'estimated date', 'tanggal estimasi',
      ]);
      const c_remarks     = findCol(potKeys, ['remarks', 'catatan', 'keterangan', 'note', 'notes']);

      console.log(`[POT Sheet:"${sheetName}"] po="${c_po}", mat="${c_mat}", est="${c_est}", status="${c_status}"`);

      dfPot.forEach(row => {
        const k_po  = cleanForMatch(String(row[c_po!] ?? ''));
        const k_mat = cleanForMatch(String(row[c_mat!] ?? ''));
        if (!k_po && !k_mat) return;

        const val = {
          status:      c_status      ? (row[c_status!]      ?? '') : '',
          item_status: c_item_status ? (row[c_item_status!] ?? '') : '',
          est:         c_est         ? (row[c_est!]          ?? '') : '',
          remarks:     c_remarks     ? (row[c_remarks!]      ?? '') : '',
        };

        // Index dengan 3 strategi key:
        // 1) PO + Material (paling akurat)
        const keyFull = `PO_${k_po}__MAT_${k_mat}`;
        // 2) Material saja (fallback jika PO format beda)
        const keyMat  = `MAT_${k_mat}`;
        // 3) PO saja (fallback terakhir)
        const keyPo   = `PO_${k_po}`;

        if (!potDatabase[keyFull]) potDatabase[keyFull] = val;
        if (!potDatabase[keyMat])  potDatabase[keyMat]  = val;
        if (!potDatabase[keyPo])   potDatabase[keyPo]   = val;

        potRowCount++;
      });
    });

    console.log(`[POT] Total rows: ${potRowCount}, total keys: ${Object.keys(potDatabase).length}`);

    if (potRowCount === 0) {
      return res.status(400).json({ error: 'File POT kosong atau format kolom tidak dikenali.' });
    }

    // ── Matching ──
    let matchFull = 0, matchMat = 0, matchPo = 0, noMatch = 0;
    const finalData = processedOdoo
      .map(row => {
        const kFull = `PO_${row._po_key}__MAT_${row._mat_key}`;
        const kMat  = `MAT_${row._mat_key}`;
        const kPo   = `PO_${row._po_key}`;

        let potVal = potDatabase[kFull];
        if (potVal) { matchFull++; }
        else {
          potVal = potDatabase[kMat];
          if (potVal) { matchMat++; }
          else {
            potVal = potDatabase[kPo];
            if (potVal) { matchPo++; }
            else { noMatch++; return null; }
          }
        }

        return {
          'id':                 colId ? (row[colId] ?? '') : '',
          'status':             potVal.status,
          'item_status':        potVal.item_status,
          'estimated_received': potVal.est,
          'remarks':            potVal.remarks,
        };
      })
      .filter(item => item !== null);

    console.log(`[Match] PO+Mat: ${matchFull} | Mat only: ${matchMat} | PO only: ${matchPo} | No match: ${noMatch}`);
    console.log(`[Result] ${finalData.length} baris akan diexport`);

    if (finalData.length === 0) {
      const hint = isExternalIdFormat
        ? ' HINT: File Odoo menggunakan format External ID (__export__...) yang tidak bisa di-match langsung ke kode material di POT. ' +
          'Silakan export ulang file Odoo dari menu "Purchase Order Lines" dengan memilih kolom "Product" (bukan external ID).'
        : '';

      return res.status(400).json({
        error:
          `Tidak ada data yang cocok antara file Odoo dan POT. ` +
          `Odoo: ${processedOdoo.length} baris. POT: ${potRowCount} baris.` +
          hint
      });
    }

    // ── Export ──
    const wbOutput = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wbOutput, xlsx.utils.json_to_sheet(finalData), 'SIAP_IMPORT');
    const outputBuffer = xlsx.write(wbOutput, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=SIAP_IMPORT_ODOO_FINAL.xlsx');
    res.send(outputBuffer);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: `Server error: ${(error as Error).message}` });
  }
});

// ─── Dev / Prod server ────────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, _res) => _res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
