import { useState, useRef } from 'react';
import { Upload, FileText, Download, RefreshCw, CheckCircle2, AlertCircle, Rocket } from 'lucide-react';

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
    <div className="min-h-screen bg-[#F0F4F8] font-sans text-slate-800 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full space-y-8">
        
        {/* Header - Berdasarkan image_fc6c08.png */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-[#4285F4] font-bold text-lg">
            <Rocket size={20} className="fill-current" />
            <span>Odoo Automation</span>
          </div>
          <h1 className="text-4xl font-extrabold text-[#344D67]">
            Odoo x POT Converter
          </h1>
          <p className="text-slate-500">
            Gabungkan data tarikan Odoo dengan data POT secara otomatis.
          </p>
        </div>

        {/* UI/UX Container Dua Kolom */}
        <div className="flex flex-col md:flex-row gap-0 rounded-3xl overflow-hidden shadow-2xl shadow-blue-100 border border-white">
          
          {/* Sisi Kiri: Form Upload (Clean White) */}
          <div className="flex-[1.2] bg-white p-10">
            <div className="flex items-center gap-2 mb-8 text-[#344D67] font-bold text-xl">
              <span className="text-yellow-500">📁</span>
              <h2>Upload Files</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-600">1. Template Tarikan Odoo (Template A)</label>
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 transition-colors">
                  <input 
                    type="file" 
                    onChange={(e) => handleFileChange(e, 'odoo')} 
                    className="text-sm text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-700 file:shadow-sm hover:file:bg-slate-100 cursor-pointer w-full" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-600">2. Data POT Terbaru (Template B)</label>
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 transition-colors">
                  <input 
                    type="file" 
                    onChange={(e) => handleFileChange(e, 'pot')} 
                    className="text-sm text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-700 file:shadow-sm hover:file:bg-slate-100 cursor-pointer w-full" 
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!odooFile || !potFile || isProcessing}
                className="w-full bg-[#4285F4] hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300"
              >
                {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Download size={20} />}
                <span>Convert & Download Results</span>
              </button>

              {/* Status Notifikasi */}
              {(error || success) && (
                <div className={`p-4 rounded-lg text-sm flex items-center gap-2 ${error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                  <span>{error || 'Berhasil! File hasil konversi telah diunduh.'}</span>
                </div>
              )}
            </form>
          </div>

          {/* Sisi Kanan: Panduan (Dark Blue/Grey) */}
          <div className="flex-1 bg-[#1A2635] p-10 text-slate-300">
            <div className="flex items-center gap-2 mb-8 text-[#4285F4] font-bold text-xl">
              <span>📝</span>
              <h2 className="text-white">Panduan Penggunaan</h2>
            </div>
            
            <ul className="space-y-8">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold border border-slate-700 text-white">1</span>
                <p className="text-sm leading-relaxed pt-1">Siapkan file dari <span className="text-white font-bold">Odoo</span> dan file <span className="text-white font-bold">POT</span> dalam format .xlsx.</p>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold border border-slate-700 text-white">2</span>
                <p className="text-sm leading-relaxed pt-1">Upload kedua file pada kolom yang tersedia di sebelah kiri.</p>
              </li>
              <li className="flex gap-4 pb-4 border-b border-slate-700/50">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold border border-slate-700 text-white">3</span>
                <p className="text-sm leading-relaxed pt-1">Klik tombol <span className="text-[#4285F4] font-bold">Convert</span> dan sistem akan mencocokkan data berdasarkan PO & Material ID.</p>
              </li>
            </ul>

            {/* Labels di bagian bawah sisi kanan */}
            <div className="mt-10 flex flex-wrap gap-2">
              <span className="px-3 py-1.5 bg-slate-800 rounded-lg text-[10px] font-mono border border-slate-700 uppercase tracking-wider text-slate-400">Logic: PO + Material ID</span>
              <span className="px-3 py-1.5 bg-slate-800 rounded-lg text-[10px] font-mono border border-slate-700 uppercase tracking-wider text-slate-400">Environment: Production</span>
            </div>
          </div>

        </div>

        {/* Footer identitas pembuat */}
        <div className="text-center">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
            Developed by Dinda Rizki Pangesti
          </p>
        </div>
      </div>
    </div>
  );
}
