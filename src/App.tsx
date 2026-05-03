import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, RefreshCw, CheckCircle2, AlertCircle, Rocket } from 'lucide-react';

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
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-6 shadow-lg shadow-blue-200">
            <Rocket size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Converter Automasi Odoo
          </h1>
          <p className="mt-3 text-slate-500">
            Gabungkan data Odoo dan POT dengan satu klik untuk efisiensi kerja.
          </p>
        </div>

        {/* Card Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            
            <div className="grid gap-6 md:grid-cols-2">
              {/* Box 1 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Template Odoo</label>
                <div 
                  onClick={() => odooInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    odooFile ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <input type="file" ref={odooInputRef} onChange={(e) => handleFileChange(e, 'odoo')} className="hidden" accept=".xlsx,.xls" />
                  <FileSpreadsheet className={`mb-2 ${odooFile ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-xs text-center px-2 font-medium truncate max-w-full">
                    {odooFile ? odooFile.name : 'Pilih File Odoo'}
                  </span>
                </div>
              </div>

              {/* Box 2 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Data POT</label>
                <div 
                  onClick={() => potInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    potFile ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <input type="file" ref={potInputRef} onChange={(e) => handleFileChange(e, 'pot')} className="hidden" accept=".xlsx,.xls" />
                  <FileSpreadsheet className={`mb-2 ${potFile ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-xs text-center px-2 font-medium truncate max-w-full">
                    {potFile ? potFile.name : 'Pilih File POT'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!odooFile || !potFile || isProcessing}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md transition-all disabled:bg-slate-300 disabled:shadow-none"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="animate-spin" size={20} />
                  <span>Sedang Memproses...</span>
                </>
              ) : (
                <>
                  <Download size={20} />
                  <span>Proses & Download Hasil</span>
                </>
              )}
            </button>
          </form>

          {/* Alert Status */}
          {(error || success) && (
            <div className={`p-4 text-sm flex items-center gap-3 ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{error || 'Berhasil! File hasil konversi telah diunduh.'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">
            Developed by Dinda Rizki Pangesti
          </p>
        </div>

      </div>
    </div>
  );
}
