import React, { useState } from 'react';
import { ProfileUser } from '../types';
import { X, User, Save, Upload, Check } from 'lucide-react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileUser;
  onSave: (updated: ProfileUser) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
}) => {
  const [nama, setNama] = useState(profile.nama);
  const [nip, setNip] = useState(profile.nip);
  const [unitKerja, setUnitKerja] = useState(profile.unitKerja);
  const [jabatan, setJabatan] = useState(profile.jabatan);
  const [noHp, setNoHp] = useState(profile.noHp);
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      nama,
      nip,
      unitKerja,
      jabatan,
      noHp,
      photoUrl,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-lg bg-[#0e1d11] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white select-none">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-rose-500/30">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-sky-300" />
            <h3 className="text-base font-bold text-white">Edit Profil Owner Petugas</h3>
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
          {/* Foto Profil Preview & Upload */}
          <div className="flex items-center gap-4 p-3 rounded-xl bg-black/50 border border-emerald-500/30">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-rose-500/50 bg-black shrink-0">
              <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1">
              <span className="font-bold text-sky-200">Foto Profil Petugas</span>
              <p className="text-[10px] text-neutral-400">
                Pilih foto formal pakaian dinas Kemensos atau avatar pendamping.
              </p>
              <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer border border-emerald-500/40">
                <Upload className="w-3 h-3 text-emerald-300" />
                <span>Unggah Foto Baru</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1">Nama Owner / Petugas:</label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white font-bold"
              required
            />
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1">NIP (Nomor Induk Pegawai):</label>
            <input
              type="text"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1">Unit Kerja:</label>
            <input
              type="text"
              value={unitKerja}
              onChange={(e) => setUnitKerja(e.target.value)}
              className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sky-200 font-semibold mb-1">Jabatan:</label>
              <input
                type="text"
                value={jabatan}
                onChange={(e) => setJabatan(e.target.value)}
                className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sky-200 font-semibold mb-1">No. HP / WA:</label>
              <input
                type="text"
                value={noHp}
                onChange={(e) => setNoHp(e.target.value)}
                className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white font-mono"
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
              <span>{saved ? 'Tersimpan!' : 'Simpan Profil'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
