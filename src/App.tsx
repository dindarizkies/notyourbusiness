import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Log { type: 'info' | 'warn' | 'success' | 'error'; msg: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Uppercase + hapus spasi dan karakter non-alphanumeric → untuk fuzzy matching
const superclean = (val: any): string =>
  String(val ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Format tanggal Excel serial number atau Date object ke string "YYYY-MM-DD"
const formatDate = (val: any): string => {
  if (!val) return '';
  // Sudah string → kembalikan langsung
  if (typeof val === 'string') return val.trim();
  // Date object (openpyxl / SheetJS kadang parse otomatis)
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Excel serial number (SheetJS dengan raw:true)
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return String(val).trim();
};

const readBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target!.result as ArrayBuffer);
    r.onerror = () => rej(new Error('Gagal membaca file'));
    r.readAsArrayBuffer(file);
  });

// ─── Konversi ─────────────────────────────────────────────────────────────────
//
// ALUR:
// 1. Baca Template B (SOT XLSX) → index by key: superclean(PO) + '__' + superclean(Material)
//    Kolom di SOT:
//      - Key 1 : "Purchase order number"
//      - Key 2 : "Material"
//      - status           : "Status"         (kolom pertama, nama sheet seperti "Ready Stock Within This Week")
//      - item_status      : "ITEM STATUS"
//      - estimated_received: "ESTIMATED RECEIVED BY DEALERS (Date)_Details"
//      - remarks          : "REMARKS"
//
// 2. Baca Template A (Odoo CSV/XLSX) → loop tiap baris
//    Kolom di Odoo:
//      - id         : "id"
//      - order_id   : "order_id"   → di-match ke "Purchase order number" SOT
//      - product_id : "product_id" → di-match ke "Material" SOT
//
// 3. Skip baris yang product_id mengandung "BIAYA"
// 4. VLOOKUP: key = superclean(order_id) + '__' + superclean(product_id)
// 5. Output per baris: id, status, item_status, estimated_received, remarks
//    (baris tanpa match tetap ada, kolom dikosongkan)

