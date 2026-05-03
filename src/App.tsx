import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, RefreshCw, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [odooFile, setOdooFile] = useState<File | null>(null);
  const [potFile, setPotFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const odooInputRef = useRef<HTMLInputElement>(null);
  const potInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'odoo' | 'pot') => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'odoo') setOdooFile(file);
      else setPotFile(file);
      setError(null);
      setSuccess(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odooFile || !potFile) {
      setError("Harap pilih kedua file (Odoo & POT) terlebih dahulu.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append('odooFile', odooFile);
    formData.append('potFile', potFile);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Terjadi kesalahan saat memproses file.');
      }

      // Download the result
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SIAP_IMPORT_ODOO_FINAL.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900 selection:bg-blue-100 selection:text-blue-900">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 mb-4"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Odoo Automation</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl"
          >
            Odoo x POT Converter
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600"
          >
            Automasi penggabungan data tarikan Odoo dengan data POT untuk persiapan import kembali ke Odoo.
          </motion.p>
        </header>

        {/* Main Content */}
        <main className="grid gap-8 lg:grid-cols-2">
          {/* Form Side */}
          <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-neutral-200/50">
            <h2 className="mb-6 text-xl font-semibold flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Upload Files
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Odoo File Input */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  1. Template Tarikan Odoo (Template A)
                </label>
                <div 
                  onClick={() => odooInputRef.current?.click()}
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all ${
                    odooFile ? 'border-blue-200 bg-blue-50' : 'border-neutral-200 hover:border-blue-400 hover:bg-neutral-50'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={odooInputRef} 
                    onChange={(e) => handleFileChange(e, 'odoo')}
                    accept=".xlsx,.xls,.csv" 
                    className="hidden" 
                  />
                  {odooFile ? (
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-blue-900 truncate max-w-[150px]">{odooFile.name}</p>
                        <p className="text-xs text-blue-600">{(odooFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileSpreadsheet className="mb-2 h-8 w-8 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                      <p className="text-sm text-neutral-500">Pilih file Excel Odoo</p>
                    </>
                  )}
                </div>
              </div>

              {/* POT File Input */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  2. Data POT Terbaru (Template B)
                </label>
                <div 
                  onClick={() => potInputRef.current?.click()}
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all ${
                    potFile ? 'border-blue-200 bg-blue-50' : 'border-neutral-200 hover:border-blue-400 hover:bg-neutral-50'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={potInputRef} 
                    onChange={(e) => handleFileChange(e, 'pot')}
                    accept=".xlsx,.xls" 
                    className="hidden" 
                  />
                  {potFile ? (
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-blue-600" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-blue-900 truncate max-w-[150px]">{potFile.name}</p>
                        <p className="text-xs text-blue-600">{(potFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileText className="mb-2 h-8 w-8 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                      <p className="text-sm text-neutral-500">Pilih file Excel POT</p>
                    </>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!odooFile || !potFile || isProcessing}
                className="w-full relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-[0_4px_12px_rgba(37,99,235,0.2)] transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    <span>Convert & Download</span>
                  </>
                )}
              </button>
            </form>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                >
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
              {success && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 flex items-start gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-700"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Berhasil!</p>
                    <p>File SIAP_IMPORT_ODOO_FINAL.xlsx telah terunduh.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Guide Side */}
          <section className="flex flex-col gap-6">
            <div className="rounded-2xl bg-neutral-900 p-8 text-neutral-100 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-white">Panduan Penggunaan</h3>
              <ul className="space-y-4 text-sm text-neutral-400">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-white ring-1 ring-neutral-700">1</span>
                  <p>Siapkan file dari <span className="text-white font-medium">Odoo</span> (Template A) dan file <span className="text-white font-medium">POT</span> (Template B).</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-white ring-1 ring-neutral-700">2</span>
                  <p>Upload kedua file tersebut pada kolom yang tersedia di sebelah kiri.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-white ring-1 ring-neutral-700">3</span>
                  <p>Klik tombol <span className="text-white font-medium">Convert & Download</span> untuk memulai proses matching data.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-white ring-1 ring-neutral-700">4</span>
                  <p>Hasilnya berupa file Excel yang sudah berisi kolom: <span className="text-blue-400 font-mono">id, Status, Item Status, Estimated Received, dan Remarks</span>.</p>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h4 className="mb-3 text-sm font-semibold text-neutral-900">Informasi Teknis</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-xs border-b border-neutral-100 pb-2">
                  <span className="text-neutral-500">Logic Matching</span>
                  <span className="font-medium text-neutral-900 text-right">PO + Material ID (Cleaned)</span>
                </div>
                <div className="flex justify-between text-xs border-b border-neutral-100 pb-2">
                  <span className="text-neutral-500">Trim Product ID</span>
                  <span className="font-medium text-neutral-900 text-right">Enabled (Remove prefix)</span>
                </div>
                <div className="flex justify-between text-xs border-b border-neutral-100 pb-2">
                  <span className="text-neutral-500">POT Sheets</span>
                  <span className="font-medium text-neutral-900 text-right">All sheets processed</span>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-12 text-center text-xs text-neutral-400">
          Built with React & Express • v1.0.0
        </footer>
      </div>
    </div>
  );
}
