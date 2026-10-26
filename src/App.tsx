import React, { useState, useEffect, useRef } from 'react';
import { PPKSRecord, ProfileUser, AppSettings } from './types';
import { initialPPKSList, initialProfileUser, initialAppSettings, isLegacySamplePPKS } from './data/initialData';
import { LoginPage } from './components/LoginPage';
import { Header } from './components/Header';
import { BottomNav, TabKey } from './components/BottomNav';
import { BerandaView } from './components/BerandaView';
import { DatabasePpksView } from './components/DatabasePpksView';
import { AsesmenView } from './components/AsesmenView';
import { FromAsesmenTerintegrasiView } from './components/FromAsesmenTerintegrasiView';
import { DokumenView } from './components/DokumenView';
import { EditProfileModal } from './components/EditProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { NotificationsModal } from './components/NotificationsModal';
import { GoogleWorkspaceModal } from './components/GoogleWorkspaceModal';
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { auth, getAccessToken, savePPKSToFirestore, googleLogout, removeLegacyDemoPPKSFromFirestore, reconcilePPKSFirestoreWithSpreadsheet } from './lib/firebase';
import { ensureSIPANDUDatabaseSheet, extractSpreadsheetId, importPPKSFromSpreadsheet, removeLegacyDemoRowsFromSpreadsheet, removeObviousDemoFilesFromDrive, upsertPPKSInSpreadsheet } from './lib/googleWorkspace';
import { GOOGLE_SIPANDU_RESOURCES } from './lib/googleSIPANDUResources';
import { deduplicatePPKSRecords, EXPECTED_REAL_PPKS_COUNT, parsePPKSTimestamp, samePPKSIdentity, sortPPKSRecordsByName, sortPPKSRecordsByTimestamp } from './lib/ppksData';
import { normalizePPKSPhotoSource } from './lib/photoSources';

function isSixteenDigitNIK(value: string): boolean {
  return /^\d{16}$/.test(String(value || '').replace(/\D/g, ''));
}

function mergePPKSRecords(localRecords: PPKSRecord[], cloudRecords: PPKSRecord[]): PPKSRecord[] {
  const merged = new Map<string, PPKSRecord>();
  // Preserve distinct Google Form submissions even when two rows share a NIK.
  const recordKey = (record: PPKSRecord) => `id:${record.id}`;
  const mergeOne = (previous: PPKSRecord | undefined, next: PPKSRecord): PPKSRecord => {
    if (!previous) return next;
    const nextIntegrated = next.integratedForm
      ? Object.fromEntries(Object.entries(next.integratedForm).filter(([, value]) => value !== '' && value !== undefined))
      : {};
    return {
      ...previous,
      ...next,
      nik: next.nik || previous.nik,
      usia: next.usia || previous.usia,
      alamatLengkap: next.alamatLengkap || previous.alamatLengkap,
      kotaDomisili: next.kotaDomisili || previous.kotaDomisili,
      noHpWa: next.noHpWa || previous.noHpWa,
      jenisBantuan: next.jenisBantuan || previous.jenisBantuan,
      intervensiMental: next.intervensiMental || previous.intervensiMental,
      fotoDiri: normalizePPKSPhotoSource(next.fotoDiri) || normalizePPKSPhotoSource(previous.fotoDiri),
      fotoKtp: normalizePPKSPhotoSource(next.fotoKtp) || normalizePPKSPhotoSource(previous.fotoKtp),
      fotoKk: normalizePPKSPhotoSource(next.fotoKk) || normalizePPKSPhotoSource(previous.fotoKk),
      fotoRumah: normalizePPKSPhotoSource(next.fotoRumah) || normalizePPKSPhotoSource(previous.fotoRumah),
      integratedForm: next.integratedForm
        ? ({ ...(previous.integratedForm || {}), ...nextIntegrated } as NonNullable<PPKSRecord['integratedForm']>)
        : previous.integratedForm,
      officialAssessment: next.officialAssessment
        ? ({ ...(previous.officialAssessment || {}), ...Object.fromEntries(
            Object.entries(next.officialAssessment).filter(([, value]) =>
              Array.isArray(value) ? value.length > 0 : String(value ?? '') !== ''
            )
          ) } as NonNullable<PPKSRecord['officialAssessment']>)
        : previous.officialAssessment,
      statusAsesmen: next.officialAssessment || next.integratedForm
        ? 'Terintegrasi'
        : (previous.statusAsesmen || next.statusAsesmen),
    };
  };

  for (const record of localRecords) {
    if (!record || isLegacySamplePPKS(record)) continue;
    merged.set(recordKey(record), record);
  }
  const normalizePersonText = (value: string | undefined) =>
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizePhone = (value: string | undefined) => String(value || '').replace(/\D/g, '');

  for (const record of cloudRecords) {
    if (!record || isLegacySamplePPKS(record)) continue;
    const key = recordKey(record);
    let existingKey = key;
    let existing = merged.get(key);

    // NIK may become recognizable after a mapper fix. Match the older cached
    // version by the same respondent name plus timestamp or phone, then replace
    // it with the corrected key instead of showing the respondent twice.
    if (!existing) {
      const name = normalizePersonText(record.namaLengkap);
      const phone = normalizePhone(record.noHpWa);
      const timestamp = String(record.timestamp || '').trim();
      const candidateMatches = [...merged.entries()].filter(([, candidate]) =>
        !!name && normalizePersonText(candidate.namaLengkap) === name
      );
      // Strong matching first: identical timestamp or phone confirms the same row.
      const timestampEpoch = parsePPKSTimestamp(timestamp);
      const strongMatch = candidateMatches.find(([, candidate]) => {
        const candidateEpoch = parsePPKSTimestamp(candidate.timestamp);
        // A timestamp proves it is the same source row. Phone alone is not
        // enough because one respondent may submit more than once.
        return timestampEpoch !== null && candidateEpoch !== null && timestampEpoch === candidateEpoch;
      }) || (
        // For legacy cache rows with no timestamps, phone is only a fallback
        // when there is exactly one candidate and neither record has a time.
        timestampEpoch === null && candidateMatches.length === 1 &&
        parsePPKSTimestamp(candidateMatches[0][1].timestamp) === null &&
        !!phone && normalizePhone(candidateMatches[0][1].noHpWa) === phone
          ? candidateMatches[0]
          : undefined
      );
      if (strongMatch) {
        [existingKey, existing] = strongMatch;
      } else {
        // If a corrected importer now recovers NIK, update exactly one stale
        // same-name cache row that has no NIK. Never merge a duplicate-name
        // person where more than one eligible cached record exists.
        const nextNik = String(record.nik || '').replace(/\D/g, '');
        const staleCandidates = candidateMatches.filter(([, candidate]) => {
          const candidateNik = String(candidate.nik || '').replace(/\D/g, '');
          return !candidateNik && isSixteenDigitNIK(nextNik);
        });
        if (isSixteenDigitNIK(nextNik) && staleCandidates.length === 1) {
          [existingKey, existing] = staleCandidates[0];
        }
      }
    }

    const combined = mergeOne(existing, record);
    if (existingKey !== key) merged.delete(existingKey);
    merged.set(key, combined);
  }
  return sortPPKSRecordsByTimestamp(deduplicatePPKSRecords(Array.from(merged.values())));
}

