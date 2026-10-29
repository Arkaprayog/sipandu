import React, { useEffect, useState } from 'react';
import type { StageOneIntakePayload } from '../types';
import { submitPublicStageOneIntake } from '../lib/firebase';
import { compressImageForLocalStorage } from '../lib/imageCompression';
import { publicAssetUrl } from '../lib/publicAssets';

type PhotoField = 'fotoDiri' | 'fotoKtp';
const cities = ['Kota Medan', 'Kab. Deli Serdang', 'Kota Binjai', 'Kota Pematangsiantar', 'Kab. Asahan', 'Kab. Karo', 'Kab. Tapanuli Utara', 'Kota Tanjungbalai', 'Kab. Labuhanbatu', 'Kab. Simalungun', 'Kota Tebing Tinggi', 'Kab. Toba', 'Kab. Dairi', 'Kepulauan Nias'];

export const StageOneRespondentPage: React.FC = () => {
  const [namaLengkap, setNamaLengkap] = useState('');
  const [nik, setNik] = useState('');
  const [usia, setUsia] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<'' | 'Laki-laki' | 'Perempuan'>('');
  const [kotaDomisili, setKotaDomisili] = useState('');
  const [noHpWa, setNoHpWa] = useState('');
  const [jenisBantuan, setJenisBantuan] = useState('');
  const [fotoDiri, setFotoDiri] = useState('');
  const [fotoKtp, setFotoKtp] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successId, setSuccessId] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => { document.title = 'Asesmen Tahap Awal — SIPANDU'; }, []);

  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>, field: PhotoField) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      const compressed = await compressImageForLocalStorage(file, 1200, 220 * 1024);
      if (field === 'fotoDiri') setFotoDiri(compressed);
      else setFotoKtp(compressed);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'Foto tidak dapat diproses.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const browserForm = new FormData(event.currentTarget);
    if (String(browserForm.get('companyWebsite') || '').trim()) return;
    const cleanNik = nik.replace(/\D/g, '');
    const parsedAge = Number(usia);
    if (!/^\d{16}$/.test(cleanNik)) { setError('NIK harus tepat 16 digit angka.'); return; }
    if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 100) { setError('Usia harus diisi dengan angka 1 sampai 100 tahun.'); return; }
    if (!jenisBantuan) { setError('Silakan pilih jenis bantuan yang diharapkan.'); return; }
    if (!fotoDiri || !fotoKtp) { setError('Foto diri dan foto KTP wajib diunggah sebelum mengirim asesmen.'); return; }
    if (!consent) { setError('Konfirmasi pemahaman penggunaan data wajib dicentang sebelum mengirim.'); return; }

    setSaving(true);
    try {
      const payload: StageOneIntakePayload = {
        timestamp: new Date().toISOString(),
        namaLengkap: namaLengkap.trim(),
        nik: cleanNik,
        usia: parsedAge,
        jenisKelamin: jenisKelamin as 'Laki-laki' | 'Perempuan',
        kotaDomisili,
        alamatLengkap: '',
        noHpWa: noHpWa.trim(),
        jenisBantuan: jenisBantuan.trim(),
        intervensiMental: '',
        desil: 0,
        fotoDiri,
        fotoKtp,
        statusAsesmen: 'Tahap Awal',
      };
      setSuccessId(await submitPublicStageOneIntake(payload));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Formulir belum berhasil dikirim. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (successId) return (
    <main className="min-h-screen bg-[#07130b] px-4 py-10 text-white">
      <section className="mx-auto max-w-xl rounded-2xl border border-emerald-500/40 bg-[#102517] p-6 shadow-2xl sm:p-8">
        <div className="mb-4 flex justify-center"><img src={publicAssetUrl('uploads/logo-kemsos.webp')} alt="Logo Kementerian Sosial Republik Indonesia" className="h-20 w-auto object-contain" /></div>
        <div className="mb-4 flex justify-center"><span className="rounded-full border border-emerald-300/40 bg-emerald-900/60 px-4 py-3 text-emerald-200">✓</span></div>
        <h1 className="text-center text-2xl font-black">Asesmen Tahap Awal Terkirim</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-emerald-100">Terima kasih sudah berpartisipasi dalam program bantuan Atensi dari Kementerian Sosial RI. Data anda akan kami simpan dan terjamin kerahasiaannya. Petugas kami akan memberikan link asesmen berikutnya kepada anda untuk verifikasi lebih lanjut. Mohon untuk tetap melanjutkan tahap selanjutnya. Terima kasih atas partisipasinya. Salam hangat, Deny Arifin M.S - DRSKPNO</p>
        <p className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-center text-xs text-neutral-300">ID referensi pengiriman: <span className="break-all font-mono text-emerald-200">{successId}</span></p>
        <p className="mt-5 text-center text-xs text-neutral-400">Terima kasih. Anda dapat menutup halaman ini.</p>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#07130b] px-4 py-6 text-white sm:py-10">
      <section className="mx-auto max-w-2xl rounded-2xl border border-rose-500/35 bg-[#0c1b10] p-4 shadow-[0_0_28px_rgba(244,63,94,0.12)] sm:p-7">
        <header className="mb-6 border-b border-rose-500/25 pb-5 text-center">
          <img src={publicAssetUrl('uploads/logo-kemsos.webp')} alt="Logo Kementerian Sosial Republik Indonesia" className="mx-auto mb-3 h-16 w-auto object-contain" />
          <p className="mb-2 inline-flex rounded border border-emerald-400/50 bg-emerald-950 px-3 py-1 text-[10px] font-bold tracking-wider text-emerald-200">KEMENSOS RI • ASESMEN TAHAP AWAL</p>
          <h1 className="text-xl font-black leading-snug sm:text-2xl">Formulir Asesmen Tahap Awal</h1>
          <p className="mt-2 text-xs leading-relaxed text-neutral-300 sm:text-sm">Mohon mengisi seluruh pertanyaan di bawah ini dengan data yang valid dan dapat dipertanggungjawabkan. Pengisian formulir ini merupakan tahap awal asesmen program bantuan Kementerian Sosial; petugas kami akan menghubungi Anda kembali untuk tahapan selanjutnya</p>
        </header>
        {error && <div role="alert" className="mb-4 rounded-lg border border-rose-400/50 bg-rose-950/60 p-3 text-xs leading-relaxed text-rose-100">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-rose-500/25 bg-black/35 p-3 text-xs text-neutral-300"><span className="font-bold text-sky-200">Timestamp:</span> dicatat otomatis saat formulir dikirim.</div>
          <div>
            <label className="mb-1 block text-xs font-bold text-sky-200">Nama Lengkap <span className="text-rose-400">*</span></label>
            <input required maxLength={120} value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} autoComplete="name" placeholder="Nama lengkap sesuai KTP" className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 text-sm text-white outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-sky-200">NIK (16 digit) <span className="text-rose-400">*</span></label>
            <input required inputMode="numeric" autoComplete="off" maxLength={16} minLength={16} pattern="[0-9]{16}" value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="16 digit NIK" className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 font-mono text-sm text-white outline-none focus:border-emerald-400" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-bold text-sky-200">Usia (tahun) <span className="text-rose-400">*</span></label><input required type="number" min={1} max={100} value={usia} onChange={(e) => setUsia(e.target.value)} placeholder="Contoh: 32" className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 text-sm text-white outline-none focus:border-emerald-400" /></div>
            <div><label className="mb-1 block text-xs font-bold text-sky-200">Jenis Kelamin <span className="text-rose-400">*</span></label><select required value={jenisKelamin} onChange={(e) => setJenisKelamin(e.target.value as '' | 'Laki-laki' | 'Perempuan')} className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 text-sm text-white outline-none focus:border-emerald-400"><option value="">Pilih jenis kelamin</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select></div>
          </div>
          <div><label className="mb-1 block text-xs font-bold text-sky-200">Kota/Kabupaten Domisili <span className="text-rose-400">*</span></label><select required value={kotaDomisili} onChange={(e) => setKotaDomisili(e.target.value)} className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 text-sm text-white outline-none focus:border-emerald-400"><option value="">Pilih kota/kabupaten</option>{cities.map((city) => <option value={city} key={city}>{city}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-bold text-sky-200">No. HP / WhatsApp <span className="text-rose-400">*</span></label><input required type="tel" minLength={8} maxLength={25} autoComplete="tel" value={noHpWa} onChange={(e) => setNoHpWa(e.target.value)} placeholder="08xxxxxxxxxx" className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 font-mono text-sm text-white outline-none focus:border-emerald-400" /></div>
          <div><label className="mb-1 block text-xs font-bold text-sky-200">Jenis Bantuan yang Diharapkan <span className="text-rose-400">*</span></label><select required value={jenisBantuan} onChange={(e) => setJenisBantuan(e.target.value)} className="w-full rounded-lg border border-rose-500/30 bg-black/45 p-3 text-sm text-white outline-none focus:border-emerald-400"><option value="">Pilih jenis bantuan</option><option value="BANTUAN KEWIRUSAHAAN">BANTUAN KEWIRUSAHAAN</option><option value="BANTUAN PEMENUHAN NUTRISI">BANTUAN PEMENUHAN NUTRISI</option></select></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([[ 'fotoDiri', 'Foto Diri *' ], [ 'fotoKtp', 'Foto KTP *' ]] as Array<[PhotoField, string]>).map(([field, label]) => <div key={field} className="rounded-xl border border-rose-500/25 bg-black/35 p-3"><label className="mb-2 block text-xs font-bold text-sky-200">{label} <span className="text-rose-400">(wajib)</span></label><input type="file" accept="image/jpeg,image/png,image/webp" capture={field === 'fotoDiri' ? 'user' : 'environment'} onChange={(e) => void handlePhoto(e, field)} className="w-full text-xs text-neutral-300" />{(field === 'fotoDiri' ? fotoDiri : fotoKtp) ? <p className="mt-2 text-[10px] text-emerald-200">Foto berhasil diproses dan siap dikirim.</p> : <p className="mt-2 text-[10px] text-rose-200">Foto wajib diunggah.</p>}</div>)}
          </div>
          {photoBusy && <p role="status" className="text-xs text-sky-200">Mengompres foto…</p>}
          <label className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-3 text-xs leading-relaxed text-emerald-100"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-0.5" /><span>Saya memahami data ini digunakan untuk asesmen dan tindak lanjut program, dan hanya dapat diakses petugas yang berwenang.</span></label>
          <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden"><label>Website<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label></div>
          <button type="submit" disabled={saving || photoBusy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-gradient-to-r from-emerald-800 to-teal-800 px-5 py-3.5 text-sm font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Mengirim dan menyimpan…' : 'Kirim Asesmen Tahap Awal'}</button>
          <p className="text-center text-[10px] leading-relaxed text-neutral-500">Jangan tutup halaman sebelum muncul konfirmasi bahwa data berhasil dikirim.</p>
        </form>
      </section>
    </main>
  );
};
