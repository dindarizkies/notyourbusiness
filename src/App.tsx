import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProcessingLog {
  type: 'info' | 'warn' | 'success' | 'error';
  msg: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const findCol = (keys: string[], candidates: string[]): string | undefined => {
  const lk = keys.map(k => k.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lk.indexOf(c.toLowerCase().trim());
    if (idx !== -1) return keys[idx];
  }
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
};

const clean = (val: any): string =>
  String(val ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const extractPoKey = (val: string): string => {
  if (!val) return '';
  const m = val.match(/purchase_order_(\d+)/i);
  return m ? m[1] : val.trim();
};

const extractProductKey = (val: string): string => {
  if (!val) return '';
  if (val.startsWith('__export__')) {
    const m = val.match(/product_product_(\d+)/i);
    return m ? m[1] : val;
  }
  const bracket = val.match(/^\[([^\]]+)\]/);
  if (bracket) return bracket[1].trim();
  if (val.length > 3 && val[2] === ' ') return val.substring(3).trim();
  return val.trim();
};

const readFileAsBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target!.result as ArrayBuffer);
    reader.onerror = () => rej(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });

// ─── Core conversion logic ────────────────────────────────────────────────────
async function convertFiles(
  odooFile: File,
  potFile: File,
  log: (l: ProcessingLog) => void
): Promise<Blob> {
  // Read Odoo
  const odrBuf = await readFileAsBuffer(odooFile);
  const wbOdoo = XLSX.read(odrBuf, { type: 'array' });
  const dfOdoo: any[] = XLSX.utils.sheet_to_json(wbOdoo.Sheets[wbOdoo.SheetNames[0]]);

  if (dfOdoo.length === 0) throw new Error('File Odoo kosong atau tidak bisa dibaca.');

  const odooKeys = Object.keys(dfOdoo[0]);
  const colId      = findCol(odooKeys, ['external id', 'external_id', 'id']);
  const colOrder   = findCol(odooKeys, ['order_id', 'order reference', 'order_reference', 'purchase order', 'po number', 'no po']);
  const colProduct = findCol(odooKeys, ['product_id', 'product', 'product name', 'material', 'item', 'sku']);

  log({ type: 'info', msg: `Odoo: ${dfOdoo.length} baris | id="${colId}" | order="${colOrder}" | product="${colProduct}"` });

  if (!colOrder || !colProduct)
    throw new Error(`Kolom Odoo tidak dikenali. Kolom tersedia: [${odooKeys.join(', ')}]. Butuh kolom PO & Produk.`);

  const sampleProd = String(dfOdoo[0][colProduct] ?? '');
  const isExtId = sampleProd.startsWith('__export__');
  if (isExtId) log({ type: 'warn', msg: 'Kolom Product berformat External ID — matching via ID numerik internal.' });

  const processedOdoo = dfOdoo.map(row => ({
    ...row,
    _po:  clean(extractPoKey(String(row[colOrder!] ?? ''))),
    _mat: clean(extractProductKey(String(row[colProduct!] ?? ''))),
  }));

  // Read POT
  const potBuf = await readFileAsBuffer(potFile);
  const wbPot  = XLSX.read(potBuf, { type: 'array' });
  const potDB: Record<string, any> = {};
  let potRows = 0;

  for (const sheetName of wbPot.SheetNames) {
    const dfPot: any[] = XLSX.utils.sheet_to_json(wbPot.Sheets[sheetName]);
    if (dfPot.length === 0) continue;

    const pk   = Object.keys(dfPot[0]);
    const c_po  = findCol(pk, ['purchase order number', 'purchase order', 'po number', 'no po', 'nomor po', 'order_id']);
    const c_mat = findCol(pk, ['material', 'material id', 'part number', 'product', 'item', 'sku', 'kode']);
    if (!c_po || !c_mat) { log({ type: 'warn', msg: `Sheet "${sheetName}": kolom PO/Material tidak ditemukan, dilewati.` }); continue; }

    const c_status = findCol(pk, ['status']);
    const c_istat  = findCol(pk, ['item status', 'item_status']);
    const c_est    = findCol(pk, ['estimated received by dealers (date)_details', 'estimated received', 'eta', 'estimated date']);
    const c_rem    = findCol(pk, ['remarks', 'catatan', 'keterangan', 'note', 'notes']);

    log({ type: 'info', msg: `Sheet "${sheetName}": ${dfPot.length} baris | po="${c_po}" | mat="${c_mat}"` });

    for (const row of dfPot) {
      const kp  = clean(String(row[c_po!]  ?? ''));
      const km  = clean(String(row[c_mat!] ?? ''));
      if (!kp && !km) continue;

      const val = {
        status:      c_status ? (row[c_status] ?? '') : '',
        item_status: c_istat  ? (row[c_istat]  ?? '') : '',
        est:         c_est    ? (row[c_est]     ?? '') : '',
        remarks:     c_rem    ? (row[c_rem]     ?? '') : '',
      };
      const kFull = `${kp}__${km}`;
      const kMat  = `MAT_${km}`;
      const kPo   = `PO_${kp}`;
      if (!potDB[kFull]) potDB[kFull] = val;
      if (!potDB[kMat])  potDB[kMat]  = val;
      if (!potDB[kPo])   potDB[kPo]   = val;
      potRows++;
    }
  }

  log({ type: 'info', msg: `POT: ${potRows} baris diindeks, ${Object.keys(potDB).length} keys` });
  if (potRows === 0) throw new Error('File POT kosong atau format kolom tidak dikenali.');

  // Match
  let mFull = 0, mMat = 0, mPo = 0, noM = 0;
  const finalData = processedOdoo
    .map(row => {
      const kFull = `${row._po}__${row._mat}`;
      const kMat  = `MAT_${row._mat}`;
      const kPo   = `PO_${row._po}`;
      let pv = potDB[kFull]; if (pv) { mFull++; }
      else { pv = potDB[kMat]; if (pv) { mMat++; } else { pv = potDB[kPo]; if (pv) { mPo++; } else { noM++; return null; } } }
      return {
        'id':                 colId ? (row[colId] ?? '') : '',
        'status':             pv.status,
        'item_status':        pv.item_status,
        'estimated_received': pv.est,
        'remarks':            pv.remarks,
      };
    })
    .filter(Boolean);

  log({ type: 'info', msg: `Match: PO+Mat=${mFull} | Mat=${mMat} | PO=${mPo} | Tidak cocok=${noM}` });
  log({ type: 'success', msg: `${finalData.length} baris berhasil diproses!` });

  if (finalData.length === 0) {
    const hint = isExtId
      ? ' TIP: Export ulang Odoo dengan kolom Product dalam format Display Name (bukan External ID).'
      : '';
    throw new Error(`Tidak ada data yang cocok antara Odoo (${processedOdoo.length} baris) dan POT (${potRows} baris).${hint}`);
  }

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(finalData), 'SIAP_IMPORT');
  const outBuf = XLSX.write(wbOut, { type: 'array', bookType: 'xlsx' });
  return new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── Dropzone component ───────────────────────────────────────────────────────