function reconcileSpreadsheetPPKSRecords(localRecords: PPKSRecord[], sourceRecords: PPKSRecord[]): PPKSRecord[] {
  // The selected spreadsheet is the master roster. Reuse local/cloud details only
  // for people still present in that source; do not keep obsolete cache-only rows.
  const uniqueSource = deduplicatePPKSRecords(sourceRecords);
  const merged = mergePPKSRecords(localRecords, uniqueSource);
  const sourceMatched = merged.filter((record) =>
    uniqueSource.some((sourceRecord) => samePPKSIdentity(record, sourceRecord))
  );
  return sortPPKSRecordsByName(deduplicatePPKSRecords(sourceMatched));
}

function normalizeAppSettings(value: unknown): AppSettings {
  const saved = value && typeof value === 'object' ? value as Partial<AppSettings> : {};
  let databaseUrl = saved.googleSpreadsheetUrl?.trim() || '';
  if (databaseUrl.includes('1yA8KemensosODHIVSumut2026_LiveSync')) databaseUrl = '';
  if (databaseUrl) {
    try {
      if (extractSpreadsheetId(databaseUrl) === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId) databaseUrl = '';
    } catch {
      databaseUrl = '';
    }
  }

  let sourceUrl = saved.googleSpreadsheetSourceUrl?.trim() || '';
  // Older builds silently defaulted to the Forms response spreadsheet. Clear that
  // value if it was written by the old automatic default rather than user selection.
  const wasAutoDefaultSource = saved.googleSpreadsheetSourceName === 'Sumber Respons Google Form SIPANDU';
  if (sourceUrl.includes('1yA8KemensosODHIVSumut2026_LiveSync') || wasAutoDefaultSource) sourceUrl = '';
  if (sourceUrl) {
    try {
      extractSpreadsheetId(sourceUrl);
    } catch {
      sourceUrl = '';
    }
  }

  const sourceName = wasAutoDefaultSource ? '' : (saved.googleSpreadsheetSourceName || '');

  return {
    ...initialAppSettings,
    ...saved,
    googleSpreadsheetUrl: databaseUrl,
    googleSpreadsheetSourceUrl: sourceUrl,
    googleSpreadsheetSourceName: sourceName,
    googleSpreadsheetSourceTab: saved.googleSpreadsheetSourceTab || '',
  };
}

