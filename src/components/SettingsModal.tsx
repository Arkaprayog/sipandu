import React, { useState } from 'react';
import { AppSettings } from '../types';
import { Settings, Save, Check, Link, FileSpreadsheet, FolderGit2, X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (updated: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-xl bg-[#0e1d11] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white select-none">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-rose-500/30">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-300" />
            <h3 className="text-base font-bold text-white">
              Pengaturan Integrasi Google & WhatsApp
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-sky-300" />
              <span>URL Google Form Asesmen Tahap Awal:</span>
            </label>
            <input
              type="url"
              value={formData.googleFormTahapAwalUrl}
              onChange={(e) =>
                setFormData({ ...formData, googleFormTahapAwalUrl: e.target.value })
              }
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-emerald-400" />
              <span>URL Google Form Asesmen Tahap Lanjutan:</span>
            </label>
            <input
              type="url"
              value={formData.googleFormTahapLanjutanUrl || ''}
              onChange={(e) =>
                setFormData({ ...formData, googleFormTahapLanjutanUrl: e.target.value })
              }
              placeholder="https://docs.google.com/forms/d/FORM_ID/edit"
              className="w-full p-2.5 rounded bg-black/60 border border-emerald-500/30 font-mono text-white"
            />
            <p className="mt-1 text-[10px] text-neutral-400">
              Gunakan formulir lanjutan yang berbeda dari tahap awal. Tautan WhatsApp dibuat khusus untuk setiap ID PPKS.
            </p>
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1">
              Nomor entry pertanyaan “ID PPKS” pada Form lanjutan:
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.googleFormTahapLanjutanIdEntry || ''}
              onChange={(e) =>
                setFormData({ ...formData, googleFormTahapLanjutanIdEntry: e.target.value })
              }
              placeholder="Contoh: 123456789 (atau entry.123456789)"
              className="w-full p-2.5 rounded bg-black/60 border border-emerald-500/30 font-mono text-white"
            />
            <p className="mt-1 text-[10px] text-neutral-400">
              Ambil nomor asli dari Google Forms → menu tiga titik → Dapatkan link yang telah diisi sebelumnya. Buat pertanyaan “ID PPKS” di formulir lanjutan.
            </p>
            <p className="mt-1 text-[10px] text-emerald-200">
              Agar jawaban lanjutan otomatis masuk ke record PPKS yang sama, buka tab Respons pada Form lanjutan, tautkan ke Google Spreadsheet, dan pastikan kolom pertanyaan prefill berjudul “ID PPKS”. SIPANDU akan menemukan sheet tertaut dan memadankan respons setiap 5 menit saat dashboard aktif.
            </p>
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-sky-300" />
              <span>URL Google Form Asesmen Kesehatan Mental:</span>
            </label>
            <input
              type="url"
              value={formData.googleFormKesehatanMentalUrl}
              onChange={(e) =>
                setFormData({ ...formData, googleFormKesehatanMentalUrl: e.target.value })
              }
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white"
            />
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>URL Google Spreadsheet Database PPKS:</span>
            </label>
            <input
              type="url"
              value={formData.googleSpreadsheetUrl}
              onChange={(e) =>
                setFormData({ ...formData, googleSpreadsheetUrl: e.target.value })
              }
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white"
            />
            <p className="mt-1 text-[10px] text-neutral-400">Kosongkan bila belum punya database terpisah. Buat database melalui Google Workspace & Cloud Hub; jangan gunakan spreadsheet respons Google Form.</p>
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
              <span>URL Google Drive Arsip Berkas PPKS:</span>
            </label>
            <input
              type="url"
              value={formData.googleDriveFolderUrl}
              onChange={(e) =>
                setFormData({ ...formData, googleDriveFolderUrl: e.target.value })
              }
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-rose-500/20">
            <div>
              <label className="block text-sky-200 font-semibold mb-1">
                Nama Pengirim WhatsApp:
              </label>
              <input
                type="text"
                value={formData.senderName}
                onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                className="w-full p-2 rounded bg-black/60 border border-rose-500/30 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sky-200 font-semibold mb-1">
                Peran Pengirim:
              </label>
              <input
                type="text"
                value={formData.senderRole}
                onChange={(e) => setFormData({ ...formData, senderRole: e.target.value })}
                className="w-full p-2 rounded bg-black/60 border border-rose-500/30 text-white"
                required
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-black/60 text-neutral-300 font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md"
            >
              {saved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              <span>{saved ? 'Tersimpan!' : 'Simpan Konfigurasi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