function Dropzone({
  label, sublabel, file, accept, onFile, icon,
}: {
  label: string; sublabel: string; file: File | null;
  accept: string; onFile: (f: File) => void; icon: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div className="dz-wrap">
      <p className="dz-label">{label}</p>
      <div
        className={`dz${drag ? ' dz--drag' : ''}${file ? ' dz--filled' : ''}`}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <input ref={ref} type="file" accept={accept} className="dz-input"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        <span className="dz-icon">{icon}</span>
        {file
          ? <><span className="dz-fname">{file.name}</span><span className="dz-fsize">{(file.size/1024).toFixed(1)} KB</span></>
          : <><span className="dz-prompt">Klik atau drag file di sini</span><span className="dz-sub">{sublabel}</span></>
        }
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [odooFile, setOdooFile] = useState<File | null>(null);
  const [potFile,  setPotFile]  = useState<File | null>(null);
  const [status,   setStatus]   = useState<'idle'|'processing'|'done'|'error'>('idle');
  const [logs,     setLogs]     = useState<ProcessingLog[]>([]);
  const [errMsg,   setErrMsg]   = useState('');

  const addLog = (l: ProcessingLog) => setLogs(prev => [...prev, l]);

  const handleConvert = async () => {
    if (!odooFile || !potFile) return;
    setStatus('processing'); setLogs([]); setErrMsg('');
    try {
      const blob = await convertFiles(odooFile, potFile, addLog);
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

  const ready = !!odooFile && !!potFile && status !== 'processing';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:      #0b0f1a;
          --surface: #111827;
          --border:  #1f2d45;
          --accent:  #3b82f6;
          --accent2: #06b6d4;
          --green:   #10b981;
          --yellow:  #f59e0b;
          --red:     #ef4444;
          --text:    #e2e8f0;
          --muted:   #64748b;
          --mono:    'DM Mono', monospace;
          --sans:    'Syne', sans-serif;
        }

        body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; }

        /* Grid bg */
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0;
          background-image:
            linear-gradient(rgba(59,130,246,.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,.04) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        .app { position: relative; z-index: 1; max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; }

        /* Header */
        .header { text-align: center; margin-bottom: 56px; }
        .badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(59,130,246,.12); border: 1px solid rgba(59,130,246,.25);
          color: var(--accent2); font-family: var(--mono); font-size: 11px; letter-spacing: .12em;
          padding: 5px 14px; border-radius: 100px; margin-bottom: 20px; text-transform: uppercase;
        }
        .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent2); animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .title { font-size: clamp(32px, 6vw, 52px); font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
        .title em { font-style: normal; color: var(--accent); }
        .subtitle { margin-top: 14px; color: var(--muted); font-size: 15px; line-height: 1.6; }

        /* Layout */
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }

        /* Card */
        .card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 28px;
        }
        .card-title {
          font-size: 11px; font-family: var(--mono); letter-spacing: .12em;
          color: var(--muted); text-transform: uppercase; margin-bottom: 20px;
        }

        /* Dropzone */
        .dz-wrap { margin-bottom: 16px; }
        .dz-label { font-size: 12px; color: var(--muted); font-family: var(--mono); margin-bottom: 8px; letter-spacing:.06em; }
        .dz {
          position: relative; border: 1.5px dashed var(--border); border-radius: 12px;
          padding: 20px 16px; cursor: pointer; transition: all .2s;
          display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
        }
        .dz:hover, .dz--drag { border-color: var(--accent); background: rgba(59,130,246,.06); }
        .dz--filled { border-style: solid; border-color: rgba(59,130,246,.4); background: rgba(59,130,246,.05); }
        .dz-input { display: none; }
        .dz-icon { font-size: 28px; line-height: 1; margin-bottom: 4px; }
        .dz-prompt { font-size: 13px; color: var(--text); font-weight: 600; }
        .dz-sub { font-size: 11px; color: var(--muted); font-family: var(--mono); }
        .dz-fname { font-size: 12px; color: var(--accent2); font-family: var(--mono); word-break: break-all; font-weight: 500; }
        .dz-fsize { font-size: 11px; color: var(--muted); font-family: var(--mono); }

        /* Button */
        .btn {
          width: 100%; padding: 15px; border: none; border-radius: 12px; cursor: pointer;
          font-family: var(--sans); font-size: 14px; font-weight: 700; letter-spacing: .04em;
          text-transform: uppercase; transition: all .2s; margin-top: 8px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .btn-primary {
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          color: #fff; box-shadow: 0 4px 24px rgba(59,130,246,.3);
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(59,130,246,.4); }
        .btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }
        .spin { animation: spin .8s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Status */
        .status-success, .status-error {
          margin-top: 14px; padding: 12px 16px; border-radius: 10px;
          font-size: 13px; display: flex; align-items: flex-start; gap: 10px;
        }
        .status-success { background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.25); color: var(--green); }
        .status-error   { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2); color: var(--red); }

        /* Log panel */
        .log-panel {
          background: #070c14; border: 1px solid var(--border); border-radius: 12px;
          padding: 16px; font-family: var(--mono); font-size: 11.5px; line-height: 1.7;
          max-height: 260px; overflow-y: auto;
        }
        .log-panel:empty::after { content: 'Log akan muncul saat proses berjalan...'; color: var(--muted); }
        .log-info    { color: #94a3b8; }
        .log-warn    { color: var(--yellow); }
        .log-success { color: var(--green); }
        .log-error   { color: var(--red); }

        /* Info card */
        .info-item { display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-start; }
        .info-num {
          flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
          background: rgba(59,130,246,.15); border: 1px solid rgba(59,130,246,.3);
          color: var(--accent); font-family: var(--mono); font-size: 10px;
          display: flex; align-items: center; justify-content: center; font-weight: 700; margin-top: 1px;
        }
        .info-text { font-size: 13px; color: var(--muted); line-height: 1.6; }
        .info-text strong { color: var(--text); }

        /* Spec table */
        .spec { width: 100%; border-collapse: collapse; font-size: 12px; font-family: var(--mono); }
        .spec td { padding: 8px 0; border-bottom: 1px solid var(--border); }
        .spec td:first-child { color: var(--muted); }
        .spec td:last-child { color: var(--accent2); text-align: right; }
        .spec tr:last-child td { border-bottom: none; }

        .footer { text-align: center; margin-top: 56px; font-size: 11px; color: var(--muted); font-family: var(--mono); letter-spacing: .08em; }
      `}</style>

      <div className="app">
        <header className="header">
          <div className="badge"><span className="badge-dot" />🚀 High-Speed Matching Engine</div>
          <h1 className="title">Odoo × POT <em>Smart-Sync</em></h1>
          <p className="subtitle">
            Platform automasi data order pembelian untuk sinkronisasi tarikan <strong>Odoo</strong> dengan basis data <strong>POT</strong> secara instan.
          </p>
        </header>

        <div className="grid">
          {/* Left: Upload */}
          <div>
            <div className="card">
              <p className="card-title">// Upload Files</p>

              <Dropzone
                label="01 — Template Odoo (CSV / XLSX)"
                sublabel=".csv · .xlsx · .xls"
                file={odooFile}
                accept=".csv,.xlsx,.xls"
                onFile={f => { setOdooFile(f); setStatus('idle'); setLogs([]); }}
                icon="📄"
              />

              <Dropzone
                label="02 — Master Data POT (XLSX)"
                sublabel=".xlsx · .xls"
                file={potFile}
                accept=".xlsx,.xls"
                onFile={f => { setPotFile(f); setStatus('idle'); setLogs([]); }}
                icon="📊"
              />

              <button className="btn btn-primary" onClick={handleConvert} disabled={!ready}>
                {status === 'processing'
                  ? <><span className="spin">⟳</span> Processing…</>
                  : <><span>↓</span> Convert & Download</>}
              </button>

              {status === 'done' && (
                <div className="status-success">
                  ✓ Berhasil! File <strong>SIAP_IMPORT_ODOO_FINAL.xlsx</strong> sudah terunduh.
                </div>
              )}
              {status === 'error' && (
                <div className="status-error">⚠ {errMsg}</div>
              )}
            </div>

            {/* Log */}
            {logs.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="card-title">// Processing Log</p>
                <div className="log-panel">
                  {logs.map((l, i) => (
                    <div key={i} className={`log-${l.type}`}>
                      {l.type === 'info' ? '›' : l.type === 'warn' ? '⚠' : l.type === 'success' ? '✓' : '✗'} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <p className="card-title">// Panduan</p>
              {[
                ['Template Odoo', 'Export Purchase Order Lines dari Odoo. Pastikan kolom Order Reference & Product ada.'],
                ['Master Data POT', 'File POT terbaru. Semua sheet akan di-scan otomatis.'],
                ['Convert & Download', 'Klik tombol — file hasil langsung terunduh. Tidak perlu internet atau server.'],
              ].map(([title, desc], i) => (
                <div key={i} className="info-item">
                  <span className="info-num">{i + 1}</span>
                  <p className="info-text"><strong>{title}</strong> — {desc}</p>
                </div>
              ))}
            </div>

            <div className="card">
              <p className="card-title">// Spesifikasi</p>
              <table className="spec">
                <tbody>
                  {[
                    ['Engine', 'Browser (SheetJS)'],
                    ['Backend', 'Tidak diperlukan'],
                    ['Matching', 'PO + Material ID'],
                    ['Fallback', 'Material only / PO only'],
                    ['Format Input', 'CSV, XLSX, XLS'],
                    ['Multi-Sheet', 'Semua sheet di-scan'],
                    ['Output', 'SIAP_IMPORT_ODOO_FINAL.xlsx'],
                  ].map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <footer className="footer">SERVING YOU BETTER · CREATED BY IT TEAM ELOKARSA · 2026</footer>
      </div>
    </>
  );
}
