import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, RefreshCw, CheckCircle2, AlertCircle, FileText, Zap, Cpu, ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen bg-[#0B0F1A] text-slate-200 selection:bg-blue-500/30 font-sans">
      {/* Futuristic Background Decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <header className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5 text-xs font-bold tracking-widest text-blue-400 uppercase mb-6"
          >
            <Zap className="h-3 w-3 fill-current" />
            <span>Core System v1.2</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500"
          >
            Odoo x POT <span className="text-blue-500">Converter</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-6 max-w-xl text-slate-400 text-lg leading-relaxed"
          >
            Automasi cerdas untuk sinkronisasi data logistik. Matching presisi tinggi menggunakan algoritma <span className="text-blue-400">Deep-Clean ID</span>.
          </motion.p>
        </header>

        <main className="grid gap-8 lg:grid-cols-5 items-start">
          
          {/* Form Side - Modern Card */}
          <section className="lg:col-span-3 rounded-3xl bg-slate-900/50 p-8 backdrop-blur-xl border border-white/5 shadow-2xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Upload className="h-5 w-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Data Injection</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Inputs Container */}
              <div className="grid gap-4">
                {[
                  { id: 'odoo', label: 'Template A: Odoo Export', file: odooFile, ref: odooInputRef, icon: FileSpreadsheet },
                  { id: 'pot', label: 'Template B: POT Master', file: potFile, ref: potInputRef, icon: FileText }
                ].map((input) => (
                  <div key={input.id}>
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2 ml-1">
                      {input.label}
                    </label>
                    <div 
                      onClick={() => input.ref.current?.click()}
                      className={`group relative flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition-all ${
                        input.file 
                        ? 'border-blue-500/50 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                        : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={input.ref} 
                        onChange={(e) => handleFileChange(e, input.id as 'odoo' | 'pot')}
                        accept=".xlsx,.xls,.csv" 
                        className="hidden" 
                      />
                      <div className={`p-3 rounded-xl transition-colors ${input.file ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                        <input.icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className={`text-sm font-semibold truncate ${input.file ? 'text-blue-100' : 'text-slate-400'}`}>
                          {input.file ? input.file.name : `Pilih data ${input.id.toUpperCase()}`}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {input.file ? `${(input.file.size / 1024).toFixed(1)} KB` : 'Format: .xlsx, .xls'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={!odooFile || !potFile || isProcessing}
                className="group w-full relative flex items-center justify-center gap-3 overflow-hidden rounded-2xl bg-blue-600 px-6 py-4 font-bold text-white transition-all hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600 shadow-lg shadow-blue-900/20"
              >
                {isProcessing ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Download className="h-5 w-5 transition-transform group-hover:-translate-y-1" />
                )}
                <span>{isProcessing ? 'SYNCHRONIZING...' : 'EXECUTE CONVERSION'}</span>
                
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </button>
            </form>

            {/* Notifications */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-400"
                >
                  <AlertCircle className="h-4 w-4" />
                  <p>{error}</p>
                </motion.div>
              )}
              {success && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 flex items-center gap-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-400"
                >
                  <div className="p-1 rounded-full bg-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p className="font-bold">Conversion Protocol Complete. File downloaded.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Sidebar - Technical Info */}
          <aside className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl bg-blue-600/5 border border-blue-500/10 p-6 backdrop-blur-md">
              <h3 className="text-white font-bold flex items-center gap-2 mb-4">
                <Cpu className="h-4 w-4 text-blue-400" />
                System Intelligence
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Matching Engine', value: 'Cleaned-PO Algorithm' },
                  { label: 'Sanitization', value: 'Prefix Trimming' },
                  { label: 'Output File', value: 'XLSX Structure' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">{item.label}</span>
                    <span className="text-xs text-blue-200 font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900/30 border border-white/5 p-6">
              <h3 className="text-white font-bold flex items-center gap-2 mb-4">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Workflow
              </h3>
              <div className="space-y-3">
                {[
                  'Inject Odoo source file',
                  'Verify master POT data',
                  'Auto-match multi-sheet sheets',
                  'Download refined export'
                ].map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-blue-500/50 font-mono text-xs mt-0.5">0{i+1}</span>
                    <p className="text-xs text-slate-400 leading-tight">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-20 text-center flex flex-col items-center gap-4">
          <div className="h-px w-20 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-600">
            System Identity: <span className="text-slate-400">Dinda Rizki Pangesti</span> • Engineering 2026
          </p>
        </footer>
      </div>
    </div>
  );
}
