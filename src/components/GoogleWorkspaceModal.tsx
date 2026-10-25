import React, { useState, useEffect } from 'react';
import {
  googleSignIn,
  completeGoogleRedirectSignIn,
  getWorkspaceGoogleEmail,
  googleLogout,
  getAccessToken,
  initAuthListener,
  savePPKSToFirestore,
  fetchPPKSFromFirestore,
  removeLegacyDemoPPKSFromFirestore,
  testFirestoreConnection,
  testFirebaseAuthConnection,
} from '../lib/firebase';
import {
  listDriveFiles,
  listDriveSpreadsheets,
  importPPKSFromSpreadsheet,
  createDriveFolder,
  readSpreadsheetData,
  getSpreadsheetSheetTitles,
  upsertPPKSInSpreadsheet,
  ensureSIPANDUDatabaseSheet,
  extractSpreadsheetId,
  createGoogleSpreadsheet,
  fetchFormResponses,
  removeLegacyDemoRowsFromSpreadsheet,
  removeObviousDemoFilesFromDrive,
  GoogleDriveFile,
} from '../lib/googleWorkspace';
import { GOOGLE_SIPANDU_RESOURCES, GOOGLE_WORKSPACE_EMAIL } from '../lib/googleSIPANDUResources';
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
  onLoadPPKSFromCloud: (records: PPKSRecord[]) => void;
}

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  ppksList,
  settings,
  onUpdateSettings,
  onLoadPPKSFromCloud,
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
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState<string>(() => {
    const configured = settings.googleSpreadsheetUrl?.trim() || '';
    // The previous default was a placeholder and the fallback silently selected
    // the Form response sheet. Never use that sheet as the PPKS write destination.
    if (!configured || configured.includes('1yA8KemensosODHIVSumut2026_LiveSync')) return '';
    try {
      if (extractSpreadsheetId(configured) === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId) return '';
    } catch {
      return '';
    }
    return configured;
  });
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [spreadsheetFiles, setSpreadsheetFiles] = useState<GoogleDriveFile[]>([]);
  const [sourceSpreadsheetUrl, setSourceSpreadsheetUrl] = useState<string>(
    settings.googleSpreadsheetSourceUrl?.trim() || ''
  );
  const [sourceSpreadsheetTab, setSourceSpreadsheetTab] = useState<string>(
    settings.googleSpreadsheetSourceTab?.trim() || ''
  );

  // Forms state
  const [formIdInput, setFormIdInput] = useState<string>(settings.googleFormTahapAwalUrl.includes('SIPANDU-ODHIV-Lanjutan-Sumut') ? GOOGLE_SIPANDU_RESOURCES.formEditorUrl : settings.googleFormTahapAwalUrl);
  const [formResponsesCount, setFormResponsesCount] = useState<number | null>(null);

  // Firestore sync state
  const [firestoreSyncedCount, setFirestoreSyncedCount] = useState<number>(0);
  const [diagnosticResults, setDiagnosticResults] = useState<Array<{service: string; ok: boolean; message: string; checkedAt: string}>>([]);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState<boolean>(false);
  const firestoreDiagnostic = diagnosticResults.find((result) => result.service === 'Firestore');
  const firestoreBadgeLabel = !firestoreDiagnostic
    ? 'Belum diperiksa'
    : firestoreDiagnostic.ok ? 'Terverifikasi' : 'Perlu perhatian';
  const firestoreBadgeClass = !firestoreDiagnostic
    ? 'bg-neutral-900 text-neutral-300 border-neutral-700'
    : firestoreDiagnostic.ok
      ? 'bg-emerald-950 text-emerald-200 border-emerald-600/40'
      : 'bg-rose-950 text-rose-200 border-rose-600/40';

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setStatusMessage(null);
    const results: Array<{service: string; ok: boolean; message: string; checkedAt: string}> = [];
    const addResult = (service: string, ok: boolean, message: string) => {
      results.push({ service, ok, message, checkedAt: new Date().toISOString() });
    };
    const runCheck = async (service: string, check: () => Promise<string>) => {
      try {
        addResult(service, true, await check());
      } catch (error: any) {
        addResult(service, false, error?.message || String(error) || 'Kesalahan tidak diketahui.');
      }
    };

    try {
      // Isolate checks so a single failure never hides the remaining service results.
      await runCheck('Firebase Auth', async () => {
        const result = await testFirebaseAuthConnection();
        if (!result.ok) throw new Error(result.message);
        return result.message;
      });
      await runCheck('Firestore', async () => {
        const result = await testFirestoreConnection();
        if (!result.ok) throw new Error(result.message);
        return result.message;
      });

      const expectedWorkspaceEmail = GOOGLE_WORKSPACE_EMAIL.toLowerCase();
      const activeGoogleEmail = getWorkspaceGoogleEmail(googleUser);
      const workspaceAccountOk = !!activeGoogleEmail && activeGoogleEmail.toLowerCase() === expectedWorkspaceEmail;
      let accessToken: string | null = null;
      if (!googleUser) {
        addResult('Akun Google Workspace', false, 'Belum masuk dengan akun Google pada sesi ini.');
      } else if (!workspaceAccountOk) {
        addResult('Akun Google Workspace', false, `Akun yang tersambung adalah ${activeGoogleEmail || 'profil Google yang tidak membagikan alamat email'}, sedangkan sumber data SIPANDU dibagikan ke ${GOOGLE_WORKSPACE_EMAIL}. Keluar dari akun Google yang salah, lalu masuk kembali dan pilih alamat tersebut.`);
      } else {
        try {
          accessToken = await getAccessToken();
          addResult('Akun Google Workspace', !!accessToken, accessToken
            ? `Identitas Google cocok (${activeGoogleEmail}) dan token API tersedia; akses sumber data tetap diuji terpisah.`
            : 'Identitas Google cocok, tetapi token API tidak tersedia atau sudah kedaluwarsa. Tekan “Pulihkan Izin Google API”.');
        } catch (error: any) {
          addResult('Akun Google Workspace', false, error?.message || String(error));
        }
      }

      if (!accessToken || !workspaceAccountOk) {
        const reason = !workspaceAccountOk
          ? 'Tidak diuji karena akun Google yang benar belum tersambung.'
          : 'Tidak diuji karena token Google API tidak tersedia.';
        addResult('Google Drive sumber', false, reason);
        addResult('Google Sheets respons', false, reason);
        addResult('Google Forms respons', false, reason);
      } else {
        await runCheck('Google Drive sumber', async () => {
          const files = await listDriveFiles('', GOOGLE_SIPANDU_RESOURCES.driveFolderId);
          return `Folder sumber dapat dibaca; ${files.length} berkas ditemukan pada halaman pertama.`;
        });
        await runCheck('Google Sheets respons', async () => {
          const titles = await getSpreadsheetSheetTitles(GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId);
          if (!titles.length) throw new Error('Tidak ada tab spreadsheet yang terbaca. Periksa ID dan izin berbagi.');
          return `Spreadsheet respons dapat dibaca; tab: ${titles.join(', ')}.`;
        });
        await runCheck('Google Forms respons', async () => {
          const responses = await fetchFormResponses(GOOGLE_SIPANDU_RESOURCES.formId);
          return `Form sumber dapat diakses melalui API; ${responses.length} respons terbaca.`;
        });
      }

      setDiagnosticResults(results);
      const failures = results.filter((result) => !result.ok).length;
      setStatusMessage({
        type: failures ? 'error' : 'success',
        text: failures
          ? `Pemeriksaan selesai: ${failures} dari ${results.length} layanan perlu perhatian. Setiap layanan menampilkan penyebabnya sendiri.`
          : `Semua ${results.length} pemeriksaan koneksi berhasil.`,
      });
    } catch (error: any) {
      const message = error?.message || String(error) || 'Kesalahan tidak diketahui saat pemeriksaan.';
      setDiagnosticResults([...results, { service: 'Diagnostik', ok: false, message, checkedAt: new Date().toISOString() }]);
      setStatusMessage({ type: 'error', text: `Diagnostik mengalami kesalahan: ${message}` });
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

  // A redirect-based OAuth flow reloads this page after Google consent.
  // Consume the redirect result once during startup and restore the API token.
  useEffect(() => {
    let active = true;
    completeGoogleRedirectSignIn()
      .then((result) => {
        if (!active || !result) return;
        setGoogleUser(result.user);
        setToken(result.accessToken);
        setStatusMessage({
          type: 'success',
          text: `Berhasil mengotorisasi Google (${getWorkspaceGoogleEmail(result.user) || GOOGLE_WORKSPACE_EMAIL}). Izin API telah dipulihkan.`,
        });
      })
      .catch((error: any) => {
        if (!active) return;
        setStatusMessage({
          type: 'error',
          text: error?.message || 'Hasil pengalihan login Google tidak dapat diverifikasi.',
        });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const configuredSource = settings.googleSpreadsheetSourceUrl?.trim() || '';
    setSourceSpreadsheetUrl(configuredSource);
    setSourceSpreadsheetTab(settings.googleSpreadsheetSourceTab?.trim() || '');
  }, [settings.googleSpreadsheetSourceUrl, settings.googleSpreadsheetSourceTab]);

  useEffect(() => {
    const configured = settings.googleSpreadsheetUrl?.trim() || '';
    if (!configured || configured.includes('1yA8KemensosODHIVSumut2026_LiveSync')) {
      setSpreadsheetIdInput('');
      return;
    }
    try {
      if (extractSpreadsheetId(configured) === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId) {
        setSpreadsheetIdInput('');
        return;
      }
    } catch {
      setSpreadsheetIdInput('');
      return;
    }
    setSpreadsheetIdInput(configured);
  }, [settings.googleSpreadsheetUrl]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setToken(res.accessToken);
        setStatusMessage({ type: 'success', text: `Berhasil terhubung dengan Google (${getWorkspaceGoogleEmail(res.user) || GOOGLE_WORKSPACE_EMAIL})` });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Browser sedang dialihkan ke Google untuk menyelesaikan otorisasi. Setelah kembali ke SIPANDU, hasil dan token akan dipulihkan otomatis.',
        });
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
      const configuredFolder = settings.googleDriveFolderUrl?.trim() || '';
      const folderToRead = configuredFolder.includes('1Kemensos_Sumut_Berkas_PPKS_ODHIV')
        ? GOOGLE_SIPANDU_RESOURCES.driveFolderId
        : (configuredFolder || GOOGLE_SIPANDU_RESOURCES.driveFolderId);
      const files = await listDriveFiles('', folderToRead);
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

  // Discover the user's actual spreadsheets rather than inventing a sample/default file.
  const handleDiscoverSpreadsheets = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const files = await listDriveSpreadsheets();
      setSpreadsheetFiles(files);
      if (!files.length) {
        setStatusMessage({ type: 'error', text: 'Google Drive dapat diakses, tetapi tidak ada Google Spreadsheet yang terlihat oleh akun ini. Periksa akun, izin berbagi, dan folder Drive Bersama.' });
        return;
      }
      setStatusMessage({
        type: 'success',
        text: `Ditemukan ${files.length} Google Spreadsheet yang benar-benar dapat diakses akun ini. Pilih file sumber yang benar dari daftar di bawah; SIPANDU tidak akan memilih file secara otomatis.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Gagal mencari spreadsheet di Google Drive: ${err?.message || String(err)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSourceSpreadsheetSelect = (fileId: string) => {
    const file = spreadsheetFiles.find((candidate) => candidate.id === fileId);
    if (!file) return;
    const url = file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
    setSourceSpreadsheetUrl(url);
    setSourceSpreadsheetTab('');
    onUpdateSettings({
      ...settings,
      googleSpreadsheetSourceUrl: url,
      googleSpreadsheetSourceName: file.name,
      googleSpreadsheetSourceTab: '',
    });
    setStatusMessage({ type: 'success', text: `Spreadsheet sumber dipilih: ${file.name}. Tekan “Muat Data PPKS + Asesmen” untuk membaca data asli.` });
  };

  const handleImportPPKSFromSpreadsheet = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const sourceUrl = sourceSpreadsheetUrl.trim();
      if (!sourceUrl) throw new Error('Pilih atau masukkan URL Google Spreadsheet sumber terlebih dahulu.');
      const imported = await importPPKSFromSpreadsheet(sourceUrl, sourceSpreadsheetTab || undefined);
      setSheetRows(imported.previewRows);
      setSourceSpreadsheetTab(imported.selectedTab);
      onUpdateSettings({
        ...settings,
        googleSpreadsheetSourceUrl: sourceUrl,
        googleSpreadsheetSourceName: imported.spreadsheetTitle,
        googleSpreadsheetSourceTab: imported.selectedTab,
      });
      if (!imported.records.length) {
        const headerPreview = (imported.previewRows[0] || []).slice(0, 12).join(' | ');
        throw new Error(
          `Berhasil membaca ${imported.rowsRead} baris dari “${imported.spreadsheetTitle}” (tab “${imported.selectedTab}”), tetapi tidak menemukan kolom Nama PPKS/responden yang dikenali. Header terdeteksi: ${headerPreview || '(kosong)'}. Pilih tab respons yang benar atau periksa nama kolom.`
        );
      }
      onLoadPPKSFromCloud(imported.records);
      const diagnosticSummary = imported.nikColumnDiagnostics.length
        ? imported.nikColumnDiagnostics.map((column) =>
            `${column.header}: ${column.validNIKValues}/${column.nonEmptyValues} nilai valid 16 digit${column.scientificNotationValues ? ` (${column.scientificNotationValues} notasi ilmiah)` : ''}`
          ).join('; ')
        : 'tidak ada header kolom yang mengandung NIK/KTP/identitas/kependudukan';
      const nikStatus = imported.recordsWithNIK === imported.records.length
        ? `NIK terpetakan: ${imported.recordsWithNIK}/${imported.records.length} responden.`
        : imported.recordsWithNIK > 0
          ? `NIK terpetakan: ${imported.recordsWithNIK}/${imported.records.length}; ${imported.recordsMissingNIK} responden belum memiliki NIK terbaca. Kolom dikenali: ${imported.nikHeadersFound.join(', ') || 'tidak ditemukan'}. Diagnostik kolom: ${diagnosticSummary}.`
          : `NIK belum terpetakan. Kolom dikenali: ${imported.nikHeadersFound.join(', ') || 'tidak ditemukan'}. Diagnostik kolom sumber: ${diagnosticSummary}. Jika nilai memakai notasi ilmiah/terpotong, perbaiki nilai NIK pada spreadsheet menjadi teks 16 digit, lalu sinkronkan kembali.`;
      setStatusMessage({
        type: imported.recordsWithNIK === 0 ? 'error' : 'success',
        text: `Berhasil memuat ${imported.records.length} PPKS dari “${imported.spreadsheetTitle}” → tab “${imported.selectedTab}”. Baris sumber: ${imported.sourceDataRows} (di luar header), baris bernama: ${imported.sourceRowsWithName}, tidak dikenali sebagai nama: ${imported.rowsWithoutRecognizedName}, data contoh disaring: ${imported.sampleRecordsFiltered}. ${nikStatus} Data tersedia di Database PPKS dan From Asesmen Terintegrasi, diurutkan dari timestamp terbaru. Sumber tidak diubah.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanKnownDemoData = async () => {
    setLoading(true);
    setStatusMessage(null);
    const results: string[] = [];
    const errors: string[] = [];
    try {
      if (!(await getAccessToken())) {
        throw new Error('Izin Google API belum tersedia. Pulihkan izin Google terlebih dahulu; pembersihan tidak akan membuka popup login otomatis.');
      }

      try {
        const firestoreDeleted = await removeLegacyDemoPPKSFromFirestore();
        results.push(`Firebase Firestore: ${firestoreDeleted} dokumen PPKS contoh yang dikenali dihapus; data lainnya dipertahankan.`);
      } catch (error: any) {
        errors.push(`Firebase Firestore: ${error?.message || String(error)}`);
      }

      const candidates = [
        sourceSpreadsheetUrl,
        settings.googleSpreadsheetSourceUrl || '',
        settings.googleSpreadsheetUrl || '',
        GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl,
      ].filter(Boolean);
      const uniqueSheets = new Map<string, string>();
      for (const url of candidates) {
        try {
          uniqueSheets.set(extractSpreadsheetId(url), url);
        } catch {
          errors.push('Konfigurasi spreadsheet dilewati karena URL/ID tidak valid.');
        }
      }

      let totalRowsCleared = 0;
      for (const [spreadsheetId, url] of uniqueSheets) {
        try {
          const cleaned = await removeLegacyDemoRowsFromSpreadsheet(url);
          totalRowsCleared += cleaned.rowsCleared;
          results.push(`Google Sheets “${cleaned.spreadsheetTitle}”: ${cleaned.rowsCleared} baris contoh dibersihkan dari ${cleaned.tabsScanned} tab`);
        } catch (error: any) {
          errors.push(`Spreadsheet ${spreadsheetId}: ${error?.message || String(error)}`);
        }
      }

      try {
        const drive = await removeObviousDemoFilesFromDrive(GOOGLE_SIPANDU_RESOURCES.driveFolderId);
        results.push(`Google Drive: ${drive.filesDeleted} file contoh yang dikenali dihapus; ${drive.filesScanned} file diperiksa; pemindaian seluruh Drive ${drive.accountWideScanCompleted ? 'berhasil' : 'tidak lengkap'}.`);
        if (!drive.accountWideScanCompleted) {
          errors.push('Google Drive: pemindaian seluruh Drive tidak berhasil. File contoh di folder SIPANDU tetap telah diperiksa; jalankan pembersihan kembali untuk mencoba cakupan penuh.');
        }
      } catch (error: any) {
        errors.push(`Google Drive: ${error?.message || String(error)}`);
      }

      onLoadPPKSFromCloud([]);
      setSheetRows([]);
      const cleanupKey = 'sipandu_legacy_demo_cleanup_v1:' + [
        ...[...uniqueSheets.keys()].sort(),
        GOOGLE_SIPANDU_RESOURCES.driveFolderId,
      ].join('|');
      if (!errors.length) {
        try { localStorage.setItem(cleanupKey, new Date().toISOString()); } catch { /* optional cache */ }
      }
      setStatusMessage({
        type: errors.length ? 'error' : 'success',
        text: [
          `Pembersihan selesai: ${totalRowsCleared} baris contoh dihapus dari Google Sheets.`,
          ...results,
          ...(errors.length ? [`Gagal pada ${errors.length} target: ${errors.join(' · ')}`] : []),
          'Data responden non-demo dipertahankan. Catatan: API Google Forms tidak menyediakan penghapusan respons individual; tindakan ini membersihkan baris spreadsheet dan file Google Drive contoh, bukan daftar respons di dalam Google Form.',
        ].join(' | '),
      });
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: error?.message || String(error) });
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
    let inserted = 0;
    let updated = 0;
    const failures: string[] = [];
    try {
      const target = spreadsheetIdInput.trim();
      if (!target) {
        throw new Error('Tujuan database Google Sheets belum diatur. Klik “Buat Spreadsheet Baru SIPANDU ODHIV” atau masukkan URL spreadsheet database khusus.');
      }
      const targetId = extractSpreadsheetId(target);
      if (targetId === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId) {
        throw new Error('Demi menjaga respons Google Form tetap utuh, data PPKS tidak boleh diekspor ke spreadsheet respons Form. Buat spreadsheet database SIPANDU terpisah terlebih dahulu.');
      }
      await ensureSIPANDUDatabaseSheet(target);
      for (const record of ppksList) {
        try {
          const result = await upsertPPKSInSpreadsheet(target, record);
          if (result === 'inserted') inserted++;
          else updated++;
        } catch (error: any) {
          failures.push(`${record.id}: ${error?.message || String(error)}`);
          // The same permission/schema error is likely to affect the remaining rows.
          if (failures.length >= 1) break;
        }
      }
      const refreshedRows = await readSpreadsheetData(target, 'SIPANDU!A1:K100');
      setSheetRows(refreshedRows);
      if (failures.length) {
        setStatusMessage({ type: 'error', text: `Ekspor dihentikan saat memproses ${failures[0]}. ${inserted} baris baru ditambahkan, ${updated} record diperbarui; record sisanya belum dicoba. Periksa akses/format database lalu ulangi ekspor.` });
      } else {
        setStatusMessage({ type: 'success', text: `Google Sheets tersinkron: ${inserted} baris baru ditambahkan, ${updated} record diperbarui. Target: tab SIPANDU.` });
      }
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Sinkronisasi Google Sheets gagal: ${error?.message || String(error)}` });
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

  // Firestore Sync All — exceptions are surfaced with the actual permission/network reason.
  const handleSyncFirestore = async () => {
    setLoading(true);
    setStatusMessage(null);
    let count = 0;
    const failures: string[] = [];
    try {
      for (const record of ppksList) {
        try {
          await savePPKSToFirestore(record);
          count++;
        } catch (error: any) {
          failures.push(`${record.id}: ${error?.message || String(error)}`);
        }
      }
      setFirestoreSyncedCount(count);
      if (failures.length) {
        setStatusMessage({ type: 'error', text: `Sinkronisasi Firestore: ${count} berhasil, ${failures.length} gagal. Penyebab pertama: ${failures[0]}` });
      } else {
        setStatusMessage({ type: 'success', text: `${count} berkas berhasil disimpan ke Firebase Firestore.` });
      }
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Sinkronisasi Firestore gagal: ${error?.message || String(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFirestore = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const records = await fetchPPKSFromFirestore();
      onLoadPPKSFromCloud(records);
      setStatusMessage({ type: 'success', text: `Pembacaan Firestore berhasil: ${records.length} record cloud dimuat dan digabungkan dengan data lokal.` });
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Gagal memuat data Firestore: ${error?.message || String(error)}` });
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
                      src={googleUser.photoURL || undefined}
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
                      {googleUser ? (getWorkspaceGoogleEmail(googleUser) || 'Profil Google tidak membagikan alamat email') : 'Hubungkan akun Google untuk sinkronisasi Drive, Sheets, dan Forms.'}
                    </p>
                    <span className="text-[10px] text-sky-300 font-mono">
                      Status Token: {token ? 'Tersedia di sesi ini; validitas diuji saat API dipanggil' : (googleUser ? 'Perlu otorisasi ulang' : 'Belum diotorisasi')}
                    </span>
                  </div>
                </div>

                <div>
                  {(!googleUser || !token) ? (
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
                      <span>{googleUser ? 'Pulihkan Izin Google API' : 'Masuk dengan Google'}</span>
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
                  <span className={"px-2 py-0.5 rounded text-[10px] border " + firestoreBadgeClass}>
                    {firestoreBadgeLabel}
                  </span>
                </div>
                <p className="text-neutral-300 text-[11px]">
                  Uji akses dilakukan terhadap koleksi ppks yang dilindungi Firestore Rules. Penyimpanan lokal browser tidak otomatis berarti data sudah tersimpan di cloud.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunDiagnostics}
                    disabled={loading || diagnosticsRunning}
                    className="px-3.5 py-2 rounded-lg bg-violet-800/80 hover:bg-violet-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${diagnosticsRunning ? 'animate-spin' : ''}`} />
                    <span>{diagnosticsRunning ? 'Memeriksa…' : 'Verifikasi Firestore'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncFirestore}
                    disabled={loading}
                    className="px-3.5 py-2 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Kirim {ppksList.length} PPKS ke Firestore</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadFirestore}
                    disabled={loading}
                    className="px-3.5 py-2 rounded-lg bg-sky-900 hover:bg-sky-800 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Muat dari Firestore</span>
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

              <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/35 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h5 className="text-rose-100 text-xs font-bold">Bersihkan Data Contoh Lama</h5>
                    <p className="text-[10px] text-neutral-300">Menghapus hanya record PPKS contoh yang dikenali di Firestore, baris demo yang jelas dari spreadsheet respons/sumber/database, serta file demo/contoh dari folder Drive SIPANDU. Data responden non-demo dipertahankan.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCleanKnownDemoData}
                    disabled={loading || !token}
                    className="shrink-0 rounded-lg border border-rose-400/40 bg-rose-800/80 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {loading ? 'Membersihkan…' : 'Bersihkan Data Contoh'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-black/50 border border-sky-500/35 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h5 className="text-sky-100 font-bold text-xs">Spreadsheet Sumber PPKS & Asesmen</h5>
                    <p className="text-[10px] text-neutral-300">Pilih spreadsheet asli dari Drive. Data dibaca saja lalu dimasukkan ke daftar PPKS aplikasi; file sumber tidak diubah.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscoverSpreadsheets}
                    disabled={loading || !token}
                    className="shrink-0 px-3 py-2 rounded-lg bg-sky-900 hover:bg-sky-800 text-white font-semibold text-[11px] disabled:opacity-50"
                  >
                    {loading ? 'Mencari…' : 'Cari Spreadsheet Saya'}
                  </button>
                </div>
                <select
                  value={(() => { try { return extractSpreadsheetId(sourceSpreadsheetUrl); } catch { return ''; } })()}
                  onChange={(e) => handleSourceSpreadsheetSelect(e.target.value)}
                  className="w-full p-2.5 rounded bg-black/70 border border-sky-500/30 text-xs text-white"
                  disabled={loading || !token || spreadsheetFiles.length === 0}
                >
                  <option value="">— Pilih spreadsheet hasil pencarian Drive —</option>
                  {spreadsheetFiles.map((file) => (
                    <option key={file.id} value={file.id}>{file.name}</option>
                  ))}
                </select>
                <label className="block text-sky-200 font-semibold text-[11px]">Atau tempel URL Spreadsheet sumber:</label>
                <input
                  type="url"
                  value={sourceSpreadsheetUrl}
                  onChange={(e) => setSourceSpreadsheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full p-2.5 rounded bg-black/70 border border-sky-500/30 text-xs text-white font-mono"
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={sourceSpreadsheetTab}
                    onChange={(e) => setSourceSpreadsheetTab(e.target.value)}
                    placeholder="Nama tab (opsional, otomatis memilih tab respons)"
                    className="w-full sm:flex-1 p-2 rounded bg-black/70 border border-neutral-700 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={handleImportPPKSFromSpreadsheet}
                    disabled={loading || !token}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs disabled:opacity-50"
                  >
                    {loading ? 'Memuat…' : 'Muat Data PPKS + Asesmen'}
                  </button>
                </div>
                <p className="text-[10px] text-neutral-400">
                  Sumber terpilih: {settings.googleSpreadsheetSourceName || 'nama file akan diketahui setelah dibaca'}.
                  {sourceSpreadsheetUrl ? <a href={sourceSpreadsheetUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-sky-300 underline">Buka file</a> : null}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-black/50 border border-emerald-500/30 space-y-3">
                <label className="block text-sky-200 font-semibold text-[11px]">
                  URL Google Spreadsheet tujuan DATABASE SIPANDU (khusus tulis):
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
