import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, RefreshCw, CheckCircle2, AlertCircle, FileText, Rocket, ShieldCheck, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 selection:bg-sky-100">
      {/* Dekorasi Latar Belakang Teknis */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-br from-sky-100/50 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-gradient-to-tr from-blue-50 to-transparent rounded-full blur-3xl translate-y-1/4 -translate-x-1/4" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-12">
        {/* Header Section */}
        <header className="mb-16 flex flex-col items-center text-center">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative mb-6"
          >
            {/* ROCKET MERAH MENYALA */}
            <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
              <Rocket className="h-10 w-10 text-red-500 fill-red-50" />
              {/* Efek Api Menyala Bawah */}
              <motion.div 
                animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute -bottom-2 h-4 w-6 bg-orange-500 blur-md rounded-full"
              />
            </div>
            {/* Glow di belakang roket */}
            <div className="absolute inset-0 bg-red-400 blur-2xl opacity-20 scale-150" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-4 py-1 text-xs font-bold uppercase tracking-widest text-sky-700 border border-sky-100 mb-4"
          >
            <Zap className="h-3 w-3 fill-sky-700" />
            <span>High-Speed Matching Engine</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl"
          >
            Odoo x POT <span className="text-sky-600">Smart-Sync</span>
          </motion.h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-500 leading-relaxed">
            Platform automasi data logistik untuk sinkronisasi tarikan <span className="font-semibold text-slate-700">Odoo</span> dengan basis data <span className="font-semibold text-slate-700">POT</span> secara instan.
          </p>
        </header>

        <main className="grid gap-8 lg:grid-cols-12 items-start">
          {/* Bagian Upload (Kiri) */}
          <section className="lg:col-span-7 rounded-3xl bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                <Upload className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Data Injection</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Odoo Input */}
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Template Odoo</label>
                  <div 
                    onClick={() => odooInputRef.current?.click()}
                    className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                      odooFile ? 'border-sky-500 bg-sky-50/50' : 'border-slate-200 hover:border-sky-400 hover:bg-slate-50'
                    }`}
                  >
                    <input type="file" ref={odooInputRef} onChange={(e) => handleFileChange(e, 'odoo')} accept=".xlsx,.xls,.csv" className="hidden" />
                    <FileSpreadsheet className={`mx-auto mb-3 h-10 w-10 ${odooFile ? 'text-sky-600' : 'text-slate-300 group-hover:text-sky-500'}`} />
                    <p className={`text-sm font-semibold truncate px-2 ${odooFile ? 'text-sky-900' : 'text-slate-500'}`}>
                      {odooFile ? odooFile.name : 'Select Odoo File'}
                    </p>
                  </div>
                </div>

                {/* POT Input */}
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Template POT</label>
                  <div 
                    onClick={() => potInputRef.current?.click()}
                    className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                      potFile ? 'border-sky-500 bg-sky-50/50' : 'border-slate-200 hover:border-sky-400 hover:bg-slate-50'
                    }`}
                  >
                    <input type="file" ref={potInputRef} onChange={(e) => handleFileChange(e, 'pot')} accept=".xlsx,.xls" className="hidden" />
                    <FileText className={`mx-auto mb-3 h-10 w-10 ${potFile ? 'text-sky-600' : 'text-slate-300 group-hover:text-sky-500'}`} />
                    <p className={`text-sm font-semibold truncate px-2 ${potFile ? 'text-sky-900' : 'text-slate-500'}`}>
                      {potFile ? potFile.name : 'Select POT File'}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!odooFile || !potFile || isProcessing}
                className="group w-full relative flex items-center justify-center gap-3 overflow-hidden rounded-2xl bg-slate-900 px-8 py-5 font-bold text-white shadow-2xl transition-all hover:bg-sky-700 hover:-translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:translate-y-0"
              >
                {isProcessing ? (
                  <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                ) : (
                  <>
                    <Download className="h-6 w-6 transition-transform group-hover:scale-110" />
                    <span>LAUNCH CONVERSION</span>
                  </>
                )}
              </button>
            </form>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-6 flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-600 border border-red-100"
                >
                  <AlertCircle className="h-5 w-5" />
                  <p>{error}</p>
                </motion.div>
              )}
              {success && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 flex items-center gap-4 rounded-2xl bg-emerald-50 p-5 text-sm border border-emerald-100 text-emerald-800"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold">Sync Successful!</p>
                    <p className="opacity-80 font-medium">Final template is ready to be imported.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Bagian Info (Kanan) */}
          <aside className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-100">
              <h3 className="mb-6 text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Technical Protocol</h3>
              <div className="space-y-6">
                {[
                  { title: "Matching Logic", desc: "PO Number & Material ID (Trimmed)", icon: ShieldCheck },
                  { title: "ID Sanitization", desc: "Automatic Prefix Removal", icon: Zap },
                  { title: "Processing Mode", desc: "Full Multi-Sheet Scanning", icon: RefreshCw }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
                      <item.icon className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.title}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900 p-8 text-white shadow-2xl relative overflow-hidden">
               <div className="relative z-10">
                <h3 className="mb-4 text-lg font-bold">Quick Start</h3>
                <div className="space-y-4">
                  <div className="flex gap-3 text-xs font-medium text-slate-400">
                    <span className="text-sky-400">01</span>
                    <p>Upload <span className="text-white">Template Odoo</span> hasil export.</p>
                  </div>
                  <div className="flex gap-3 text-xs font-medium text-slate-400">
                    <span className="text-sky-400">02</span>
                    <p>Upload <span className="text-white">Master Data POT</span> terbaru.</p>
                  </div>
                  <div className="flex gap-3 text-xs font-medium text-slate-400">
                    <span className="text-sky-400">03</span>
                    <p>Sistem akan memvalidasi <span className="text-white font-mono">id, status,</span> dan <span className="text-white font-mono">remarks</span>.</p>
                  </div>
                </div>
               </div>
               <div className="absolute -right-8 -bottom-8 opacity-10">
                 <Rocket className="h-32 w-32 rotate-12" />
               </div>
            </div>
          </aside>
        </main>

        <footer className="mt-16 text-center">
          <div className="flex flex-col items-center gap-3">
             <div className="h-px w-16 bg-slate-200" />
             <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-400">
                Serving You Better - Created By IT Team ELokarsa • 2026
             </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
