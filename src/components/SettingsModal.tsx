import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { enableBiometricLock, disableBiometricLock, isBiometricLockEnabled, getBiometricDiagnostics } from '../lib/biometricLock';
import { AppSettings } from '../types';
import { toGoogleFormsRespondentUrl } from '../utils/helpers';
import { getGoogleFormIdFromUrl } from '../lib/googleSIPANDUResources';
import { Settings, Save, Check, Link, FileSpreadsheet, FolderGit2, X, Lock, Unlock, Fingerprint, ShieldCheck } from 'lucide-react';

type UrlSettingKey = 'googleFormTahapAwalUrl' | 'googleFormTahapLanjutanUrl' | 'googleSpreadsheetUrl' | 'googleDriveFolderUrl';
const URL_SETTING_KEYS: UrlSettingKey[] = [
  'googleFormTahapAwalUrl', 'googleFormTahapLanjutanUrl', 'googleSpreadsheetUrl', 'googleDriveFolderUrl',
];

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
  const [biometricEnabled, setBiometricEnabled] = useState(() => isBiometricLockEnabled());
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricDiagnostics, setBiometricDiagnostics] = useState('Belum diperiksa.');
  const [editingUrlKeys, setEditingUrlKeys] = useState<Set<UrlSettingKey>>(() => new Set(
    URL_SETTING_KEYS.filter((key) => !String(settings[key] || '').trim())
  ));

  // The modal can reopen after settings changed elsewhere (e.g. Google Workspace).
  // Refresh the form from persisted settings instead of retaining stale component state.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setFormData(settings);
    setBiometricEnabled(isBiometricLockEnabled());
    setSaved(false);
    setEditingUrlKeys(new Set(
      URL_SETTING_KEYS.filter((key) => !String(settings[key] || '').trim())
    ));

    if (!Capacitor.isNativePlatform()) {
      setBiometricDiagnostics('PWA web/iOS: belum didukung oleh versi ini. Plugin native tidak membuka prompt sidik jari/Face ID di browser; diperlukan alur passkey/WebAuthn dan validasi server.');
    } else {
      setBiometricDiagnostics('Memeriksa kemampuan biometrik perangkat…');
      void getBiometricDiagnostics()
        .then((result) => {
          if (!active) return;
          const types = result.biometryTypes.length ? result.biometryTypes.join(', ') : result.biometryType;
          const detail = result.isAvailable
            ? ('Tersedia untuk aplikasi: ' + result.biometryType + '. Keamanan perangkat: ' + (result.deviceIsSecure ? 'PIN/pola/kata sandi aktif' : 'kredensial perangkat belum terdeteksi') + '.')
            : ('Tidak tersedia untuk aplikasi. ' + (result.reason || 'Daftarkan biometrik dan kunci layar pada pengaturan perangkat.'));
          const hardware = types && types !== 'none' ? (' Jenis yang dilaporkan perangkat: ' + types + '.') : '';
          const code = result.code ? (' Kode: ' + result.code + '.') : '';
          const strong = result.strongBiometryIsAvailable ? ' Biometrik kuat tersedia.' : '';
          setBiometricDiagnostics(detail + hardware + strong + code);
        })
        .catch((error: unknown) => {
          if (!active) return;
          const message = error instanceof Error ? error.message : String(error);
          setBiometricDiagnostics('Pemeriksaan gagal: ' + message);
        });
    }

    return () => { active = false; };
  }, [isOpen, settings]);

  const isUrlLocked = (key: UrlSettingKey) =>
    Boolean(String(formData[key] || '').trim()) && !editingUrlKeys.has(key);

  const toggleUrlEdit = (key: UrlSettingKey) => {
    setEditingUrlKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderUrlLockButton = (key: UrlSettingKey) => {
    if (!String(formData[key] || '').trim()) return null;
    const locked = isUrlLocked(key);
    return (
      <button
        type="button"
        onClick={() => toggleUrlEdit(key)}
        className="shrink-0 inline-flex items-center justify-center gap-1 rounded-lg border border-white/15 bg-black/40 px-3 text-[10px] font-semibold text-sky-100 hover:bg-white/10"
        aria-label={locked ? 'Buka kunci URL agar dapat diubah' : 'Kunci URL'}
      >
        {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {locked ? 'Ubah' : 'Kunci'}
      </button>
    );
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawStageOneUrl = String(formData.googleFormTahapAwalUrl || '').trim();
    const respondentUrl = rawStageOneUrl ? toGoogleFormsRespondentUrl(rawStageOneUrl) : '';
    if (rawStageOneUrl && !respondentUrl) {
      window.alert('URL Google Form tahap awal tidak dikenali. Tempel URL Google Form yang valid.');
      return;
    }
    if (respondentUrl && !getGoogleFormIdFromUrl(respondentUrl)) {
      window.alert('Untuk sinkronisasi otomatis, tempel URL lengkap docs.google.com/forms/d/FORM_ID/edit atau /viewform. Tautan pendek forms.gle tidak dapat digunakan untuk membaca sheet respons melalui Google API.');
      return;
    }
    const normalizedSettings = { ...formData, googleFormTahapAwalUrl: respondentUrl };
    onSave(normalizedSettings);
    setFormData(normalizedSettings);
    setEditingUrlKeys(new Set());
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
          {Capacitor.isNativePlatform() ? (
            <section className="rounded-xl border border-emerald-400/25 bg-emerald-950/30 p-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-200">
                  {biometricEnabled ? <ShieldCheck className="h-5 w-5" /> : <Fingerprint className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-emerald-100">Pengaman sidik jari &amp; face unlock</p>
                  <p className="mt-1 leading-relaxed text-neutral-300">
                    {biometricEnabled
                      ? 'Aktif. SIPANDU meminta verifikasi saat dibuka kembali atau setelah kembali dari latar belakang.'
                      : 'Aktifkan verifikasi biometrik perangkat untuk mengunci akses ke aplikasi native.'}
                  </p>
                  <p role="status" className="mt-2 rounded-lg border border-white/10 bg-black/25 p-2 text-[10px] leading-relaxed text-neutral-300">
                    Diagnostik perangkat: {biometricDiagnostics}
                  </p>
                  <button
                    type="button"
                    disabled={biometricBusy}
                    onClick={async () => {
                      if (biometricEnabled) {
                        disableBiometricLock();
                        setBiometricEnabled(false);
                        return;
                      }
                      setBiometricBusy(true);
                      try {
                        await enableBiometricLock();
                        setBiometricEnabled(true);
                        setBiometricDiagnostics('Verifikasi biometrik berhasil. SIPANDU meminta biometrik saat aplikasi dibuka kembali atau kembali dari latar belakang.');
                        window.alert('Pengaman biometrik SIPANDU berhasil diaktifkan.');
                      } catch (error) {
                        const message = error instanceof Error ? error.message : 'Pengaman biometrik gagal diaktifkan.';
                        setBiometricDiagnostics('Aktivasi gagal: ' + message);
                        window.alert(message);
                      } finally {
                        setBiometricBusy(false);
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-300 px-3 py-2 font-bold text-emerald-950 disabled:opacity-60"
                  >
                    {biometricBusy ? 'Memeriksa perangkat…' : biometricEnabled ? 'Nonaktifkan pengaman' : 'Aktifkan pengaman biometrik'}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-amber-300/25 bg-amber-950/25 p-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-amber-300/10 p-2 text-amber-200">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-amber-100">Status biometrik PWA web / iOS</p>
                  <p className="mt-1 leading-relaxed text-neutral-300">
                    Pengaman sidik jari/Face ID belum diimplementasikan pada PWA ini. Plugin Capacitor hanya mengakses prompt native, bukan sensor biometrik sungguhan dari browser. Dukungan passkey/WebAuthn perlu alur tantangan dan verifikasi sisi server sebelum diaktifkan.
                  </p>
                  <p role="status" className="mt-2 text-[10px] leading-relaxed text-amber-100">
                    Diagnostik: fitur belum tersedia di build PWA ini; ini bukan kegagalan sensor perangkat.
                  </p>
                </div>
              </div>
            </section>
          )}
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-950/35 px-3 py-2 text-[10px] leading-relaxed text-emerald-100">
            URL yang telah tersimpan dikunci agar tidak terhapus tanpa sengaja. Tekan <strong>Ubah</strong> pada URL yang ingin diganti, lalu tekan <strong>Simpan Konfigurasi</strong> untuk menyimpan dan menguncinya kembali.
          </p>
          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-sky-300" />
              <span>URL Google Form Asesmen Tahap Awal:</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="url"
                value={formData.googleFormTahapAwalUrl}
                readOnly={isUrlLocked('googleFormTahapAwalUrl')}
                onChange={(e) =>
                  setFormData({ ...formData, googleFormTahapAwalUrl: e.target.value })
                }
                className={`min-w-0 flex-1 p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white ${isUrlLocked('googleFormTahapAwalUrl') ? 'cursor-not-allowed opacity-80' : ''}`}
                placeholder="URL Form khusus tahap awal (bukan Form utama)"
              />
              {renderUrlLockButton('googleFormTahapAwalUrl')}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">
              Gunakan Form yang khusus untuk responden dari link/barcode Asesmen Tahap Awal, berbeda dari Form utama. Tempel URL lengkap Google Forms (/edit atau /viewform); tautan dan barcode akan mengikuti URL ini.
            </p>
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-emerald-400" />
              <span>URL Google Form Asesmen Tahap Lanjutan:</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="url"
                value={formData.googleFormTahapLanjutanUrl || ''}
                readOnly={isUrlLocked('googleFormTahapLanjutanUrl')}
                onChange={(e) =>
                  setFormData({ ...formData, googleFormTahapLanjutanUrl: e.target.value })
                }
                placeholder="https://docs.google.com/forms/d/FORM_ID/edit"
                className={`min-w-0 flex-1 p-2.5 rounded bg-black/60 border border-emerald-500/30 font-mono text-white ${isUrlLocked('googleFormTahapLanjutanUrl') ? 'cursor-not-allowed opacity-80' : ''}`}
              />
              {renderUrlLockButton('googleFormTahapLanjutanUrl')}
            </div>
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
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>URL Google Spreadsheet Database PPKS:</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="url"
                value={formData.googleSpreadsheetUrl}
                readOnly={isUrlLocked('googleSpreadsheetUrl')}
                onChange={(e) =>
                  setFormData({ ...formData, googleSpreadsheetUrl: e.target.value })
                }
                className={`min-w-0 flex-1 p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white ${isUrlLocked('googleSpreadsheetUrl') ? 'cursor-not-allowed opacity-80' : ''}`}
              />
              {renderUrlLockButton('googleSpreadsheetUrl')}
            </div>
            <p className="mt-1 text-[10px] text-neutral-400">Kosongkan bila belum punya database terpisah. Buat database melalui Google Workspace & Cloud Hub; jangan gunakan spreadsheet respons Google Form.</p>
          </div>

          <div>
            <label className="block text-sky-200 font-semibold mb-1 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
              <span>URL Google Drive Arsip Berkas PPKS:</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="url"
                value={formData.googleDriveFolderUrl}
                readOnly={isUrlLocked('googleDriveFolderUrl')}
                onChange={(e) =>
                  setFormData({ ...formData, googleDriveFolderUrl: e.target.value })
                }
                className={`min-w-0 flex-1 p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white ${isUrlLocked('googleDriveFolderUrl') ? 'cursor-not-allowed opacity-80' : ''}`}
                required
              />
              {renderUrlLockButton('googleDriveFolderUrl')}
            </div>
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
