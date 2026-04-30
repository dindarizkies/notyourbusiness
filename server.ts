import express from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000; // Menggunakan port environment jika tersedia

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper functions
const trimOdooProduct = (val: any) => {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  return (s.length > 3 && s[2] === ' ') ? s.substring(3).trim() : s;
};

const cleanForMatch = (val: any) => {
  if (val === null || val === undefined) return "";
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

// API Endpoint - Sekarang menggunakan penamaan POT secara internal
app.post('/api/convert', upload.fields([
  { name: 'odooFile', maxCount: 1 },
  { name: 'potFile', maxCount: 1 } // Diganti dari sotFile ke potFile
]), (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    if (!files.odooFile || !files.potFile) {
      return res.status(400).json({ error: 'Both Odoo and POT files are required.' });
    }

    const odooBuffer = files.odooFile[0].buffer;
    const potBuffer = files.potFile[0].buffer;

    // --- PROSES ODOO ---
    const wbOdoo = xlsx.read(odooBuffer, { type: 'buffer' });
    const dfOdoo: any[] = xlsx.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]]);

    const processedOdoo = dfOdoo.map(row => ({
      ...row,
      match_po: cleanForMatch(row['order_id']),
      match_mat: cleanForMatch(trimOdooProduct(row['product_id']))
    }));

    // --- PROSES POT ---
    const wbPot = xlsx.read(potBuffer, { type: 'buffer' });
    const potDatabase: { [key: string]: any } = {};

    wbPot.SheetNames.forEach(sheetName => {
      const dfPot: any[] = xlsx.utils.sheet_to_json(wbPot.Sheets[sheetName]);
      if (dfPot.length === 0) return;

      const headerRow = dfPot[0];
      const columnNames = Object.keys(headerRow);
      const c_po = columnNames.find(c => String(c).toUpperCase().includes('PURCHASE ORDER'));
      const c_mat = columnNames.find(c => String(c).toUpperCase().includes('MATERIAL'));

      if (c_po && c_mat) {
        dfPot.forEach(row => {
          const key = `${cleanForMatch(row[c_po])}_${cleanForMatch(row[c_mat])}`;
          potDatabase[key] = {
            status: row['Status'] || '',
            item_status: row['ITEM STATUS'] || '',
            est: row['ESTIMATED RECEIVED BY DEALERS (Date)_Details'] || '',
            remarks: row['REMARKS'] || ''
          };
        });
      }
    });

    // --- VLOOKUP Logic ---
    const finalData = processedOdoo
      .map(row => {
        const key = `${row.match_po}_${row.match_mat}`;
        const potVal = potDatabase[key];
        return potVal ? {
          'id': row['id'] || '',
          'status': potVal.status,
          'item_status': potVal.item_status,
          'estimated_received': potVal.est,
          'remarks': potVal.remarks
        } : null;
      })
      .filter(item => item !== null);

    if (finalData.length === 0) {
      return res.status(400).json({ error: 'No matching data found between Odoo and POT.' });
    }

    const wbOutput = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wbOutput, xlsx.utils.json_to_sheet(finalData), 'SIAP_IMPORT');
    
    const outputBuffer = xlsx.write(wbOutput, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=SIAP_IMPORT_POT_FINAL.xlsx');
    res.send(outputBuffer);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();