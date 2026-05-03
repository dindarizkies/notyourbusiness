import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, Info, ArrowRight, Loader2 } from 'lucide-react';

const OdooConverter = () => {
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* Top Badge */}
      <div className="flex justify-center pt-10">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold tracking-wide uppercase shadow-sm">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Odoo Automation System
        </span>
      </div>

      {/* Hero Section */}
      <header className="text-center px-6 py-10 max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
          Odoo <span className="text-blue-600">x</span> POT Converter
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Automasi penggabungan data tarikan Odoo dengan data POT. Siapkan file Anda dan biarkan sistem melakukan matching secara otomatis.
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Upload Area */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-blue-600 rounded-lg text-white">
                <Upload size={20} />
              </div>
              <h2 className="text-xl font-bold">Upload Center</h2>
            </div>

            <div className="grid gap-6">
              {/* Odoo Template Area */}
              <div className="group relative">
                <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">
                  1. Template Tarikan Odoo (Template A)
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center transition-all group-hover:border-blue-400 group-hover:bg-blue-50/30">
                  <FileSpreadsheet className="text-slate-300 mb-4 group-hover:text-blue-500 transition-colors" size={48} />
                  <p className="text-sm text-slate-500 mb-1">Seret file ke sini atau</p>
                  <button className="text-sm font-semibold text-blue-600 hover:text-blue-700">Pilih file Excel Odoo</button>
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              {/* POT Data Area */}
              <div className="group relative">
                <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">
                  2. Data POT Terbaru (Template B)
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center transition-all group-hover:border-blue-400 group-hover:bg-blue-50/30">
                  <FileSpreadsheet className="text-slate-300 mb-4 group-hover:text-blue-500 transition-colors" size={48} />
                  <p className="text-sm text-slate-500 mb-1">Seret file ke sini atau</p>
                  <button className="text-sm font-semibold text-blue-600 hover:text-blue-700">Pilih file Excel POT</button>
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              {/* Action Button */}
              <button 
                className="w-full mt-4 bg-slate-900 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-blue-200"
                onClick={() => setLoading(true)}
              >
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                {loading ? 'Processing Data...' : 'Convert & Download Result'}
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Guide & Technical */}
        <aside className="lg:col-span-5 space-y-6">
          {/* Guide Card */}
          <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Info size={20} className="text-blue-400" />
              Panduan Penggunaan
            </h3>
            <ul className="space-y-6">
              {[
                "Siapkan file dari Odoo (Template A) dan POT (Template B).",
                "Upload kedua file tersebut pada kolom Upload Center.",
                "Klik tombol Convert & Download untuk proses matching.",
                "Gunakan hasil file untuk import kembali ke sistem Odoo."
              ].map((step, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-xs font-bold text-blue-400">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-300 leading-relaxed">{step}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Technical Info Card */}
          <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6">Informasi Teknis</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-50">
                <span className="text-sm text-slate-500">Logic Matching</span>
                <span className="text-sm font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">PO + Material ID</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-slate-50">
                <span className="text-sm text-slate-500">Trim Product ID</span>
                <span className="text-sm font-bold text-green-600">Enabled (Auto)</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-sm text-slate-500">POT Sheets</span>
                <span className="text-sm font-bold text-slate-700">All Sheets Processed</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="text-center py-10 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          Built with React 19 & Express • v1.1.0 • <span className="font-semibold text-slate-600">By Dinda Rizki Pangesti</span>
        </p>
      </footer>
    </div>
  );
};

export default OdooConverter;