async function convert(odooFile: File, sotFile: File, log: (l: Log) => void): Promise<Blob> {

  // ── Step 1: Baca SOT → bangun index ────────────────────────────────────────
  const sotBuf = await readBuffer(sotFile);
  // cellDates: false agar tanggal tetap sebagai serial number, kita format sendiri
  const wbSot  = XLSX.read(sotBuf, { type: 'array', cellDates: true });

  const sotIndex: Record<string, {
    status: string; item_status: string; estimated_received: string; remarks: string;
  }> = {};

  let sotRows = 0;

  for (const sheetName of wbSot.SheetNames) {
    const rows: any[] = XLSX.utils.sheet_to_json(wbSot.Sheets[sheetName], { raw: false });
    if (rows.length === 0) {
      log({ type: 'warn', msg: `Sheet "${sheetName}": kosong — dilewati` });
      continue;
    }

    const cols = Object.keys(rows[0]);

    // ── Mapping kolom SOT ──
    // Kunci matching
    const colPO = cols.find(c =>
      c.toUpperCase().includes('PURCHASE') && c.toUpperCase().includes('ORDER') && c.toUpperCase().includes('NUMBER')
    ) ?? cols.find(c => c.toUpperCase().includes('PURCHASE') && c.toUpperCase().includes('ORDER'));

    const colMat = cols.find(c => c.toUpperCase().trim() === 'MATERIAL');

    if (!colPO || !colMat) {
      log({ type: 'warn', msg: `Sheet "${sheetName}": kolom "Purchase order number" / "Material" tidak ditemukan — dilewati. Kolom: [${cols.slice(0,6).join(', ')}…]` });
      continue;
    }

    // Status = kolom "Status" pertama (nilainya adalah nama sheet / kategori)
    const colStatus = cols.find(c => c.trim() === 'Status' || c.trim() === 'STATUS');

    // Item Status
    const colIStatus = cols.find(c =>
      c.toUpperCase().replace(/\s/g, '') === 'ITEMSTATUS' ||
      (c.toUpperCase().includes('ITEM') && c.toUpperCase().includes('STATUS'))
    );

    // Estimated Received — kolom panjang: "ESTIMATED RECEIVED BY DEALERS (Date)_Details"
    const colEst = cols.find(c => {
      const u = c.toUpperCase();
      return u.includes('ESTIMATED') && u.includes('RECEIVED');
    });

    // Remarks
    const colRemarks = cols.find(c => c.toUpperCase().trim() === 'REMARKS');

    log({ type: 'info', msg: `Sheet "${sheetName}" [${rows.length} baris] PO="${colPO}" | Mat="${colMat}" | Status="${colStatus ?? '—'}" | ItemStatus="${colIStatus ?? '—'}" | Est="${colEst ?? '—'}" | Remarks="${colRemarks ?? '—'}"` });

    for (const row of rows) {
      const po  = String(row[colPO!]  ?? '').trim();
      const mat = String(row[colMat!] ?? '').trim();
      if (!po && !mat) continue;

      const key = superclean(po) + '__' + superclean(mat);

      // Simpan hanya entri pertama (tidak overwrite jika duplikat)
      if (!sotIndex[key]) {
        // Status: jika kolom Status ada dan isinya sama dengan nama sheet (kategori),
        // kita pakai nama sheet sebagai status agar lebih informatif
        const rawStatus = colStatus ? String(row[colStatus] ?? '').trim() : '';
        const statusVal = rawStatus || sheetName;

        sotIndex[key] = {
          status:             statusVal,
          item_status:        colIStatus ? String(row[colIStatus] ?? '').trim() : '',
          estimated_received: colEst     ? formatDate(row[colEst])              : '',
          remarks:            colRemarks ? String(row[colRemarks] ?? '').trim() : '',
        };
      }
      sotRows++;
    }
  }

  log({ type: 'info', msg: `SOT selesai: ${sotRows} baris diproses | ${Object.keys(sotIndex).length} kombinasi PO+Material unik dalam index` });

  if (sotRows === 0) {
    throw new Error('File SOT kosong atau kolom "Purchase order number" & "Material" tidak ditemukan di semua sheet.');
  }

  // ── Step 2: Baca Template A (Odoo) ─────────────────────────────────────────
  const odooBuf = await readBuffer(odooFile);
  let odooRows: any[] = [];

  const ext = odooFile.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    // Parse CSV
    const wbOdoo = XLSX.read(odooBuf, { type: 'array' });
    odooRows = XLSX.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]], { raw: false });
  } else {
    // XLSX / XLS
    const wbOdoo = XLSX.read(odooBuf, { type: 'array', cellDates: true });
    odooRows = XLSX.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]], { raw: false });
  }

  if (odooRows.length === 0) throw new Error('File Odoo (Template A) kosong atau tidak bisa dibaca.');

  const cols = Object.keys(odooRows[0]);

  // Deteksi kolom Odoo:
  // "id" — External ID Odoo, wajib ada
  const colId = cols.find(c => c === 'id')
    ?? cols.find(c => c.toUpperCase().includes('EXTERNAL') && c.toUpperCase().includes('ID'))
    ?? cols[0];

  // "order_id" — nomor PO Odoo, di-match ke "Purchase order number" SOT
  const colOrderId = cols.find(c => c === 'order_id')
    ?? cols.find(c => c.toUpperCase().includes('ORDER') && c.toUpperCase().includes('ID'))
    ?? cols.find(c => c.toUpperCase().includes('ORDER'));

  // "product_id" — kode material, di-match ke "Material" SOT
  const colProdId = cols.find(c => c === 'product_id')
    ?? cols.find(c => c.toUpperCase().includes('PRODUCT') && c.toUpperCase().includes('ID'))
    ?? cols.find(c => c.toUpperCase().includes('PRODUCT'));

  log({ type: 'info', msg: `Odoo: ${odooRows.length} baris | id="${colId}" | order_id="${colOrderId ?? '—'}" | product_id="${colProdId ?? '—'}"` });
  const sampleProduct = String(odooRows[0]?.[colProdId] ?? '').trim();
const sampleTrimmed = sampleProduct.replace(/^[A-Za-z]+\s+/, '').trim();

