import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, updateProfile } from 'firebase/auth';
import { ArrowLeft, Eye, EyeOff, UserPlus, MailCheck } from 'lucide-react';
import { auth, staffAuthPersistenceReady, createSIPANDUUserProfile } from '../lib/firebase';
import { checkTeamRegistrationService, registerPendingTeamMember, validateTeamRegistrationCode } from '../lib/teamRegistration';
import { publicAssetUrl } from '../lib/publicAssets';

interface RegistrationPageProps {
  onBack: (email?: string, notice?: string) => void;
}

export const RegistrationPage: React.FC<RegistrationPageProps> = ({ onBack }) => {
  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [jabatan, setJabatan] = useState('');
  const [unitKerja, setUnitKerja] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password minimal 8 karakter.');
      return;
    }
    if (password !== repeatPassword) {
      setError('Ulangi Password belum sama dengan Password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await staffAuthPersistenceReady;
      // Validate server availability and the shared team code before making
      // a Firebase account, to avoid creating unusable accounts on bad codes.
      await checkTeamRegistrationService();
      await validateTeamRegistrationCode(teamCode);

      const normalizedEmail = email.trim().toLowerCase();
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await updateProfile(credential.user, { displayName: nama.trim() });
      await createSIPANDUUserProfile(credential.user.uid, normalizedEmail, {
        nama: nama.trim(),
        nip: nip.trim(),
        jabatan: jabatan.trim(),
        unitKerja: unitKerja.trim(),
        noHp: '',
        photoUrl: '',
      });
      await registerPendingTeamMember(credential.user, teamCode);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setEmail(normalizedEmail);
      setCompleted(true);
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      let message = caught instanceof Error ? caught.message : 'Pendaftaran akun SIPANDU belum berhasil.';
      if (code === 'auth/email-already-in-use') message = 'Email tersebut sudah terdaftar. Silakan kembali dan masuk dengan akun yang ada.';
      else if (code === 'auth/invalid-email') message = 'Format email belum benar.';
      else if (code === 'auth/weak-password') message = 'Password terlalu lemah. Gunakan minimal 8 karakter.';
      else if (code === 'auth/operation-not-allowed') message = 'Pendaftaran email dan password belum diaktifkan di Firebase Authentication.';
      // If a network failure happened after Firebase created the account,
      // keep the session closed and explain the failure instead of claiming success.
      if (auth.currentUser) {
        try { await signOut(auth); } catch { /* the user can retry from the login screen */ }
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden px-3 py-5 text-slate-800">
      <img
        aria-hidden="true"
        alt=""
        src={publicAssetUrl('uploads/Wallpaper Background Landingpage.webp')}
        loading="eager"
        decoding="async"
        onError={(event) => {
          const image = event.currentTarget;
          if (image.dataset.fallback !== '1') {
            image.dataset.fallback = '1';
            image.src = publicAssetUrl('uploads/Wallpaper Background Landingpage.jpg');
          } else {
            image.style.display = 'none';
          }
        }}
        className="absolute inset-0 z-0 h-full w-full object-cover object-center"
      />
      <main className="relative z-10 w-full max-w-md">
        <section className="rounded-2xl border border-white/80 bg-white/[0.28] p-5 shadow-[0_12px_40px_rgba(20,40,35,0.18),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-[14px]">
          <button type="button" onClick={() => onBack(email)} className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-black underline underline-offset-4">
            <ArrowLeft className="h-4 w-4" /> Kembali ke login
          </button>
          <div className="mb-4 text-center">
            <img src={publicAssetUrl('uploads/Logo Kemensos Hadir.png')} alt="Logo resmi Kemensos Hadir" className="mx-auto mb-2 h-auto w-[135px] max-w-full object-contain" />
            <h1 className="text-xl font-extrabold text-black">Pendaftaran Akun SIPANDU</h1>
            <p className="mt-1 text-xs text-black">Daftarkan identitas petugas dan akun email Anda</p>
          </div>

          {completed ? (
            <div className="rounded-xl border border-emerald-700/30 bg-white/75 p-4 text-center text-black">
              <MailCheck className="mx-auto mb-2 h-9 w-9 text-emerald-700" />
              <h2 className="text-base font-bold">Pendaftaran berhasil dikirim</h2>
              <p className="mt-2 text-xs leading-relaxed">Tautan verifikasi telah dikirim ke <strong>{email}</strong>. Buka email tersebut dan tekan tautan verifikasi. Setelah berhasil, kembali ke SIPANDU lalu masuk menggunakan email dan Password yang baru dibuat.</p>
              <button type="button" onClick={() => onBack(email, 'Pendaftaran akun berhasil. Silakan verifikasi email terlebih dahulu, lalu masuk dengan email dan Password.')} className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white">Kembali ke halaman login</button>
            </div>
          ) : (
            <>
              {error && <div role="alert" className="mb-3 rounded-lg border border-red-400 bg-red-100/95 p-3 text-center text-xs font-medium text-black">{error}</div>}
              <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2.5">
                <label className="block text-xs font-semibold text-black">Nama
                  <input value={nama} onChange={(event) => setNama(event.target.value)} autoComplete="name" maxLength={120} required placeholder="Nama lengkap" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">NIP
                  <input value={nip} onChange={(event) => setNip(event.target.value)} autoComplete="off" maxLength={40} required placeholder="Nomor Induk Pegawai" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">Jabatan
                  <input value={jabatan} onChange={(event) => setJabatan(event.target.value)} autoComplete="organization-title" maxLength={120} required placeholder="Jabatan" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">Unit Kerja
                  <input value={unitKerja} onChange={(event) => setUnitKerja(event.target.value)} autoComplete="organization" maxLength={160} required placeholder="Unit kerja" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">Email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required placeholder="nama@instansi.go.id" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <label className="block text-xs font-semibold text-black">Password
                  <span className="relative mt-1 block">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Minimal 8 karakter" className="w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 pr-10 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                    <button type="button" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </span>
                </label>
                <label className="block text-xs font-semibold text-black">Ulangi Password
                  <span className="relative mt-1 block">
                    <input type={showRepeatPassword ? 'text' : 'password'} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Masukkan ulang password" className="w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 pr-10 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                    <button type="button" aria-label={showRepeatPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowRepeatPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-600">{showRepeatPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </span>
                </label>
                <label className="block text-xs font-semibold text-black">Kode Pendaftaran Tim
                  <input value={teamCode} onChange={(event) => setTeamCode(event.target.value)} autoComplete="off" required placeholder="Masukkan kode dari administrator" className="mt-1 w-full rounded-lg border border-white bg-white/75 px-3 py-2.5 text-sm text-black placeholder-slate-500 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" />
                </label>
                <button type="submit" disabled={isSubmitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <UserPlus className="h-4 w-4" /> {isSubmitting ? 'Mengirim pendaftaran…' : 'Kirim'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
};