export default function App() {
  // Firebase Authentication is the source of truth; URL/localStorage flags cannot bypass login.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthReady(false);
      setAuthError('');
      if (!user) {
        setIsAuthenticated(false);
        setCurrentUserName('');
        setCurrentUserRole('');
        setAuthReady(true);
        return;
      }
      try {
        const token = await getIdTokenResult(user, true);
        const role = token.claims.role;
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
          setIsAuthenticated(false);
          setCurrentUserRole('');
          setAuthError('Akun berhasil dikenali, tetapi peran resmi belum ditetapkan. Hubungi administrator SIPANDU.');
          await signOut(auth);
        } else {
          setIsAuthenticated(true);
          setCurrentUserRole(role);
          setCurrentUserName(user.displayName || user.email || '');
        }
      } catch (error) {
        console.error('Gagal memverifikasi peran SIPANDU:', error);
        setIsAuthenticated(false);
        setCurrentUserRole('');
        setAuthError('Sesi tidak dapat diverifikasi. Silakan masuk kembali atau hubungi administrator.');
        await signOut(auth);
      } finally {
        setAuthReady(true);
      }
    });
    return unsubscribe;
  }, []);

  // App Navigation tab
  const [activeTab, setActiveTab] = useState<TabKey>('beranda');

  // Master Data in state (with localStorage caching)
  const [ppksList, setPpksList] = useState<PPKSRecord[]>(() => {
    const cached = localStorage.getItem('sipandu_ppks');
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          // Remove the exact legacy demo IDs and persist the clean cache.
          const clean = deduplicatePPKSRecords((parsed as PPKSRecord[]).filter(
            (record) => record && !isLegacySamplePPKS(record)
          ));
          if (clean.length !== parsed.length) localStorage.setItem('sipandu_ppks', JSON.stringify(clean));
          return sortPPKSRecordsByTimestamp(clean);
        }
        console.warn('Cached PPKS data is not an array; starting with an empty list.');
      } catch (e) {
        console.error('Failed to parse cached PPKS list', e);
      }
    }
    return initialPPKSList;
  });

  const [profile, setProfile] = useState<ProfileUser>(() => {
    const cached = localStorage.getItem('sipandu_profile');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.nama === 'Deny Arifin Martyon S.' && parsed?.nip === '19920315 202012 1 002') {
          localStorage.removeItem('sipandu_profile');
          return initialProfileUser;
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse cached profile', e);
      }
    }
    return initialProfileUser;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const cached = localStorage.getItem('sipandu_settings');
    if (cached) {
      try {
        return normalizeAppSettings(JSON.parse(cached));
      } catch (e) {
        console.error('Failed to parse cached settings', e);
      }
    }
    return initialAppSettings;
  });

  const demoCleanupAttemptedRef = useRef('');
  const demoCleanupRunningRef = useRef(false);
  const firestoreRosterReconciliationAttemptedRef = useRef(false);
  const firestoreRosterReconciliationInFlightRef = useRef<Promise<number> | null>(null);
  const [cloudSyncNotice, setCloudSyncNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveSyncState, setLiveSyncState] = useState<{
    type: 'idle' | 'success' | 'paused' | 'error';
    message: string;
    lastUpdatedAt?: string;
  }>({ type: 'idle', message: 'Sinkronisasi otomatis belum dimulai.' });

  // Modals state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isGoogleWorkspaceOpen, setIsGoogleWorkspaceOpen] = useState<boolean>(false);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem('sipandu_ppks', JSON.stringify(ppksList));
    } catch (error) {
      console.error('SIPANDU PPKS cache could not be persisted in browser storage:', error);
      setCloudSyncNotice({
        type: 'error',
        text: 'Browser kehabisan ruang penyimpanan untuk cache lokal. Foto yang diunggah sudah dikompres, tetapi data baru mungkin belum tersimpan di perangkat; pastikan sinkronisasi Firebase berhasil sebelum menutup atau memuat ulang aplikasi.',
      });
    }
  }, [ppksList]);

  useEffect(() => {
    try {
      localStorage.setItem('sipandu_profile', JSON.stringify(profile));
    } catch (error) {
      console.error('SIPANDU profile could not be persisted in browser storage:', error);
      setCloudSyncNotice({
        type: 'error',
        text: 'Foto/profil berubah pada sesi ini, tetapi browser menolak penyimpanan lokal. Foto profil dioptimalkan; jika pesan ini tetap muncul, tutup tab lama SIPANDU dan muat ulang agar ruang penyimpanan tersedia.',
      });
    }
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('sipandu_settings', JSON.stringify(settings));
  }, [settings]);

  // Auth Handlers
  const handleLogin = (user: string) => {
    // Firebase's auth-state observer updates the authenticated UI after sign-in.
    setCurrentUserName(user);
  };

  const handleLogout = async () => {
    if (window.confirm('Apakah Anda yakin ingin keluar dari aplikasi SIPANDU ODHIV?')) {
      await signOut(auth);
      await googleLogout();
      setIsAuthenticated(false);
      setCurrentUserName('');
    }
  };

  // A record edit/add is persisted locally first, then pushed to each configured cloud target.
  // Each service reports independently so partial sync can never be shown as full success.
  const persistRecordToCloud = async (record: PPKSRecord) => {
    const completed: string[] = [];
    const failed: string[] = [];

    try {
      await savePPKSToFirestore(record);
      completed.push('Firebase Firestore berhasil');
    } catch (error: any) {
      failed.push(`Firebase: ${error?.message || String(error)}`);
    }

    const sheetUrl = settings.googleSpreadsheetUrl?.trim() || '';
    if (!sheetUrl || sheetUrl.includes('1yA8KemensosODHIVSumut2026_LiveSync')) {
      failed.push('Google Sheets belum dikonfigurasi. Buat spreadsheet database terpisah di Google Workspace & Cloud Hub.');
    } else {
      try {
        const targetId = extractSpreadsheetId(sheetUrl);
        if (targetId === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId) {
          throw new Error('Spreadsheet respons Google Form tidak boleh menjadi tujuan database PPKS.');
        }
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Token Google tidak tersedia pada sesi ini. Buka Google Workspace & Cloud Hub → Koneksi Akun → Pulihkan Izin Google API.');
        }
        await ensureSIPANDUDatabaseSheet(sheetUrl);
        const syncResult = await upsertPPKSInSpreadsheet(sheetUrl, record);
        completed.push(syncResult === 'inserted' ? 'Google Sheets: baris baru ditambahkan' : 'Google Sheets: baris diperbarui');
      } catch (error: any) {
        failed.push(`Google Sheets: ${error?.message || String(error)}`);
      }
    }

    const summary = [`Record ${record.id}`, ...completed, ...failed].join(' · ');
    setCloudSyncNotice({ type: failed.length ? 'error' : 'success', text: summary });
    if (failed.length) console.error('SIPANDU cloud sync incomplete:', { recordId: record.id, failures: failed });
  };

  // Data update handlers
  const handleUpdatePPKS = (updated: PPKSRecord) => {
    setPpksList((prev) =>
      sortPPKSRecordsByTimestamp(deduplicatePPKSRecords(prev.map((item) => (item.id === updated.id ? updated : item))))
    );
    void persistRecordToCloud(updated);
  };

  const handleAddNewPPKS = (newPPKS: PPKSRecord) => {
    setPpksList((prev) => sortPPKSRecordsByTimestamp(deduplicatePPKSRecords([newPPKS, ...prev])));
    void persistRecordToCloud(newPPKS);
  };

  const handleLoadPPKSFromCloud = (cloudRecords: PPKSRecord[]) => {
    setPpksList((localRecords) => mergePPKSRecords(localRecords, cloudRecords));
  };

  // Reconcile Firestore only after a successful import from the selected source.
  // The 44-record guard prevents a wrong tab/partial read from deleting valid data.
  const runFirestoreRosterReconciliation = async (
    sourceRecords: PPKSRecord[],
    force = false
  ): Promise<number | null> => {
    if (currentUserRole !== 'owner' && currentUserRole !== 'supervisor') return null;
    if (sourceRecords.length !== EXPECTED_REAL_PPKS_COUNT) return null;
    if (firestoreRosterReconciliationInFlightRef.current) {
      return firestoreRosterReconciliationInFlightRef.current;
    }
    if (!force && firestoreRosterReconciliationAttemptedRef.current) return 0;

    const operation = reconcilePPKSFirestoreWithSpreadsheet(sourceRecords);
    firestoreRosterReconciliationInFlightRef.current = operation;
    try {
      const removed = await operation;
      firestoreRosterReconciliationAttemptedRef.current = true;
      return removed;
    } catch (error) {
      firestoreRosterReconciliationAttemptedRef.current = false;
      console.warn('SIPANDU Firestore roster reconciliation skipped:', error);
      return null;
    } finally {
      firestoreRosterReconciliationInFlightRef.current = null;
    }
  };

  const handleSyncGoogleSpreadsheet = async (): Promise<{ records: number; sourceDataRows: number; sourceRowsWithName: number; sampleRecordsFiltered: number; duplicateRowsCollapsed: number; photosRecoveredFromForm: number; photoRecoveryStatus: string; photoCounts: { diri: number; ktp: number; kk: number; rumah: number } }> => {
    const sourceUrl = settings.googleSpreadsheetSourceUrl?.trim() || '';
    if (!sourceUrl) throw new Error('Spreadsheet sumber belum dipilih. Buka Google Workspace & Cloud Hub → Google Sheets → Cari Spreadsheet Saya, lalu pilih file Anda.');
    const imported = await importPPKSFromSpreadsheet(
      sourceUrl,
      settings.googleSpreadsheetSourceTab?.trim() || undefined
    );
    if (!imported.records.length) {
      const headers = (imported.previewRows[0] || []).slice(0, 12).join(' | ');
      throw new Error(
        `Spreadsheet “${imported.spreadsheetTitle}”, tab “${imported.selectedTab}” berhasil dibaca (${imported.rowsRead} baris), tetapi tidak ditemukan baris responden yang memiliki kolom nama dikenali. Periksa judul kolom. Header: ${headers || '(kosong)'}`
      );
    }
    const firestoreDocumentsRemoved = await runFirestoreRosterReconciliation(imported.records, true);
    setPpksList((localRecords) => reconcileSpreadsheetPPKSRecords(localRecords, imported.records));
    setSettings((current) => ({
      ...current,
      googleSpreadsheetSourceUrl: sourceUrl,
      googleSpreadsheetSourceName: imported.spreadsheetTitle,
      googleSpreadsheetSourceTab: imported.selectedTab,
    }));
    const updatedAt = new Date().toLocaleString('id-ID');
    const hasExpectedRoster = imported.records.length === EXPECTED_REAL_PPKS_COUNT;
    const firestoreMessage = !hasExpectedRoster
      ? `Firestore TIDAK diubah: spreadsheet memuat ${imported.records.length} PPKS unik, sedangkan roster terverifikasi harus ${EXPECTED_REAL_PPKS_COUNT}. Periksa tab/hasil impor; tidak ada dokumen yang dihapus.`
      : firestoreDocumentsRemoved === null
        ? 'Firestore belum diselaraskan; periksa izin akun owner/supervisor atau koneksi Firebase. Data Firestore tidak dihapus oleh proses yang gagal.'
        : `Firestore diselaraskan ke ${EXPECTED_REAL_PPKS_COUNT} PPKS; ${firestoreDocumentsRemoved} dokumen lama/duplikat di luar roster dibersihkan.`;
    setLiveSyncState({
      type: hasExpectedRoster && firestoreDocumentsRemoved !== null ? 'success' : 'error',
      message: `Sumber “${imported.spreadsheetTitle}” → “${imported.selectedTab}”: ${imported.sourceDataRows} baris data, ${imported.records.length} PPKS unik dimuat, ${imported.duplicateRowsCollapsed} duplikat spreadsheet digabung, ${imported.sampleRecordsFiltered} contoh disaring. Foto sumber: diri ${imported.photoCounts.diri}/${imported.records.length}, KTP ${imported.photoCounts.ktp}/${imported.records.length}, KK ${imported.photoCounts.kk}/${imported.records.length}, rumah ${imported.photoCounts.rumah}/${imported.records.length}; tautan dipulihkan dari Forms: ${imported.photosRecoveredFromForm}; status pemulihan: ${imported.photoRecoveryStatus}. ${firestoreMessage} NIK terpetakan ${imported.recordsWithNIK}/${imported.records.length}. Sinkronisasi otomatis setiap 2 menit selama izin Google masih berlaku.`,
      lastUpdatedAt: updatedAt,
    });
    return {
      records: imported.records.length,
      sourceDataRows: imported.sourceDataRows,
      sourceRowsWithName: imported.sourceRowsWithName,
      sampleRecordsFiltered: imported.sampleRecordsFiltered,
      duplicateRowsCollapsed: imported.duplicateRowsCollapsed,
      photosRecoveredFromForm: imported.photosRecoveredFromForm,
      photoRecoveryStatus: imported.photoRecoveryStatus,
      photoCounts: imported.photoCounts,
    };
  };

  // Poll the selected read-only Google Sheet while the dashboard is open.
  // Polling is paused rather than prompting repeatedly when the OAuth token expires.
  useEffect(() => {
    const sourceUrl = settings.googleSpreadsheetSourceUrl?.trim() || '';
    const sourceTab = settings.googleSpreadsheetSourceTab?.trim() || undefined;
    if (!isAuthenticated || !sourceUrl) {
      setLiveSyncState({
        type: 'idle',
        message: isAuthenticated
          ? 'Pilih spreadsheet sumber di Google Workspace & Cloud Hub untuk mengaktifkan live sync.'
          : 'Live sync aktif setelah akun SIPANDU masuk.',
      });
      return;
    }

    let active = true;
    let running = false;
    const syncOnce = async () => {
      if (!active || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const token = await getAccessToken();
        if (!token) {
          if (active) setLiveSyncState({
            type: 'paused',
            message: 'Live sync dijeda karena izin Google API perlu dipulihkan. Sesi SIPANDU tetap aktif; buka Koneksi Akun lalu tekan Pulihkan Izin Google API.',
          });
          return;
        }
        const imported = await importPPKSFromSpreadsheet(sourceUrl, sourceTab);
        if (!active) return;
        if (!imported.records.length) {
          setLiveSyncState({
            type: 'error',
            message: `Spreadsheet “${imported.spreadsheetTitle}” terbaca (${imported.rowsRead} baris), tetapi tidak ditemukan baris dengan kolom nama responden yang dikenali. Periksa tab dan judul kolom.`,
          });
          return;
        }
        let firestoreDocumentsRemoved: number | null = null;
        if (!firestoreRosterReconciliationAttemptedRef.current && imported.records.length === EXPECTED_REAL_PPKS_COUNT) {
          firestoreDocumentsRemoved = await runFirestoreRosterReconciliation(imported.records, false);
          if (!active) return;
        }
        setPpksList((current) => reconcileSpreadsheetPPKSRecords(current, imported.records));
        setSettings((current) => {
          if (
            current.googleSpreadsheetSourceName === imported.spreadsheetTitle &&
            current.googleSpreadsheetSourceTab === imported.selectedTab
          ) return current;
          return {
            ...current,
            googleSpreadsheetSourceUrl: sourceUrl,
            googleSpreadsheetSourceName: imported.spreadsheetTitle,
            googleSpreadsheetSourceTab: imported.selectedTab,
          };
        });
        const hasExpectedRoster = imported.records.length === EXPECTED_REAL_PPKS_COUNT;
        const firestoreMessage = !hasExpectedRoster
          ? `Firestore tidak diubah: ${imported.records.length} PPKS unik terbaca, seharusnya ${EXPECTED_REAL_PPKS_COUNT}. Periksa tab spreadsheet; tidak ada dokumen yang dihapus.`
          : firestoreDocumentsRemoved === null && !firestoreRosterReconciliationAttemptedRef.current
            ? 'Firestore belum berhasil diselaraskan; pastikan akun owner/supervisor aktif dan Firebase dapat diakses.'
            : firestoreRosterReconciliationAttemptedRef.current
              ? 'Roster Firestore telah diselaraskan pada sesi ini.'
              : 'Penyelarasan Firestore belum dijalankan pada sesi ini.';
        setLiveSyncState({
          type: hasExpectedRoster && (firestoreRosterReconciliationAttemptedRef.current || firestoreDocumentsRemoved !== null) ? 'success' : 'error',
          message: `LIVE SYNC — “${imported.spreadsheetTitle}” → “${imported.selectedTab}”: ${imported.records.length} PPKS unik dimuat dari ${imported.sourceDataRows} baris; ${imported.duplicateRowsCollapsed} duplikat digabung; ${imported.sampleRecordsFiltered} contoh disaring; foto diri ${imported.photoCounts.diri}/${imported.records.length}, KTP ${imported.photoCounts.ktp}/${imported.records.length}, KK ${imported.photoCounts.kk}/${imported.records.length}, rumah ${imported.photoCounts.rumah}/${imported.records.length}; tautan Forms dipulihkan: ${imported.photosRecoveredFromForm} (${imported.photoRecoveryStatus}); ${firestoreMessage} NIK ${imported.recordsWithNIK}/${imported.records.length}.`,
          lastUpdatedAt: new Date().toLocaleString('id-ID'),
        });
      } catch (error) {
        if (!active) return;
        setLiveSyncState({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        running = false;
      }
    };

    void syncOnce();
    const timer = window.setInterval(() => { void syncOnce(); }, 2 * 60 * 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncOnce();
    };
    const onWorkspaceTokenUpdated = () => { void syncOnce(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('sipandu-workspace-token-updated', onWorkspaceTokenUpdated);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('sipandu-workspace-token-updated', onWorkspaceTokenUpdated);
    };
  }, [isAuthenticated, settings.googleSpreadsheetSourceUrl, settings.googleSpreadsheetSourceTab, currentUserRole]);

  // Automatically remove clearly marked legacy demo rows/files after a Google API
  // token is already available. This never opens an OAuth popup by itself.
  useEffect(() => {
    let active = true;
    const runCleanup = async () => {
      if (!active || !isAuthenticated || demoCleanupRunningRef.current) return;
      const candidates = [
        GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl,
        settings.googleSpreadsheetSourceUrl || '',
        settings.googleSpreadsheetUrl || '',
      ].filter(Boolean);
      const uniqueSheets = new Map<string, string>();
      const failures: string[] = [];
      for (const url of candidates) {
        try {
          uniqueSheets.set(extractSpreadsheetId(url), url);
        } catch {
          failures.push('Konfigurasi spreadsheet dilewati karena URL/ID tidak valid.');
        }
      }

      const cleanupKey = 'sipandu_legacy_demo_cleanup_v3:' + [
        ...[...uniqueSheets.keys()].sort(),
        GOOGLE_SIPANDU_RESOURCES.driveFolderId,
      ].join('|');
      // Keep this guard only in memory for the current page session. Do not
      // trust a permanent localStorage flag: demo rows/files may be reintroduced
      // or a previous run may have been unable to scan every cloud target.
      if (demoCleanupAttemptedRef.current === cleanupKey) return;

      const token = await getAccessToken();

      demoCleanupRunningRef.current = true;
      const messages: string[] = [];
      let firestoreDeleted = 0;
      let rowsCleared = 0;
      let filesDeleted = 0;
      try {
        // Firestore cleanup uses the already-authenticated SIPANDU staff account,
        // so it must not be blocked by the separate Google Workspace API token.
        if (active) {
          if (currentUserRole === 'owner' || currentUserRole === 'supervisor') {
            try {
              firestoreDeleted = await removeLegacyDemoPPKSFromFirestore();
              messages.push(`Firestore: ${firestoreDeleted} dokumen PPKS contoh dihapus`);
            } catch (error) {
              failures.push(`Firestore: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            failures.push('Firestore: pembersihan otomatis memerlukan peran owner/supervisor; data lainnya tidak diubah.');
          }
        }

        if (!token) {
          failures.push('Google Sheets/Drive: pembersihan menunggu izin Google API. Setelah izin dipulihkan, pembersihan akan berjalan otomatis tanpa meminta login lagi dari proses ini.');
        } else {
          for (const [spreadsheetId, url] of uniqueSheets) {
            if (!active) return;
            try {
              const cleaned = await removeLegacyDemoRowsFromSpreadsheet(url);
              rowsCleared += cleaned.rowsCleared;
              messages.push(`Sheets “${cleaned.spreadsheetTitle}”: ${cleaned.rowsCleared} baris contoh dibersihkan dari ${cleaned.tabsScanned} tab`);
            } catch (error) {
              failures.push(`Spreadsheet ${spreadsheetId}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }

          if (active) {
            try {
              const drive = await removeObviousDemoFilesFromDrive(GOOGLE_SIPANDU_RESOURCES.driveFolderId);
              filesDeleted = drive.filesDeleted;
              messages.push(`Drive: ${drive.filesDeleted} file contoh dihapus; ${drive.filesScanned} file diperiksa; pemindaian seluruh Drive ${drive.accountWideScanCompleted ? 'berhasil' : 'tidak lengkap'}`);
              if (!drive.accountWideScanCompleted) {
                failures.push('Google Drive: pemindaian seluruh akun tidak berhasil. File contoh pada folder SIPANDU sudah diperiksa; pemindaian akan diulangi pada sesi berikutnya.');
              }
            } catch (error) {
              failures.push(`Google Drive: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      } finally {
        demoCleanupRunningRef.current = false;
      }

      if (!active) return;
      setPpksList((current) => mergePPKSRecords(current, []));
      if (failures.length === 0) {
        demoCleanupAttemptedRef.current = cleanupKey;
        try { localStorage.setItem(cleanupKey, new Date().toISOString()); } catch { /* optional cache */ }
      }
      setCloudSyncNotice({
        type: failures.length ? 'error' : 'success',
        text: [
          `Pembersihan data contoh ${failures.length ? 'sebagian selesai' : 'selesai'}: Firestore ${firestoreDeleted} dokumen, Google Sheets ${rowsCleared} baris, Google Drive ${filesDeleted} file contoh.`,
          ...messages,
          ...(failures.length ? [`Target yang belum selesai: ${failures.join(' · ')}`] : []),
          'Data non-demo dipertahankan. Respons di dalam Google Form asli tidak dihapus karena Google Forms API tidak menyediakan operasi hapus respons individual; baris contoh pada spreadsheet respons tertaut dibersihkan secara terpisah.',
        ].join(' | '),
      });
    };

    const onTokenUpdated = () => { void runCleanup(); };
    void runCleanup();
    window.addEventListener('sipandu-workspace-token-updated', onTokenUpdated);
    return () => {
      active = false;
      window.removeEventListener('sipandu-workspace-token-updated', onTokenUpdated);
    };
  }, [isAuthenticated, currentUserRole, settings.googleSpreadsheetSourceUrl, settings.googleSpreadsheetUrl]);

  // Avoid showing protected UI until Firebase has resolved the current session.
  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a140b] text-emerald-200">Memeriksa sesi SIPANDU…</div>;
  }

  // If not logged in, render Part 1: Landing Page / Login
  if (!isAuthenticated) {
    return (
      <>
        {authError && <div role="alert" className="fixed top-3 left-3 right-3 z-50 mx-auto max-w-lg rounded-lg border border-amber-500/50 bg-amber-950/95 p-3 text-sm text-amber-100">{authError}</div>}
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  // Part 2: DASHBOARD
  return (
    <div className="min-h-screen w-full bg-[#0a140b] text-white flex flex-col justify-between selection:bg-emerald-600 selection:text-white overflow-x-hidden relative">
      {/* Background ambient lighting: deep moss green with subtle black vignetting and crimson outline aura */}
      <div className="fixed inset-0 bg-radial-[at_top_right] from-[#17301b]/80 via-[#0a140b] to-[#040905] pointer-events-none" />
      <div className="fixed -top-40 -left-40 w-96 h-96 rounded-full bg-rose-600/10 blur-3xl pointer-events-none" />
      <div className="fixed top-1/2 -right-40 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

      {/* Top Header: Selamat (waktu live), Profil Owner di pojok kiri atas, 3 Icon di pojok kanan atas */}
      <div className="relative z-20 app-header">
        <Header
          currentUser={currentUserName}
          profile={profile}
          unreadNotificationsCount={0}
          onOpenEditProfile={() => setIsEditProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenGoogleWorkspace={() => setIsGoogleWorkspaceOpen(true)}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Dashboard Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pb-28">
        {cloudSyncNotice && (
          <div role="status" aria-live="polite" className={`mb-4 rounded-xl border p-3 text-xs break-words ${cloudSyncNotice.type === 'success' ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-100' : 'border-amber-500/50 bg-amber-950/80 text-amber-100'}`}>
            <div className="flex items-start justify-between gap-3">
              <span>{cloudSyncNotice.text}</span>
              <button type="button" className="shrink-0 underline" onClick={() => setCloudSyncNotice(null)}>Tutup</button>
            </div>
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          className={`mb-4 rounded-xl border p-3 text-xs break-words ${
            liveSyncState.type === 'success' ? 'border-emerald-500/35 bg-emerald-950/40 text-emerald-100' :
            liveSyncState.type === 'paused' || liveSyncState.type === 'error' ? 'border-amber-500/40 bg-amber-950/40 text-amber-100' :
            'border-white/10 bg-black/20 text-neutral-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>
              <strong>{liveSyncState.type === 'success' ? 'LIVE SYNC' : liveSyncState.type === 'paused' ? 'SYNC DIJEDA' : liveSyncState.type === 'error' ? 'SYNC PERLU DIPERIKSA' : 'LIVE SYNC'}</strong>
              <span className="ml-2">{liveSyncState.message}</span>
              {liveSyncState.lastUpdatedAt && <span className="ml-2 text-[10px] opacity-80">Pembaruan terakhir: {liveSyncState.lastUpdatedAt}</span>}
            </span>
          </div>
        </div>
        {activeTab === 'beranda' && (
          <BerandaView
            ppksList={ppksList}
            googleSpreadsheetUrl={settings.googleSpreadsheetSourceUrl || ''}
            googleSpreadsheetName={settings.googleSpreadsheetSourceName || ''}
            onSyncGoogleSpreadsheet={handleSyncGoogleSpreadsheet}
          />
        )}

        {activeTab === 'database-ppks' && (
          <DatabasePpksView
            ppksList={ppksList}
            onUpdatePPKS={handleUpdatePPKS}
            settings={settings}
          />
        )}

        {activeTab === 'asesmen' && (
          <AsesmenView
            ppksList={ppksList}
            onAddNewPPKS={handleAddNewPPKS}
            settings={settings}
          />
        )}

        {activeTab === 'from-asesmen-terintegrasi' && (
          <FromAsesmenTerintegrasiView
            ppksList={ppksList}
            onUpdatePPKS={handleUpdatePPKS}
          />
        )}

        {activeTab === 'dokumen' && <DokumenView profile={profile} />}
      </main>

      {/* Bottom Navigation Bar: BERANDA - DATABASE PPKS - ASESMEN - FROM ASESMEN TERINTEGRASI - DOKUMEN */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Modals */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        profile={profile}
        onSave={(updated) => setProfile(updated)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(updated) => setSettings(updated)}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      <GoogleWorkspaceModal
        isOpen={isGoogleWorkspaceOpen}
        onClose={() => setIsGoogleWorkspaceOpen(false)}
        ppksList={ppksList}
        settings={settings}
        onUpdateSettings={(updated) => setSettings(updated)}
        onLoadPPKSFromCloud={handleLoadPPKSFromCloud}
      />
    </div>
  );
}
