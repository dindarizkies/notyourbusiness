import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Log { type: 'info' | 'warn' | 'success' | 'error'; msg: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const superclean = (val: any): string =>
  String(val ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const formatDate = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
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
async function convert(odooFile: File, sotFile: File, log: (l: Log) => void): Promise<Blob> {

  // ── Step 1: Baca SOT ──
  const sotBuf = await readBuffer(sotFile);
  const wbSot  = XLSX.read(sotBuf, { type: 'array', cellDates: true });

  const sotIndex: Record<string, {
    status: string; item_status: string; estimated_received: string; remarks: string;
  }> = {};

  let sotRows = 0;

  for (const sheetName of wbSot.SheetNames) {
    const rows: any[] = XLSX.utils.sheet_to_json(wbSot.Sheets[sheetName], { raw: false });
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]);

    const colPO = cols.find(c =>
      c.toUpperCase().includes('PURCHASE') && c.toUpperCase().includes('ORDER') && c.toUpperCase().includes('NUMBER')
    ) ?? cols.find(c => c.toUpperCase().includes('PURCHASE') && c.toUpperCase().includes('ORDER'));

    const colMat = cols.find(c => c.toUpperCase().trim() === 'MATERIAL');

    if (!colPO || !colMat) continue;

    const colStatus = cols.find(c => c.trim() === 'Status' || c.trim() === 'STATUS');
    const colIStatus = cols.find(c =>
      c.toUpperCase().replace(/\s/g, '') === 'ITEMSTATUS' ||
      (c.toUpperCase().includes('ITEM') && c.toUpperCase().includes('STATUS'))
    );
    const colEst = cols.find(c => {
      const u = c.toUpperCase();
      return u.includes('ESTIMATED') && u.includes('RECEIVED');
    });
    const colRemarks = cols.find(c => c.toUpperCase().trim() === 'REMARKS');

    for (const row of rows) {
      const po  = String(row[colPO!]  ?? '').trim();
      const mat = String(row[colMat!] ?? '').trim();
      if (!po && !mat) continue;

      const key = superclean(po) + '__' + superclean(mat);

      if (!sotIndex[key]) {
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

  log({ type: 'info', msg: `SOT selesai: ${sotRows} baris diproses | ${Object.keys(sotIndex).length} kombinasi unik.` });

  if (sotRows === 0) {
    throw new Error('File SOT kosong atau kolom "Purchase order number" & "Material" tidak ditemukan.');
  }

  // ── Step 2: Baca Odoo ──
  const odooBuf = await readBuffer(odooFile);
  let odooRows: any[] = [];
  const ext = odooFile.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const wbOdoo = XLSX.read(odooBuf, { type: 'array' });
    odooRows = XLSX.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]], { raw: false });
  } else {
    const wbOdoo = XLSX.read(odooBuf, { type: 'array', cellDates: true });
    odooRows = XLSX.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]], { raw: false });
  }

  if (odooRows.length === 0) throw new Error('File Odoo kosong/tidak terbaca.');

  const cols = Object.keys(odooRows[0]);
  const colId = cols.find(c => c === 'id') ?? cols.find(c => c.toUpperCase().includes('EXTERNAL') && c.toUpperCase().includes('ID')) ?? cols[0];
  const colOrderId = cols.find(c => c === 'order_id') ?? cols.find(c => c.toUpperCase().includes('ORDER') && c.toUpperCase().includes('ID')) ?? cols.find(c => c.toUpperCase().includes('ORDER'));
  const colProdId = cols.find(c => c === 'product_id') ?? cols.find(c => c.toUpperCase().includes('PRODUCT') && c.toUpperCase().includes('ID')) ?? cols.find(c => c.toUpperCase().includes('PRODUCT'));

  if (!colOrderId || !colProdId) throw new Error('Kolom order_id atau product_id tidak ditemukan di Odoo.');

  // ── Step 3: Looping & Filtering ──
  let matched = 0, noMatch = 0, skippedBiaya = 0, skippedTBD = 0;
  const result: any[] = [];
  const noMatchKeys: string[] = [];

  for (const row of odooRows) {
    const orderVal = String(row[colOrderId] ?? '').trim();
    const rawProdVal = String(row[colProdId] ?? '').trim();

    // 1. SKIP BIAYA
    if (rawProdVal.toUpperCase().includes('BIAYA')) {
      skippedBiaya++;
      continue;
    }

    const prodVal = rawProdVal.replace(/^[A-Za-z]+\s+/, '').trim();
    const cleanOrder = superclean(orderVal);
    const cleanProd  = superclean(prodVal);

    let hit = sotIndex[cleanOrder + '__' + cleanProd];

    if (!hit) {
      const numericOrder = orderVal.replace(/[^0-9]/g, '');
      if (numericOrder) {
        hit = sotIndex[superclean(numericOrder) + '__' + cleanProd];
      }
    }

    // 2. SKIP PO YANG TIDAK MATCH
    if (!hit) {
      noMatch++;
      if (noMatchKeys.length < 5) noMatchKeys.push(`PO:${orderVal} | Mat:${prodVal}`);
      continue; 
    }

    const estReceivedDate = hit.estimated_received ?? '';

    // 3. SKIP TANGGAL YANG ADA TULISAN "TBD"
    if (estReceivedDate.toUpperCase().includes('TBD')) {
      skippedTBD++;
      continue;
    }

    // JIKA LOLOS SEMUA FILTER, MASUKKAN KE RESULT
    matched++;
    result.push({
      'id':                 String(row[colId] ?? '').trim(),
      'status':             hit.status             ?? '',
      'item_status':        hit.item_status        ?? '',
      'estimated_received': estReceivedDate,
      'remarks':            hit.remarks            ?? '',
    });
  }

  log({
    type: matched > 0 ? 'success' : 'warn',
    msg:  `✓ ${matched} diexport | ✗ ${noMatch} PO tak match | ⊘ ${skippedBiaya} BIAYA | ⊘ ${skippedTBD} TBD (di-skip)`,
  });

  if (noMatch > 0 && noMatchKeys.length > 0) {
    log({ type: 'warn', msg: `Sample PO yg tidak match & dibuang: ${noMatchKeys.join(', ')}` });
  }

  if (matched === 0) throw new Error('Tidak ada data yang cocok untuk di-export.');

  // ── Export Template C ──
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(result, { header: ['id', 'status', 'item_status', 'estimated_received', 'remarks'] });
  ws['!cols'] = [{ wch: 48 }, { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 40 }];
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 20 }}>// Panduan</p>
              {[
                ['Template A (Odoo)', 'Export Purchase Order Lines dari Odoo dalam format CSV atau XLSX. Wajib ada kolom: id, order_id, product_id.'],
                ['Template B (SOT)', 'File SOT terbaru (semua sheet di-scan otomatis). Butuh kolom "Purchase order number" & "Material" sebagai kunci matching.'],
                ['Convert & Download', 'VLOOKUP order_id ↔ Purchase order number, product_id ↔ Material. Data yg tidak ada di SOT dan yg statusnya TBD akan di-skip otomatis.'],
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
                    ['Skip',            'Baris BIAYA, PO tidak match, & TBD'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap', paddingRight: 12 }}>{k}</td>
                      <td style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', color: 'var(--accent2)', textAlign: 'right' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
