import React, { useState, useEffect } from 'react';
import {
  googleSignIn,
  googleLogout,
  getAccessToken,
  initAuthListener,
  savePPKSToFirestore,
  testFirestoreConnection,
  testFirebaseAuthConnection,
} from '../lib/firebase';
import {
  listDriveFiles,
  createDriveFolder,
  readSpreadsheetData,
  getSpreadsheetSheetTitles,
  appendPPKSToSpreadsheet,
  createGoogleSpreadsheet,
  fetchFormResponses,
  GoogleDriveFile,
} from '../lib/googleWorkspace';
import { GOOGLE_SIPANDU_RESOURCES } from '../lib/googleSIPANDUResources';
import { PPKSRecord, AppSettings } from '../types';
import {
  X,
  FileSpreadsheet,
  FolderGit2,
  FileText,
  Database,
  Cloud,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Plus,
  AlertCircle,
  LogIn,
  LogOut,
  ShieldCheck,
  FolderPlus,
} from 'lucide-react';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  ppksList: PPKSRecord[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  ppksList,
  settings,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'drive' | 'sheets' | 'forms'>('overview');
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Drive state
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [newFolderName, setNewFolderName] = useState<string>('SIPANDU ODHIV - Berkas Kemensos Sumut 2026');

  // Sheets state
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState<string>(settings.googleSpreadsheetUrl.includes('1yA8KemensosODHIVSumut2026_LiveSync') ? GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl : settings.googleSpreadsheetUrl);
  const [sheetRows, setSheetRows] = useState<string[][]>([]);

  // Forms state
  const [formIdInput, setFormIdInput] = useState<string>(settings.googleFormTahapAwalUrl.includes('SIPANDU-ODHIV-Lanjutan-Sumut') ? GOOGLE_SIPANDU_RESOURCES.formEditorUrl : settings.googleFormTahapAwalUrl);
  const [formResponsesCount, setFormResponsesCount] = useState<number | null>(null);

  // Firestore sync state
  const [firestoreSyncedCount, setFirestoreSyncedCount] = useState<number>(0);
  const [diagnosticResults, setDiagnosticResults] = useState<Array<{service: string; ok: boolean; message: string; checkedAt: string}>>([]);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState<boolean>(false);

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setStatusMessage(null);
    const results: Array<{service: string; ok: boolean; message: string; checkedAt: string}> = [];
    try {
      results.push(await testFirebaseAuthConnection());
      results.push(await testFirestoreConnection());
      const accessToken = await getAccessToken();
      const now = new Date().toISOString();
      if (!googleUser) {
        results.push({ service: 'Google Workspace', ok: false, message: 'Belum masuk dengan akun Google di sesi ini.', checkedAt: now });
      } else if (!accessToken) {
        results.push({ service: 'Google Workspace', ok: false, message: 'Akun Google terdeteksi, tetapi token akses API tidak tersedia. Jalankan otorisasi Google untuk sesi ini.', checkedAt: now });
      } else {
        results.push({ service: 'Google Workspace', ok: true, message: 'Token akses tersedia. Izin Drive, Sheets, dan Forms perlu diuji melalui tombol masing-masing karena akses dapat berbeda per layanan.', checkedAt: now });
      }
      setDiagnosticResults(results);
      const failures = results.filter((r) => !r.ok).length;
      setStatusMessage({ type: failures ? 'error' : 'success', text: failures ? `Pemeriksaan selesai: ${failures} dari ${results.length} pemeriksaan perlu perhatian. Lihat rincian di bawah.` : 'Pemeriksaan dasar selesai. Periksa layanan Google satu per satu untuk memastikan izin API.' });
    } catch (error: any) {
      const message = error?.message || String(error) || 'Kesalahan tidak diketahui saat pemeriksaan.';
      setDiagnosticResults([{ service: 'Pemeriksaan', ok: false, message, checkedAt: new Date().toISOString() }]);
      setStatusMessage({ type: 'error', text: `Pemeriksaan gagal: ${message}` });
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuthListener(
      (user, tok) => {
        setGoogleUser(user);
        setToken(tok);
      },
      () => {
        setGoogleUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setToken(res.accessToken);
        setStatusMessage({ type: 'success', text: `Berhasil terhubung dengan Google (${res.user.email})` });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: err.message || 'Gagal masuk dengan Google' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await googleLogout();
    setGoogleUser(null);
    setToken(null);
    setStatusMessage({ type: 'success', text: 'Berhasil keluar dari akun Google' });
  };

  // Google Drive Actions
  const handleLoadDriveFiles = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const files = await listDriveFiles('', GOOGLE_SIPANDU_RESOURCES.driveFolderId);
      setDriveFiles(files);
      setStatusMessage({ type: 'success', text: `Ditemukan ${files.length} berkas di Google Drive.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setLoading(true);
    try {
      const folder = await createDriveFolder(newFolderName.trim());
      setStatusMessage({ type: 'success', text: `Folder "${folder.name}" berhasil dibuat di Google Drive!` });
      handleLoadDriveFiles();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Google Sheets Actions
  const handleReadSheet = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const tabs = await getSpreadsheetSheetTitles(spreadsheetIdInput);
      if (!tabs.length) throw new Error('Spreadsheet tidak memiliki tab yang dapat dibaca.');
      const rows = await readSpreadsheetData(spreadsheetIdInput, `'${tabs[0].replace(/'/g, "''")}'!A1:Z100`);
      setSheetRows(rows);
      setStatusMessage({ type: 'success', text: `Berhasil membaca ${rows.length} baris dari Google Sheet.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAllToSheet = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      throw new Error('Spreadsheet yang dikonfigurasi adalah sumber respons Google Form. Untuk mencegah perubahan pada respons asli, sinkronisasi data PPKS harus menggunakan Spreadsheet database terpisah dengan tab SIPANDU dan header yang sesuai.');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewSpreadsheet = async () => {
    setLoading(true);
    try {
      const newId = await createGoogleSpreadsheet('Database SIPANDU ODHIV Sumut 2026 (Live)');
      const newUrl = `https://docs.google.com/spreadsheets/d/${newId}`;
      setSpreadsheetIdInput(newUrl);
      onUpdateSettings({ ...settings, googleSpreadsheetUrl: newUrl });
      setStatusMessage({ type: 'success', text: `Google Spreadsheet baru berhasil dibuat! (ID: ${newId})` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Google Forms Actions
  const handleCheckFormResponses = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const responses = await fetchFormResponses(formIdInput);
      setFormResponsesCount(responses.length);
      setStatusMessage({ type: 'success', text: `Terdeteksi ${responses.length} respon pada Google Form ini.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Firestore Sync All
  const handleSyncFirestore = async () => {
    setLoading(true);
    setStatusMessage(null);
    let count = 0;
    let failed = 0;
    try {
      for (const p of ppksList) {
        const ok = await savePPKSToFirestore(p);
        if (ok) count++;
        else failed++;
      }
      setFirestoreSyncedCount(count);
      if (failed > 0) {
        setStatusMessage({ type: 'error', text: `Sinkronisasi Firestore sebagian gagal: ${count} berhasil, ${failed} gagal. Jalankan “Periksa Koneksi Sekarang” dan periksa Security Rules.` });
      } else {
        setStatusMessage({ type: 'success', text: `${count} berkas PPKS berhasil disimpan ke Firebase Firestore.` });
      }
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Sinkronisasi Firestore gagal: ${error?.message || String(error)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-none select-none text-white">
      <div className="relative w-full max-w-3xl bg-[#0c180e] border border-rose-500/40 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-rose-500/30 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
              <Cloud className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Google Workspace & Cloud Hub</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 border border-emerald-500/40">
                  Drive • Sheets • Forms • Firebase
                </span>
              </h3>
              <p className="text-[11px] text-sky-200">
                Pusat integrasi cloud resmi SIPANDU ODHIV Kementerian Sosial RI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Message Toast */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-b border-emerald-500/40'
                : 'bg-rose-950/90 text-rose-200 border-b border-rose-500/40'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-3 border-b border-rose-500/20 bg-black/30 overflow-x-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-sky-300" />
            <span>Koneksi Akun</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('drive');
              if (token && driveFiles.length === 0) handleLoadDriveFiles();
            }}
            className={`py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'drive'
                ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-sky-300" />
            <span>Google Drive</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sheets'
                ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('forms')}
            className={`py-2 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'forms'
                ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-sky-300" />
            <span>Google Forms</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 text-xs">
          {/* TAB 1: OVERVIEW & GOOGLE SIGN-IN */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-black/40 border border-sky-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">Diagnostik Koneksi</h4>
                    <p className="text-[11px] text-neutral-300">Uji Firebase Auth dan Firestore secara eksplisit. Hasil pemeriksaan dan waktu akan ditampilkan di sini.</p>
                  </div>
                  <button type="button" onClick={handleRunDiagnostics} disabled={loading || diagnosticsRunning} className="px-3 py-2 rounded-lg bg-sky-800 hover:bg-sky-700 text-white font-semibold text-xs disabled:opacity-50">
                    {diagnosticsRunning ? 'Memeriksa…' : 'Periksa Koneksi Sekarang'}
                  </button>
                </div>
                {diagnosticResults.length > 0 && (
                  <div className="space-y-2">
                    {diagnosticResults.map((result) => (
                      <div key={result.service} className={`rounded-lg border p-2.5 ${result.ok ? 'border-emerald-500/40 bg-emerald-950/40' : 'border-rose-500/40 bg-rose-950/40'}`}>
                        <div className="flex items-center gap-2 font-semibold text-white">
                          {result.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                          <span>{result.service}: {result.ok ? 'LULUS' : 'PERLU DIPERIKSA'}</span>
                        </div>
                        <p className="mt-1 text-neutral-200 break-words">{result.message}</p>
                        <p className="mt-1 text-[10px] text-neutral-400">Diperiksa: {new Date(result.checkedAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 rounded-xl bg-black/50 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {googleUser ? (
                    <img
                      src={googleUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120'}
                      alt="Google User"
                      className="w-12 h-12 rounded-full border border-emerald-400"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-700">
                      <Cloud className="w-6 h-6 text-neutral-400" />
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {googleUser ? googleUser.displayName : 'Google Workspace Belum Terhubung'}
                    </h4>
                    <p className="text-neutral-300 text-[11px]">
                      {googleUser ? googleUser.email : 'Hubungkan akun Google untuk sinkronisasi Drive, Sheets, dan Forms.'}
                    </p>
                    <span className="text-[10px] text-sky-300 font-mono">
                      Status Token: {token ? 'Aktif (In-Memory Safe)' : 'Menunggu Otorisasi'}
                    </span>
                  </div>
                </div>

                <div>
                  {!googleUser ? (
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={loading}
                      className="px-4 py-2.5 rounded-xl bg-white text-neutral-800 hover:bg-neutral-100 font-semibold text-xs flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Masuk dengan Google</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="px-3.5 py-2 rounded-xl bg-rose-950 text-rose-200 border border-rose-500/40 hover:bg-rose-900 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Putuskan Akun</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Status Firebase Firestore */}
              <div className="p-4 rounded-xl bg-black/40 border border-rose-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-300" />
                    <span className="font-bold text-white">Firebase Firestore Database</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                    Aktif (asia-southeast1)
                  </span>
                </div>
                <p className="text-neutral-300 text-[11px]">
                  Database cloud NoSQL aktif untuk persistensi data PPKS, dokumen, dan pengaturan aplikasi secara real-time.
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncFirestore}
                    disabled={loading}
                    className="px-3.5 py-2 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Sinkronkan {ppksList.length} PPKS ke Firestore</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE */}
          {activeTab === 'drive' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rose-500/20">
                <div>
                  <h4 className="font-bold text-white text-sm">Google Drive File Storage</h4>
                  <p className="text-[11px] text-neutral-300">
                    Penyimpanan berkas foto KTP, KK, foto rumah, dan dokumen PDF asesmen.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadDriveFiles}
                    disabled={loading || !token}
                    className="px-3 py-1.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Muat Berkas</span>
                  </button>
                </div>
              </div>

              {/* Buat Folder Khusus */}
              <div className="p-3.5 rounded-xl bg-black/50 border border-emerald-500/30 flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full sm:flex-1 p-2 rounded bg-black/70 border border-rose-500/30 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={loading || !token}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 font-semibold text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Buat Folder Drive</span>
                </button>
              </div>

              {/* Daftar Berkas Drive */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-sky-200">Berkas Terakhir di Google Drive:</span>
                {driveFiles.length === 0 ? (
                  <p className="text-neutral-400 italic text-[11px] p-4 text-center bg-black/30 rounded-lg">
                    {token ? 'Belum memuat berkas atau folder masih kosong.' : 'Silakan masuk dengan Google di tab "Koneksi Akun" untuk melihat berkas Drive.'}
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {driveFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-2.5 rounded-lg bg-black/50 border border-neutral-800 flex items-center justify-between hover:border-emerald-500/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-sky-300 shrink-0" />
                          <span className="text-white font-medium truncate">{file.name}</span>
                        </div>
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-300 hover:text-sky-100 shrink-0 ml-2"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE SHEETS */}
          {activeTab === 'sheets' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-white text-sm">Google Sheets Database Live Sync</h4>
                <p className="text-[11px] text-neutral-300">
                  Sinkronisasi baris data PPKS ke lembar kerja spreadsheet secara otomatis.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-black/50 border border-emerald-500/30 space-y-3">
                <label className="block text-sky-200 font-semibold text-[11px]">
                  ID atau URL Google Spreadsheet:
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    value={spreadsheetIdInput}
                    onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                    placeholder="URL Google Spreadsheet"
                    className="w-full sm:flex-1 p-2 rounded bg-black/70 border border-rose-500/30 text-xs text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleReadSheet}
                    disabled={loading || !token}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-sky-900 hover:bg-sky-800 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <span>Baca Data</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncAllToSheet}
                    disabled={loading || !token}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <span>Ekspor {ppksList.length} PPKS</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-neutral-800 flex justify-between items-center">
                  <span className="text-[10px] text-neutral-400">Belum punya spreadsheet?</span>
                  <button
                    type="button"
                    onClick={handleCreateNewSpreadsheet}
                    disabled={loading || !token}
                    className="text-emerald-300 hover:underline font-semibold text-[11px] flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Buat Spreadsheet Baru SIPANDU ODHIV</span>
                  </button>
                </div>
              </div>

              {sheetRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-black/60 max-h-48">
                  <table className="w-full text-[10px]">
                    <tbody>
                      {sheetRows.slice(0, 8).map((row, rIdx) => (
                        <tr key={rIdx} className={rIdx === 0 ? 'bg-emerald-950 font-bold' : 'border-t border-neutral-800'}>
                          {row.slice(0, 6).map((cell, cIdx) => (
                            <td key={cIdx} className="p-1.5 whitespace-nowrap">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GOOGLE FORMS */}
          {activeTab === 'forms' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-white text-sm">Google Forms Responden Sync</h4>
                <p className="text-[11px] text-neutral-300">
                  Membaca respon masuk dari formulir online Asesmen Tahap Awal & Asesmen Kesehatan Mental.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-black/50 border border-emerald-500/30 space-y-3">
                <label className="block text-sky-200 font-semibold text-[11px]">
                  ID atau URL Google Form:
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="text"
                    value={formIdInput}
                    onChange={(e) => setFormIdInput(e.target.value)}
                    placeholder="URL Google Form"
                    className="w-full sm:flex-1 p-2 rounded bg-black/70 border border-rose-500/30 text-xs text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCheckFormResponses}
                    disabled={loading || !token}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Cek Respon Form</span>
                  </button>
                </div>
              </div>

              {formResponsesCount !== null && (
                <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-200">
                  Total respon terverifikasi: <strong>{formResponsesCount} Responden</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-rose-500/20 bg-black/50 flex items-center justify-between">
          <span className="text-[10px] text-neutral-400">
            Terhubung ke Google Cloud Client: <code>gen-lang-client-0197631978</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