log({
  type: 'info',
  msg: `Pre-processing product_id aktif: "${sampleProduct}" -> "${sampleTrimmed}"`
});

  if (!colOrderId) throw new Error(`Kolom order_id tidak ditemukan. Kolom tersedia: [${cols.join(', ')}]`);
  if (!colProdId)  throw new Error(`Kolom product_id tidak ditemukan. Kolom tersedia: [${cols.join(', ')}]`);

  // ── Step 3-5: Loop, skip BIAYA, VLOOKUP, bangun output ─────────────────────
  let matched = 0, noMatch = 0, skipped = 0;
  const result: any[] = [];
  const noMatchKeys: string[] = [];

  for (const row of odooRows) {

  const orderVal = String(row[colOrderId] ?? '').trim();

  // Nilai asli product_id dari Template A
  const rawProdVal = String(row[colProdId] ?? '').trim();

  // Skip BIAYA sebelum trimming
  if (rawProdVal.toUpperCase().includes('BIAYA')) {
    skipped++;
    continue;
  }

  // Hapus prefix material:
  // FI 8890CN -> 8890CN
  // QSP T112NXLRL-Q -> T112NXLRL-Q
  // MBP 7010-CS -> 7010-CS
  const prodVal = rawProdVal.replace(/^[A-Za-z]+\s+/, '').trim();

  // Matching menggunakan product_id yang sudah dipangkas
  const cleanOrder = superclean(orderVal);
  const cleanProd  = superclean(prodVal);

    let hit = sotIndex[cleanOrder + '__' + cleanProd];

    // Fallback: order_id di Odoo prefix "P-" → coba strip prefix P angka-angka
    if (!hit) {
      // Ambil hanya angka dari order_id (misal "P-2611626" → "2611626")
      const numericOrder = orderVal.replace(/[^0-9]/g, '');
      if (numericOrder) {
        hit = sotIndex[superclean(numericOrder) + '__' + cleanProd];
      }
    }

    if (hit) {
      matched++;
    } else {
      noMatch++;
      if (noMatchKeys.length < 10) {
  noMatchKeys.push(
    `order="${orderVal}" product="${rawProdVal}" -> "${prodVal}"`
  );
}
    }

    result.push({
      'id':                 String(row[colId] ?? '').trim(),
      'status':             hit?.status             ?? '',
      'item_status':        hit?.item_status        ?? '',
      'estimated_received': hit?.estimated_received ?? '',
      'remarks':            hit?.remarks            ?? '',
    });
  }

  log({
    type: matched > 0 ? 'success' : 'warn',
    msg:  `Hasil: ✓ ${matched} cocok | ✗ ${noMatch} tidak ditemukan di SOT | ⊘ ${skipped} baris BIAYA dilewati`,
  });

  if (noMatch > 0 && noMatchKeys.length > 0) {
    log({ type: 'warn', msg: `Contoh tidak cocok: ${noMatchKeys.slice(0, 5).join(' | ')}` });
    log({ type: 'info', msg: `Tip: Pastikan nomor PO di Odoo (order_id) cocok dengan kolom "Purchase order number" di SOT.` });
  }

  log({ type: 'success', msg: `${result.length} baris siap diexport sebagai Template C (siap import Odoo)!` });

  // ── Export Template C ───────────────────────────────────────────────────────
  // Kolom output: id, status, item_status, estimated_received, remarks
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(result, {
    header: ['id', 'status', 'item_status', 'estimated_received', 'remarks'],
  });

  // Set lebar kolom agar nyaman dibaca
  ws['!cols'] = [
    { wch: 48 }, // id
    { wch: 30 }, // status
    { wch: 20 }, // item_status
    { wch: 22 }, // estimated_received
    { wch: 40 }, // remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'SIAP_IMPORT');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── Dropzone Component ───────────────────────────────────────────────────────
function Dropzone({ label, sublabel, file, accept, onFile, icon }: {
  label: string; sublabel: string; file: File | null;
  accept: string; onFile: (f: File) => void; icon: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 8, letterSpacing: '.06em' }}>{label}</p>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          border: `1.5px ${file ? 'solid' : 'dashed'} ${file ? 'rgba(59,130,246,.4)' : drag ? 'var(--accent)' : 'var(--border)'}`,
          background: file ? 'rgba(59,130,246,.05)' : drag ? 'rgba(59,130,246,.06)' : 'transparent',
          borderRadius: 12, padding: '20px 16px', cursor: 'pointer', transition: 'all .2s',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center',
        }}
      >
        <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        <span style={{ fontSize: 28, lineHeight: 1, marginBottom: 4 }}>{file ? '✅' : icon}</span>
        {file ? <>
          <span style={{ fontSize: 12, color: 'var(--accent2)', fontFamily: 'var(--mono)', fontWeight: 500, wordBreak: 'break-all' }}>{file.name}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{(file.size / 1024).toFixed(1)} KB</span>
        </> : <>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Klik atau drag file di sini</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{sublabel}</span>
        </>}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [odooFile, setOdooFile] = useState<File | null>(null);
  const [sotFile,  setSotFile]  = useState<File | null>(null);
  const [status,   setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [logs,     setLogs]     = useState<Log[]>([]);
  const [errMsg,   setErrMsg]   = useState('');

  const addLog = (l: Log) => setLogs(p => [...p, l]);

  const handleConvert = async () => {
    if (!odooFile || !sotFile) return;
    setStatus('processing'); setLogs([]); setErrMsg('');
    try {
      const blob = await convert(odooFile, sotFile, addLog);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'SIAP_IMPORT_ODOO_FINAL.xlsx';
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);
      setStatus('done');
    } catch (e: any) {
      setErrMsg(e.message); setStatus('error');
      addLog({ type: 'error', msg: e.message });
    }
  };

  const logColor = { info: '#94a3b8', warn: '#f59e0b', success: '#10b981', error: '#ef4444' };
  const logIcon  = { info: '›', warn: '⚠', success: '✓', error: '✗' };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0b0f1a; --surface: #111827; --border: #1f2d45;
          --accent: #3b82f6; --accent2: #06b6d4; --green: #10b981;
          --yellow: #f59e0b; --red: #ef4444; --text: #e2e8f0; --muted: #64748b;
          --mono: 'DM Mono', monospace; --sans: 'Syne', sans-serif;
        }
        body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; }
        body::before {
          content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: linear-gradient(rgba(59,130,246,.04) 1px,transparent 1px),
                            linear-gradient(90deg,rgba(59,130,246,.04) 1px,transparent 1px);
          background-size: 40px 40px;
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin  { to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.25)',
            color: 'var(--accent2)', fontFamily: 'var(--mono)', fontSize: 11,
            letterSpacing: '.12em', padding: '5px 14px', borderRadius: 100,
            marginBottom: 20, textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent2)', animation: 'pulse 2s infinite', display: 'inline-block' }} />
            🚀 Auto-Convert Engine · ELO KARSA
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1 }}>
            Odoo × SOT <span style={{ color: 'var(--accent)' }}>Smart-Sync</span>
          </h1>
          <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 15, lineHeight: 1.6 }}>
            Upload <strong style={{ color: 'var(--text)' }}>Template A</strong> (tarikan Odoo) +{' '}
            <strong style={{ color: 'var(--text)' }}>Template B</strong> (SOT) → otomatis generate{' '}
            <strong style={{ color: 'var(--green)' }}>Template C</strong> siap import kembali ke Odoo.
          </p>
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>

          {/* Left: Upload */}
          <div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 20 }}>// Upload Files</p>

              <Dropzone
                label="01 — Template A · Tarikan Odoo (CSV / XLSX)"
                sublabel=".csv · .xlsx · .xls  |  Wajib ada kolom: id, order_id, product_id"
                file={odooFile} accept=".csv,.xlsx,.xls" icon="📄"
                onFile={f => { setOdooFile(f); setStatus('idle'); setLogs([]); }}
              />

              <Dropzone
                label="02 — Template B · File SOT (XLSX)"
                sublabel=".xlsx · .xls  |  Semua sheet di-scan otomatis"
                file={sotFile} accept=".xlsx,.xls" icon="📊"
                onFile={f => { setSotFile(f); setStatus('idle'); setLogs([]); }}
              />

              <button
                onClick={handleConvert}
                disabled={!odooFile || !sotFile || status === 'processing'}
                style={{
                  width: '100%', padding: 15, border: 'none', borderRadius: 12, marginTop: 8,
                  background: 'linear-gradient(135deg,var(--accent),var(--accent2))',
                  color: '#fff', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 700,
                  letterSpacing: '.04em', textTransform: 'uppercase', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  opacity: (!odooFile || !sotFile || status === 'processing') ? .4 : 1,
                  boxShadow: '0 4px 24px rgba(59,130,246,.3)', transition: 'all .2s',
                }}
              >
                {status === 'processing'
                  ? <><span style={{ animation: 'spin .8s linear infinite', display: 'inline-block' }}>⟳</span> Processing…</>
                  : <><span>↓</span> Convert & Download Template C</>}
              </button>

              {status === 'done' && (
                <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, fontSize: 13,
                  background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', color: 'var(--green)' }}>
                  ✓ Berhasil! <strong>SIAP_IMPORT_ODOO_FINAL.xlsx</strong> sudah terunduh — siap di-import ke Odoo.
                </div>
              )}
              {status === 'error' && (
                <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, fontSize: 13,
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--red)' }}>
                  ⚠ {errMsg}
                </div>
              )}
            </div>

            {/* Log */}
            {logs.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginTop: 16 }}>
                <p style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 16 }}>// Processing Log</p>
                <div style={{ background: '#070c14', border: '1px solid var(--border)', borderRadius: 12, padding: 16, fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7, maxHeight: 300, overflowY: 'auto' }}>
                  {logs.map((l, i) => (
                    <div key={i} style={{ color: logColor[l.type] }}>{logIcon[l.type]} {l.msg}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Panduan */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 20 }}>// Panduan</p>
              {[
                ['Template A (Odoo)', 'Export Purchase Order Lines dari Odoo dalam format CSV atau XLSX. Wajib ada kolom: id, order_id, product_id.'],
                ['Template B (SOT)', 'File SOT terbaru (semua sheet di-scan otomatis). Butuh kolom "Purchase order number" & "Material" sebagai kunci matching.'],
                ['Convert & Download', 'VLOOKUP order_id ↔ Purchase order number, product_id ↔ Material. Otomatis isi 4 kolom. Baris BIAYA dilewati. Hasil = Template C siap import Odoo.'],
              ].map(([title, desc], i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)',
                    color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginTop: 1,
                  }}>{i + 1}</span>
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text)' }}>{title}</strong> — {desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Mapping Kolom */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 20 }}>// Mapping Kolom</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
                <tbody>
                  {[
                    ['Template A key',   'order_id  +  product_id'],
                    ['Template B key',   'Purchase order number  +  Material'],
                    ['→ status',         '← Status (nama sheet SOT)'],
                    ['→ item_status',    '← ITEM STATUS'],
                    ['→ est. received',  '← ESTIMATED RECEIVED BY DEALERS'],
                    ['→ remarks',        '← REMARKS'],
                    ['Output (C)',       'id · status · item_status · est_received · remarks'],
                    ['Skip',            'Baris product_id mengandung "BIAYA"'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap', paddingRight: 12 }}>{k}</td>
                      <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', color: 'var(--accent2)', textAlign: 'right' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Output Preview */}
            <div style={{ background: 'var(--surface)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: 16 }}>// Output Template C</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, fontFamily: 'var(--mono)' }}>
                File hasil: <span style={{ color: 'var(--text)' }}>SIAP_IMPORT_ODOO_FINAL.xlsx</span><br />
                Sheet: <span style={{ color: 'var(--accent2)' }}>SIAP_IMPORT</span><br /><br />
                Kolom output:<br />
                <span style={{ color: 'var(--green)' }}>
                  id · status · item_status<br />
                  estimated_received · remarks
                </span>
              </p>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 56, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.08em' }}>
          SERVING YOU BETTER · CREATED BY IT TEAM ELOKARSA · 2026
        </p>
      </div>
    </>
  );
}
