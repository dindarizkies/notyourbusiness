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

// Set up multer for in-memory file storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper functions for Excel processing
const trimOdooProduct = (val: any) => {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (s.length > 3 && s[2] === ' ') {
    return s.substring(3).trim();
  }
  return s;
};

const cleanForMatch = (val: any) => {
  if (val === null || val === undefined) return "";
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

// API Endpoint for conversion
app.post('/api/convert', upload.fields([
  { name: 'odooFile', maxCount: 1 },
  { name: 'sotFile', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    if (!files.odooFile || !files.sotFile) {
      return res.status(400).json({ error: 'Both Odoo and SOT files are required.' });
    }

    const odooBuffer = files.odooFile[0].buffer;
    const sotBuffer = files.sotFile[0].buffer;

    // --- PROSES ODOO ---
    const wbOdoo = xlsx.read(odooBuffer, { type: 'buffer' });
    const sheetOdooName = wbOdoo.SheetNames[0];
    const dfOdoo: any[] = xlsx.utils.sheet_to_json(wbOdoo.Sheets[sheetOdooName]);

    // Prepare Odoo data with keys
    const processedOdoo = dfOdoo.map(row => {
      const trimmedProduct = trimOdooProduct(row['product_id']);
      return {
        ...row,
        match_po: cleanForMatch(row['order_id']),
        match_mat: cleanForMatch(trimmedProduct)
      };
    });

    // --- PROSES SOT ---
    const wbSot = xlsx.read(sotBuffer, { type: 'buffer' });
    const sotDatabase: { [key: string]: any } = {};

    wbSot.SheetNames.forEach(sheetName => {
      const dfSot: any[] = xlsx.utils.sheet_to_json(wbSot.Sheets[sheetName]);
      if (dfSot.length === 0) return;

      // Identify columns
      const headerRow = dfSot[0];
      const columnNames = Object.keys(headerRow);
      const c_po = columnNames.find(c => String(c).toUpperCase().includes('PURCHASE ORDER'));
      const c_mat = columnNames.find(c => String(c).toUpperCase().includes('MATERIAL'));

      if (c_po && c_mat) {
        dfSot.forEach(row => {
          const k_po = cleanForMatch(row[c_po]);
          const k_mat = cleanForMatch(row[c_mat]);
          const key = `${k_po}_${k_mat}`;
          
          sotDatabase[key] = {
            status: row['Status'] || '',
            item_status: row['ITEM STATUS'] || '',
            est: row['ESTIMATED RECEIVED BY DEALERS (Date)_Details'] || '',
            remarks: row['REMARKS'] || ''
          };
        });
      }
    });

    // --- VLOOKUP & FILTER ---
    const finalData = processedOdoo
      .map(row => {
        const key_o = `${row.match_po}_${row.match_mat}`;
        if (sotDatabase[key_o]) {
          const sotVal = sotDatabase[key_o];
          return {
            'id': row['id'] || '',
            'status': sotVal.status,
            'item_status': sotVal.item_status,
            'estimated_received': sotVal.est,
            'remarks': sotVal.remarks
          };
        }
        return null;
      })
      .filter(item => item !== null);

    if (finalData.length === 0) {
      return res.status(400).json({ error: 'No matching data found between the two files.' });
    }

    // --- EXPORT ---
    const wbOutput = xlsx.utils.book_new();
    const wsOutput = xlsx.utils.json_to_sheet(finalData);
    xlsx.utils.book_append_sheet(wbOutput, wsOutput, 'SIAP_IMPORT');
    
    const outputBuffer = xlsx.write(wbOutput, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=SIAP_IMPORT_ODOO_FINAL.xlsx');
    res.send(outputBuffer);

  } catch (error) {
    console.error('Error processing files:', error);
    res.status(500).json({ error: 'Internal server error processing files.' });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
