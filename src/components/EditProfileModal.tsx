import React, { useEffect, useState } from 'react';
import { ProfileUser } from '../types';
import { X, User, Save, Upload, Check, AlertCircle } from 'lucide-react';
import { compressImageForLocalStorage } from '../lib/imageCompression';

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
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl || '');
  const [photoError, setPhotoError] = useState('');
  const [photoPreviewFailed, setPhotoPreviewFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  
  useEffect(() => {
    if (!isOpen) return;
    setNama(profile.nama);
    setNip(profile.nip);
    setUnitKerja(profile.unitKerja);
    setJabatan(profile.jabatan);
    setNoHp(profile.noHp);
    setPhotoUrl(profile.photoUrl || '');
    setPhotoError('');
    setPhotoPreviewFailed(false);
    setSaved(false);
  }, [isOpen, profile]);

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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setSaved(false);
    try {
      const optimized = await compressImageForLocalStorage(file, 640, 260 * 1024);
      setPhotoUrl(optimized);
      setPhotoPreviewFailed(false);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Foto profil tidak dapat diproses.');
    }
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
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-rose-500/50 bg-black shrink-0 flex items-center justify-center">
              {photoUrl && !photoPreviewFailed ? (
                <img
                  src={photoUrl}
                  alt="Pratinjau foto profil"
                  className="w-full h-full object-cover"
                  onError={() => setPhotoPreviewFailed(true)}
                />
              ) : (
                <User className="h-8 w-8 text-sky-200" aria-label="Foto profil belum dipilih" />
              )}
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
          {photoError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/40 bg-rose-950/40 p-2 text-[11px] text-rose-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{photoError}</span>
            </div>
          )}
          {photoUrl.startsWith('data:image/') && (
            <p className="text-[10px] text-emerald-200">Foto sudah dikompres agar tetap tersimpan di perangkat (maksimal sekitar 320 KB).</p>
          )}

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
