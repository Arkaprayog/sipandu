import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { PPKSRecord, ProfileUser, AppSettings } from './types';
import { importLazyModuleWithRecovery } from './lib/lazyImportRecovery';
import { initialPPKSList, initialProfileUser, initialAppSettings, isLegacySamplePPKS } from './data/initialData';
import { LoginPage } from './components/LoginPage';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import type { TabKey } from './components/BottomNav';

function lazyWithRecovery<T extends React.ComponentType<any>>(
  moduleKey: string,
  importer: () => Promise<{ default: T }>,
) {
  return lazy(() => importLazyModuleWithRecovery(moduleKey, importer));
}
const BerandaView = lazyWithRecovery('BerandaView', () => import('./components/BerandaView').then((module) => ({ default: module.BerandaView })));
const DatabasePpksView = lazyWithRecovery('DatabasePpksView', () => import('./components/DatabasePpksView').then((module) => ({ default: module.DatabasePpksView })));
const AsesmenView = lazyWithRecovery('AsesmenView', () => import('./components/AsesmenView').then((module) => ({ default: module.AsesmenView })));
const FromAsesmenTerintegrasiView = lazyWithRecovery('FromAsesmenTerintegrasiView', () => import('./components/FromAsesmenTerintegrasiView').then((module) => ({ default: module.FromAsesmenTerintegrasiView })));
const DokumenView = lazyWithRecovery('DokumenView', () => import('./components/DokumenView').then((module) => ({ default: module.DokumenView })));
const EditProfileModal = lazyWithRecovery('EditProfileModal', () => import('./components/EditProfileModal').then((module) => ({ default: module.EditProfileModal })));
const SettingsModal = lazyWithRecovery('SettingsModal', () => import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal })));
const NotificationsModal = lazyWithRecovery('NotificationsModal', () => import('./components/NotificationsModal').then((module) => ({ default: module.NotificationsModal })));
const GoogleWorkspaceModal = lazyWithRecovery('GoogleWorkspaceModal', () => import('./components/GoogleWorkspaceModal').then((module) => ({ default: module.GoogleWorkspaceModal })));
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { auth, getAccessToken, savePPKSToFirestore, googleLogout, subscribeToPPKSChanges } from './lib/firebase';
import { ensureSIPANDUDatabaseSheet, extractSpreadsheetId, getLinkedSpreadsheetUrlForForm, importPPKSFromSpreadsheet, upsertPPKSInSpreadsheet } from './lib/googleWorkspace';
import { GOOGLE_SIPANDU_RESOURCES } from './lib/googleSIPANDUResources';
import { getLiveSyncRetryDelay, LIVE_SYNC_INTERVAL_MS } from './lib/liveSyncPolicy';
import { filterStageOneLinkResponses } from './lib/stageOneRespondents';
import { preservePPKSRecordOrder } from './lib/ppksRecordState';
import { deduplicatePPKSRecords, parsePPKSTimestamp, samePPKSIdentity, sortPPKSRecordsByName, sortPPKSRecordsByTimestamp } from './lib/ppksData';
import { normalizePPKSPhotoSource } from './lib/photoSources';
import { buildGoogleFormsPrefilledUrl, buildWhatsAppMessage, createWhatsAppLink } from './utils/helpers';
import {
  enableRespondentNotifications,
  getRespondentNotificationPermission,
  loadRespondentNotifications,
  markRespondentNotificationsRead,
  processRespondentSubmissionEvents,
  type RespondentNotification,
} from './lib/respondentNotifications';

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
      // A continuation Form may ask only for the PPKS ID and assessment answers.
      // Blank identity fields from that sheet must not erase the stage-one profile.
      namaLengkap: next.namaLengkap || previous.namaLengkap,
      jenisKelamin: next.namaLengkap ? next.jenisKelamin : previous.jenisKelamin,
      nik: next.nik || previous.nik,
      usia: next.usia || previous.usia,
      desil: next.desil || previous.desil,
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
      // Google Forms roster/continuation sync must not overwrite the independent
      // assessment form's answers.
      formAsesmenTerintegrasi: next.formAsesmenTerintegrasi
        ? ({ ...(previous.formAsesmenTerintegrasi || {}), ...next.formAsesmenTerintegrasi } as NonNullable<PPKSRecord['formAsesmenTerintegrasi']>)
        : previous.formAsesmenTerintegrasi,
      officialAssessment: next.officialAssessment
        ? ({ ...(previous.officialAssessment || {}), ...Object.fromEntries(
            Object.entries(next.officialAssessment).filter(([, value]) =>
              Array.isArray(value) ? value.length > 0 : String(value ?? '') !== ''
            )
          ) } as NonNullable<PPKSRecord['officialAssessment']>)
        : previous.officialAssessment,
      statusAsesmen: next.statusAsesmen === 'Lanjutan'
        ? 'Lanjutan'
        : (next.statusAsesmen === 'Terintegrasi' || next.integratedForm)
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
  // Default the read-only source to the actual ATENSI Google Forms response
  // spreadsheet already defined in the project resources. This enables live
  // dashboard sync after OAuth is authorized, without selecting a write target.
  const resolvedSourceUrl = sourceUrl || GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl;

  return {
    ...initialAppSettings,
    ...saved,
    googleFormTahapLanjutanUrl: saved.googleFormTahapLanjutanUrl || '',
    googleFormTahapLanjutanIdEntry: saved.googleFormTahapLanjutanIdEntry || '',
    googleSpreadsheetUrl: databaseUrl,
    googleSpreadsheetSourceUrl: resolvedSourceUrl,
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
  const [localCacheReady, setLocalCacheReady] = useState(false);

  useEffect(() => {
    let active = true;
    let authEventGeneration = 0;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const generation = ++authEventGeneration;
      setAuthReady(false);
      setLocalCacheReady(false);
      setAuthError('');
      if (!user) {
        setIsAuthenticated(false);
        setCurrentUserName('');
        setCurrentUserRole('');
        setPpksList([]);
        setProfile(initialProfileUser);
        setSettings(initialAppSettings);
        setAuthReady(true);
        return;
      }
      try {
        const token = await getIdTokenResult(user, true);
        if (!active || generation !== authEventGeneration || auth.currentUser?.uid !== user.uid) return;
        const role = token.claims.role;
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
          setIsAuthenticated(false);
          setCurrentUserName('');
          setCurrentUserRole('');
          setAuthError('Akun berhasil dikenali, tetapi peran resmi belum ditetapkan. Hubungi administrator SIPANDU.');
          await signOut(auth).catch((error) => console.warn('Gagal menutup sesi tanpa peran SIPANDU:', error));
        } else {
          setIsAuthenticated(true);
          setCurrentUserRole(role);
          setCurrentUserName(user.displayName || user.email || '');
        }
      } catch (error) {
        if (!active || generation !== authEventGeneration || auth.currentUser?.uid !== user.uid) return;
        console.error('Gagal memverifikasi peran SIPANDU:', error);
        setIsAuthenticated(false);
        setCurrentUserName('');
        setCurrentUserRole('');
        setAuthError('Sesi tidak dapat diverifikasi. Silakan masuk kembali atau hubungi administrator.');
        await signOut(auth).catch((signOutError) => console.warn('Gagal menutup sesi yang tidak dapat diverifikasi:', signOutError));
      } finally {
        if (active && generation === authEventGeneration && (!user || auth.currentUser?.uid === user.uid)) setAuthReady(true);
      }
    });
    return () => {
      active = false;
      authEventGeneration++;
      unsubscribe();
    };
  }, []);

  // App Navigation tab
  const [activeTab, setActiveTab] = useState<TabKey>('beranda');

  // Defer parsing potentially large PPKS/photo data until Firebase confirms authorization.
  const [ppksList, setPpksList] = useState<PPKSRecord[]>([]);
  // A separate feed for submissions made through the stage-one Form link/barcode.
  // This state must never be populated from googleSpreadsheetSourceUrl.
  const [stageOneRespondents, setStageOneRespondents] = useState<PPKSRecord[]>([]);
  const stageOneRespondentsRef = useRef<PPKSRecord[]>([]);
  const [stageOneResponseSyncState, setStageOneResponseSyncState] = useState<{
    type: 'idle' | 'success' | 'paused' | 'error';
    message: string;
    lastUpdatedAt?: string;
  }>({ type: 'idle', message: 'Menunggu sumber Google Form Asesmen Tahap Awal.' });
  const [profile, setProfile] = useState<ProfileUser>(initialProfileUser);
  const [settings, setSettings] = useState<AppSettings>(initialAppSettings);

  const continuationSheetCacheRef = useRef<{ formUrl: string; spreadsheetUrl: string } | null>(null);
  const [cloudSyncNotice, setCloudSyncNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [respondentNotifications, setRespondentNotifications] = useState<RespondentNotification[]>(() => loadRespondentNotifications(auth.currentUser?.uid || 'default'));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => getRespondentNotificationPermission());
  const [liveSyncState, setLiveSyncState] = useState<{
    type: 'idle' | 'success' | 'paused' | 'error';
    message: string;
    lastUpdatedAt?: string;
  }>({ type: 'idle', message: 'Sinkronisasi otomatis belum dimulai.' });
  const [firestoreRealtimeState, setFirestoreRealtimeState] = useState<{
    type: 'idle' | 'connected' | 'paused' | 'error';
    message: string;
    lastUpdatedAt?: string;
  }>({ type: 'idle', message: 'Realtime Firestore menunggu sesi SIPANDU.' });

  // Modals state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isGoogleWorkspaceOpen, setIsGoogleWorkspaceOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    let nextRecords: PPKSRecord[] = initialPPKSList;
    let nextProfile: ProfileUser = initialProfileUser;
    let nextSettings: AppSettings = initialAppSettings;
    try {
      const raw = localStorage.getItem('sipandu_ppks');
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          nextRecords = sortPPKSRecordsByTimestamp(deduplicatePPKSRecords(
            (parsed as PPKSRecord[]).filter((record) => record && !isLegacySamplePPKS(record))
          ));
        } else {
          console.warn('Cached PPKS data is not an array; starting with the default roster.');
        }
      }
    } catch (error) {
      console.warn('SIPANDU could not read its local PPKS cache:', error);
    }
    try {
      const raw = localStorage.getItem('sipandu_profile');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!(parsed?.nama === 'Deny Arifin Martyon S.' && parsed?.nip === '19920315 202012 1 002')) nextProfile = parsed as ProfileUser;
      }
    } catch (error) {
      console.warn('SIPANDU could not read its local profile cache:', error);
    }
    try {
      const raw = localStorage.getItem('sipandu_settings');
      if (raw) nextSettings = normalizeAppSettings(JSON.parse(raw));
    } catch (error) {
      console.warn('SIPANDU could not read its local settings cache:', error);
    }
    setPpksList(nextRecords);
    setProfile(nextProfile);
    setSettings(nextSettings);
    setLocalCacheReady(true);
  }, [authReady, isAuthenticated]);

  // Debounce large JSON serialization/writes to reduce synchronous main-thread work.
  // This is a convenience cache and is not a replacement for authenticated server storage.
  useEffect(() => {
    if (!isAuthenticated || !localCacheReady) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('sipandu_ppks', JSON.stringify(ppksList));
      } catch (error) {
        console.error('SIPANDU PPKS cache could not be persisted:', error);
        setCloudSyncNotice({ type: 'error', text: 'Browser kehabisan ruang penyimpanan untuk cache lokal. Pastikan data sudah tersinkron ke Firebase/Google Sheets sebelum menutup aplikasi.' });
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [ppksList, localCacheReady, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !localCacheReady) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem('sipandu_profile', JSON.stringify(profile)); }
      catch (error) { console.error('SIPANDU profile cache could not be persisted:', error); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [profile, localCacheReady, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !localCacheReady) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem('sipandu_settings', JSON.stringify(settings)); }
      catch (error) { console.warn('SIPANDU settings cache could not be persisted:', error); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [settings, localCacheReady, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const uid = auth.currentUser?.uid || 'default';
    setRespondentNotifications(loadRespondentNotifications(uid));
    setNotificationPermission(getRespondentNotificationPermission());
    const onNotificationHistoryUpdated = (event: Event) => {
      const eventUid = (event as CustomEvent<{ uid?: string }>).detail?.uid || '';
      if (eventUid === uid) setRespondentNotifications(loadRespondentNotifications(uid));
    };
    window.addEventListener('sipandu-respondent-notifications-updated', onNotificationHistoryUpdated);
    return () => window.removeEventListener('sipandu-respondent-notifications-updated', onNotificationHistoryUpdated);
  }, [isAuthenticated, currentUserRole]);

  useEffect(() => {
    const unreadCount = respondentNotifications.filter((item) => !item.read).length;
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unreadCount > 0) void badgeNavigator.setAppBadge?.(unreadCount).catch(() => undefined);
    else void badgeNavigator.clearAppBadge?.().catch(() => undefined);
  }, [respondentNotifications]);

  const handleEnableRespondentNotifications = async (): Promise<NotificationPermission | 'unsupported'> => {
    const permission = await enableRespondentNotifications();
    setNotificationPermission(permission);
    return permission;
  };

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
    setPpksList((localRecords) => preservePPKSRecordOrder(localRecords, mergePPKSRecords(localRecords, cloudRecords)));
  };

  const handleSendFollowUpFromNotification = (notification: RespondentNotification) => {
    if (notification.kind !== 'kuisioner') return;

    // New notifications carry an explicit stable record ID. Older saved notifications
    // can still resolve their ID from the original event key, without matching on name.
    const parts = String(notification.id || '').split(':');
    const respondentId = notification.respondentId
      || (parts[0] === 'kuisioner' && parts.length >= 3 ? parts.slice(1, -1).join(':') : '');
    if (!respondentId) {
      window.alert('ID responden tidak tersedia pada notifikasi ini. Sinkronkan spreadsheet sumber, lalu buka notifikasi responden terbaru.');
      return;
    }

    const respondent = stageOneRespondentsRef.current.find((record) => record.id === respondentId)
      || ppksList.find((record) => record.id === respondentId);
    if (!respondent) {
      window.alert('Data responden belum ditemukan di Database PPKS. Jalankan sinkronisasi Google Spreadsheet terlebih dahulu, lalu coba kembali.');
      return;
    }
    if (!respondent.noHpWa?.trim()) {
      window.alert('Nomor HP/WA responden masih kosong. Perbarui data responden sebelum menyiapkan WhatsApp.');
      return;
    }

    try {
      // Validate that a per-respondent continuation link can be generated. Never
      // silently send the stage-one URL or an unprefilled generic questionnaire.
      buildGoogleFormsPrefilledUrl(
        settings.googleFormTahapLanjutanUrl,
        settings.googleFormTahapLanjutanIdEntry,
        respondent.id
      );
      const message = buildWhatsAppMessage(respondent, {
        senderName: settings.senderName,
        senderRole: settings.senderRole,
        senderUnit: settings.senderUnit,
        googleFormTahapLanjutanUrl: settings.googleFormTahapLanjutanUrl,
        googleFormTahapLanjutanIdEntry: settings.googleFormTahapLanjutanIdEntry,
        googleFormKesehatanMentalUrl: settings.googleFormKesehatanMentalUrl,
      });
      const whatsappUrl = createWhatsAppLink(respondent.noHpWa, message);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      window.alert(`Pesan WhatsApp belum dapat disiapkan. ${detail} Buka Pengaturan Integrasi Google & WhatsApp, lalu periksa URL Google Form tahap lanjutan dan nomor entry “ID PPKS”.`);
    }
  };

  /**
   * Load follow-up answers from the response Sheet that Google Forms has linked
   * to the configured stage-two Form. Merge only rows carrying an ID that exists
   * in the stage-one roster; unmatched responses never create duplicate PPKS.
   */
  const mergeContinuationResponses = async (stageOneRecords: PPKSRecord[]): Promise<{
    records: PPKSRecord[];
    matchedResponses: number;
    warning: string;
  }> => {
    const formUrl = settings.googleFormTahapLanjutanUrl?.trim() || '';
    if (!formUrl) {
      return {
        records: stageOneRecords,
        matchedResponses: 0,
        warning: 'Formulir lanjutan belum dikonfigurasi; sinkronisasi tahap awal tetap berjalan.',
      };
    }

    try {
      let spreadsheetUrl = continuationSheetCacheRef.current?.formUrl === formUrl
        ? continuationSheetCacheRef.current.spreadsheetUrl
        : '';
      if (!spreadsheetUrl) {
        spreadsheetUrl = await getLinkedSpreadsheetUrlForForm(formUrl);
        continuationSheetCacheRef.current = { formUrl, spreadsheetUrl };
      }

      const followUpImport = await importPPKSFromSpreadsheet(spreadsheetUrl);
      const stageOneRoster = mergePPKSRecords(stageOneRecords, stageOneRespondentsRef.current);
      const stageOneById = new Map(stageOneRoster.map((record) => [record.id, record]));
      const normalizePersonName = (value: unknown) => String(value ?? '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLocaleLowerCase('id-ID')
        .replace(/[^a-z0-9]/g, '');
      const resolveNIK = (record: PPKSRecord) => {
        const candidate = String(record.nik || record.officialAssessment?.q23 || '').replace(/\\D/g, '');
        return /^\\d{16}$/.test(candidate) ? candidate : '';
      };
      // Prefilled Google Forms values can be edited by respondents, so do not
      // cross-link a response if its ID matches but its supplied identity
      // contradicts a valid stage-one NIK or name.
      const matched = followUpImport.records.filter((record) => {
        const source = stageOneById.get(record.id);
        if (!source) return false;
        const sourceNIK = resolveNIK(source);
        const followUpNIK = resolveNIK(record);
        if (sourceNIK && followUpNIK && sourceNIK !== followUpNIK) return false;
        const sourceName = normalizePersonName(source.namaLengkap);
        const followUpName = normalizePersonName(record.namaLengkap);
        if (sourceName && followUpName && sourceName !== followUpName) return false;
        return true;
      });
      const unmatchedCount = Math.max(0, followUpImport.records.length - matched.length);
      return {
        records: mergePPKSRecords(stageOneRoster, matched),
        matchedResponses: matched.length,
        warning: unmatchedCount > 0
          ? `${unmatchedCount} respons lanjutan belum dipadankan. Periksa kolom “ID PPKS” dan pastikan nama/NIK yang dijawab tidak bertentangan dengan data tahap awal.`
          : '',
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        records: stageOneRecords,
        matchedResponses: 0,
        warning: `Sinkronisasi Form lanjutan belum aktif: ${detail}`,
      };
    }
  };

  const handleSyncGoogleSpreadsheet = async (): Promise<{ records: number; sourceDataRows: number; sourceRowsWithName: number; sampleRecordsFiltered: number; duplicateRowsCollapsed: number; photosRecoveredFromForm: number; photoRecoveryStatus: string; photoRecoveryDetail: string; photoRecoveryDiagnostics: { responseCount: number; responsesWithUploads: number; recordsMatched: number }; photoCounts: { diri: number; ktp: number; kk: number; rumah: number } }> => {
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
    const continuation = await mergeContinuationResponses(imported.records);
    const recordsForSync = continuation.records;
    setPpksList((localRecords) => preservePPKSRecordOrder(localRecords, reconcileSpreadsheetPPKSRecords(localRecords, recordsForSync)));
    setSettings((current) => ({
      ...current,
      googleSpreadsheetSourceUrl: sourceUrl,
      googleSpreadsheetSourceName: imported.spreadsheetTitle,
      googleSpreadsheetSourceTab: imported.selectedTab,
    }));
    const updatedAt = new Date().toLocaleString('id-ID');
    const firestoreMessage = 'Firestore tidak dihapus atau direkonsiliasi oleh tombol sinkronisasi. Penghapusan data harus menjadi tindakan administrasi terpisah dan disengaja.';
    setLiveSyncState({
      type: 'success',
      message: `Sumber “${imported.spreadsheetTitle}” → “${imported.selectedTab}”: ${imported.sourceDataRows} baris data, ${recordsForSync.length} PPKS unik dimuat, ${imported.duplicateRowsCollapsed} duplikat spreadsheet digabung, ${imported.sampleRecordsFiltered} contoh disaring. Hasil kolom BE terpetakan: ${imported.recordsWithInterventionRecommendation}/${imported.records.length} responden. Respons Form lanjutan dipadankan: ${continuation.matchedResponses}. ${continuation.warning ? continuation.warning + ' ' : ''}Foto sumber: diri ${imported.photoCounts.diri}/${imported.records.length}, KTP ${imported.photoCounts.ktp}/${imported.records.length}, KK ${imported.photoCounts.kk}/${imported.records.length}, rumah ${imported.photoCounts.rumah}/${imported.records.length}; tautan dipulihkan dari Forms: ${imported.photosRecoveredFromForm}; status pemulihan: ${imported.photoRecoveryStatus} — ${imported.photoRecoveryDetail} ${firestoreMessage} NIK terpetakan ${imported.recordsWithNIK}/${imported.records.length}. Sinkronisasi otomatis setiap 5 menit saat dashboard terbuka dan izin Google masih berlaku.`,
      lastUpdatedAt: updatedAt,
    });
    return {
      records: recordsForSync.length,
      sourceDataRows: imported.sourceDataRows,
      sourceRowsWithName: imported.sourceRowsWithName,
      sampleRecordsFiltered: imported.sampleRecordsFiltered,
      duplicateRowsCollapsed: imported.duplicateRowsCollapsed,
      photosRecoveredFromForm: imported.photosRecoveredFromForm,
      photoRecoveryStatus: imported.photoRecoveryStatus,
      photoRecoveryDetail: imported.photoRecoveryDetail,
      photoRecoveryDiagnostics: imported.photoRecoveryDiagnostics,
      photoCounts: imported.photoCounts,
    };
  };

  // Realtime Firestore sync: apply cloud edits to records already in the selected
  // source roster. This prevents stale Firestore-only rows from reappearing after
  // Google Sheets has identified the current master roster. No automatic writes/deletes.
  useEffect(() => {
    if (!authReady || !isAuthenticated || !localCacheReady) {
      setFirestoreRealtimeState({
        type: 'idle',
        message: 'Realtime Firestore aktif setelah sesi dan cache SIPANDU siap.',
      });
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;
    let retryTimer: number | undefined;
    let retryCount = 0;
    const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

    const clearRetry = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const scheduleReconnect = (error?: Error) => {
      if (!active) return;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      clearRetry();
      retryCount += 1;
      const delay = getLiveSyncRetryDelay(retryCount);
      const delaySeconds = Math.ceil(delay / 1000);
      setFirestoreRealtimeState({
        type: online() ? 'error' : 'paused',
        message: online()
          ? `Realtime Firestore terputus: ${error?.message || 'koneksi terputus'}. Mencoba tersambung kembali otomatis dalam ${delaySeconds} detik.`
          : `Perangkat sedang offline. Realtime Firestore akan menyambung kembali otomatis; percobaan berikutnya dalam ${delaySeconds} detik.`,
      });
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!active || unsubscribe) return;
      if (!online()) {
        scheduleReconnect(new Error('Tidak ada koneksi internet.'));
        return;
      }
      try {
        unsubscribe = subscribeToPPKSChanges((cloudRecords, info) => {
          if (!active) return;
          retryCount = 0;
          setPpksList((currentRecords) => {
            const knownIds = new Set(currentRecords.map((record) => record.id));
            const recordsFromCurrentRoster = cloudRecords.filter((record) => knownIds.has(record.id));
            return recordsFromCurrentRoster.length
              ? preservePPKSRecordOrder(currentRecords, mergePPKSRecords(currentRecords, recordsFromCurrentRoster))
              : currentRecords;
          });
          setFirestoreRealtimeState({
            type: info.fromCache ? 'paused' : 'connected',
            message: info.fromCache
              ? `Data realtime memakai cache lokal sementara; perubahan cloud diterapkan ketika server tersambung (${cloudRecords.length} dokumen terbaca).`
              : `Realtime Firestore aktif — perubahan antarperangkat diterapkan otomatis (${cloudRecords.length} dokumen cloud terbaca).`,
            lastUpdatedAt: new Date().toLocaleString('id-ID'),
          });
        }, (error) => {
          if (!active) return;
          unsubscribe = null;
          scheduleReconnect(error);
        });
      } catch (error) {
        scheduleReconnect(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const wakeReconnect = () => {
      if (!active || unsubscribe || !online()) return;
      clearRetry();
      retryCount = 0;
      connect();
    };
    const handleOffline = () => {
      if (!active) return;
      setFirestoreRealtimeState({
        type: 'paused',
        message: 'Koneksi internet terputus. Firestore akan menyambung kembali otomatis saat perangkat online.',
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') wakeReconnect();
    };

    window.addEventListener('online', wakeReconnect);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', wakeReconnect);
    window.addEventListener('pageshow', wakeReconnect);
    document.addEventListener('visibilitychange', handleVisibility);
    connect();

    return () => {
      active = false;
      clearRetry();
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      window.removeEventListener('online', wakeReconnect);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', wakeReconnect);
      window.removeEventListener('pageshow', wakeReconnect);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authReady, isAuthenticated, localCacheReady]);

  // Separate source: only responses submitted through the configured stage-one Form link/barcode
  // are shown in the Asesmen Tahap Awal table. The primary/master spreadsheet never feeds this list.
  useEffect(() => {
    if (!authReady || !localCacheReady) return;

    const formUrl = settings.googleFormTahapAwalUrl?.trim() || '';
    if (!isAuthenticated || !formUrl) {
      stageOneRespondentsRef.current = [];
      setStageOneRespondents([]);
      setStageOneResponseSyncState({
        type: !isAuthenticated ? 'idle' : 'error',
        message: !isAuthenticated
          ? 'Sumber asesmen tahap awal aktif setelah petugas masuk.'
          : 'URL Google Form Asesmen Tahap Awal belum diatur; daftar tidak mengambil data dari spreadsheet utama.',
      });
      return;
    }

    let active = true;
    let running = false;
    let timer: number | undefined;
    let failedAttempts = 0;
    const schedule = (delay: number) => {
      if (!active) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        void syncStageOneForm();
      }, Math.max(0, delay));
    };

    const syncStageOneForm = async () => {
      if (!active || running) return;
      running = true;
      let nextDelay = LIVE_SYNC_INTERVAL_MS;
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw new Error('Koneksi internet terputus; sumber asesmen tahap awal akan dicoba kembali otomatis.');
        }
        const token = await getAccessToken();
        if (!token) {
          throw new Error('Izin Google belum tersedia. Masuk kembali melalui Google Workspace & Cloud Hub agar respons Form tahap awal dapat dibaca.');
        }

        // Resolve the sheet linked to the stage-one Form itself, not the primary roster/source sheet.
        const responseSheetUrl = await getLinkedSpreadsheetUrlForForm(formUrl);
        const imported = await importPPKSFromSpreadsheet(responseSheetUrl);
        if (!active) return;

        const freshStageOneRecords = filterStageOneLinkResponses(imported.records);
        const notificationUid = auth.currentUser?.uid || 'default';
        await processRespondentSubmissionEvents(
          notificationUid,
          freshStageOneRecords.map(({ id, namaLengkap, timestamp }) => ({ id, namaLengkap, timestamp })),
          freshStageOneRecords as unknown as Array<Record<string, unknown>>,
          {
            baselineNamespace: 'stage-one-form-link',
            notifyNewQuestionnairesOnFirstImport: true,
          },
        );
        if (!active) return;
        setRespondentNotifications(loadRespondentNotifications(notificationUid));
        stageOneRespondentsRef.current = freshStageOneRecords;
        setStageOneRespondents(freshStageOneRecords);
        failedAttempts = 0;
        setStageOneResponseSyncState({
          type: 'success',
          message: `Sumber khusus Form tahap awal terhubung: tab “${imported.selectedTab}”. ${freshStageOneRecords.length} responden setelah pemisahan sumber ditampilkan; ${Math.max(0, imported.records.length - freshStageOneRecords.length)} baris lama/tidak memenuhi batas pemisahan tidak ditampilkan. Diperbarui ${new Date().toLocaleString('id-ID')}.`,
          lastUpdatedAt: new Date().toLocaleString('id-ID'),
        });
      } catch (error) {
        if (!active) return;
        failedAttempts += 1;
        nextDelay = getLiveSyncRetryDelay(failedAttempts);
        const detail = error instanceof Error ? error.message : String(error);
        setStageOneResponseSyncState({
          type: 'error',
          message: `Daftar khusus asesmen tahap awal belum dapat disinkronkan dari link/barcode Form: ${detail} Percobaan ulang otomatis dalam ${Math.ceil(nextDelay / 1000)} detik. Data dari spreadsheet utama tidak akan dipakai sebagai pengganti.`,
        });
        console.error('SIPANDU stage-one Form response sync failed:', error);
      } finally {
        running = false;
        if (active) schedule(nextDelay);
      }
    };

    const wake = () => {
      if (!active || running || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      schedule(0);
    };
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('sipandu-workspace-token-updated', wake);
    schedule(1200);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('sipandu-workspace-token-updated', wake);
    };
  }, [
    authReady,
    isAuthenticated,
    localCacheReady,
    settings.googleFormTahapAwalUrl,
  ]);

  // Continuously poll Google Forms' linked response Sheet while the app is signed in.
  // Firestore provides instant cross-device updates; Google Sheets does not expose a
  // browser push subscription, so this side uses a quota-conscious retrying poll loop.
  useEffect(() => {
    if (!authReady || !localCacheReady) return;

    const sourceUrl = settings.googleSpreadsheetSourceUrl?.trim() || '';
    const sourceTab = settings.googleSpreadsheetSourceTab?.trim() || undefined;
    if (!isAuthenticated || !sourceUrl) {
      setLiveSyncState({
        type: 'idle',
        message: isAuthenticated
          ? 'Live sync menunggu spreadsheet sumber Google Workspace yang valid.'
          : 'Live sync berjalan setelah akun SIPANDU masuk.',
      });
      return;
    }

    let active = true;
    let running = false;
    let timer: number | undefined;
    let scheduledAt = 0;
    let failedAttempts = 0;
    const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

    const schedule = (delay: number) => {
      if (!active) return;
      if (timer !== undefined) window.clearTimeout(timer);
      const safeDelay = Math.max(0, delay);
      scheduledAt = Date.now() + safeDelay;
      timer = window.setTimeout(() => {
        timer = undefined;
        scheduledAt = 0;
        void syncOnce();
      }, safeDelay);
    };

    const syncOnce = async () => {
      if (!active || running) return;
      running = true;
      let nextDelay = LIVE_SYNC_INTERVAL_MS;
      try {
        if (!online()) {
          failedAttempts += 1;
          nextDelay = getLiveSyncRetryDelay(failedAttempts);
          setLiveSyncState({
            type: 'paused',
            message: `Koneksi internet terputus. Live sync Google akan mencoba kembali otomatis dalam ${Math.ceil(nextDelay / 1000)} detik.`,
          });
          return;
        }

        const token = await getAccessToken();
        if (!active) return;
        if (!token) {
          failedAttempts += 1;
          nextDelay = getLiveSyncRetryDelay(failedAttempts);
          setLiveSyncState({
            type: 'paused',
            message: `Live sync Google menunggu izin API. SIPANDU akan mencoba lagi otomatis dalam ${Math.ceil(nextDelay / 1000)} detik; pemulihan izin manual hanya diperlukan jika sesi benar-benar dicabut.`,
          });
          return;
        }

        const imported = await importPPKSFromSpreadsheet(sourceUrl, sourceTab);
        if (!active) return;
        if (!imported.records.length) {
          throw new Error(
            `Spreadsheet “${imported.spreadsheetTitle}” terbaca (${imported.rowsRead} baris), tetapi tidak ditemukan baris responden dengan kolom nama yang dikenali. Periksa tab dan judul kolom.`
          );
        }

        const continuation = await mergeContinuationResponses(imported.records);
        if (!active) return;
        const recordsForSync = continuation.records;
        setPpksList((current) => reconcileSpreadsheetPPKSRecords(current, recordsForSync));
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
        failedAttempts = 0;
        setLiveSyncState({
          type: 'success',
          message: `LIVE SYNC aktif berulang — “${imported.spreadsheetTitle}” → “${imported.selectedTab}”: ${recordsForSync.length} PPKS unik dimuat dari ${imported.sourceDataRows} baris tahap awal; ${imported.duplicateRowsCollapsed} duplikat digabung; ${imported.sampleRecordsFiltered} contoh disaring; hasil kolom BE terpetakan: ${imported.recordsWithInterventionRecommendation}/${imported.records.length} responden; respons Google Form lanjutan yang dipadankan: ${continuation.matchedResponses}. ${continuation.warning ? continuation.warning + ' ' : ''}Foto diri ${imported.photoCounts.diri}/${imported.records.length}, KTP ${imported.photoCounts.ktp}/${imported.records.length}, KK ${imported.photoCounts.kk}/${imported.records.length}, rumah ${imported.photoCounts.rumah}/${imported.records.length}; tautan Forms dipulihkan: ${imported.photosRecoveredFromForm} (${imported.photoRecoveryStatus}); diagnosis: ${imported.photoRecoveryDetail}. Firestore tidak dihapus secara otomatis.`,
          lastUpdatedAt: new Date().toLocaleString('id-ID'),
        });
      } catch (error) {
        if (!active) return;
        failedAttempts += 1;
        nextDelay = getLiveSyncRetryDelay(failedAttempts);
        const detail = error instanceof Error ? error.message : String(error);
        console.error('SIPANDU continuous Google Workspace live sync failed; retry scheduled:', error);
        setLiveSyncState({
          type: 'error',
          message: `${detail} Percobaan ulang otomatis dalam ${Math.ceil(nextDelay / 1000)} detik; sinkronisasi tidak dihentikan permanen.`,
        });
      } finally {
        running = false;
        if (active) schedule(nextDelay);
      }
    };

    // Focus/visibility events must not restart Google polling on every app switch.
    // Keep the existing five-minute schedule; only wake immediately if it is due.
    const wakeSync = () => {
      if (!active || running || !online()) return;
      if (timer === undefined || scheduledAt <= Date.now()) schedule(0);
    };
    const wakeSyncImmediately = () => {
      if (!active || running || !online()) return;
      schedule(0);
    };
    const handleOnline = () => wakeSyncImmediately();
    const handleWorkspaceTokenUpdated = () => wakeSyncImmediately();
    const handleOffline = () => {
      if (!active) return;
      setLiveSyncState({
        type: 'paused',
        message: 'Koneksi internet terputus. Live sync akan dilanjutkan otomatis ketika perangkat online.',
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') wakeSync();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', wakeSync);
    window.addEventListener('pageshow', wakeSync);
    window.addEventListener('sipandu-workspace-token-updated', handleWorkspaceTokenUpdated);
    document.addEventListener('visibilitychange', handleVisibility);
    schedule(1500);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', wakeSync);
      window.removeEventListener('pageshow', wakeSync);
      window.removeEventListener('sipandu-workspace-token-updated', handleWorkspaceTokenUpdated);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    authReady,
    isAuthenticated,
    localCacheReady,
    settings.googleSpreadsheetSourceUrl,
    settings.googleSpreadsheetSourceTab,
    settings.googleFormTahapLanjutanUrl,
    currentUserRole,
  ]);

  // Destructive demo-data cleanup is intentionally manual in Google Workspace & Cloud Hub.
  // Login and ordinary live sync never delete cloud rows/files as automatic side effects.

  // Avoid showing protected UI until Firebase has resolved the current session.
  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a140b] text-emerald-200">Memeriksa sesi SIPANDU…</div>;
  }

  if (isAuthenticated && !localCacheReady) {
    return <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-[#0a140b] text-emerald-200">Menyiapkan data SIPANDU…</div>;
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
          accountPhotoUrl={auth.currentUser?.photoURL || ''}
          unreadNotificationsCount={respondentNotifications.filter((item) => !item.read).length}
          onOpenEditProfile={() => setIsEditProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNotifications={() => {
            const uid = auth.currentUser?.uid || 'default';
            setRespondentNotifications(markRespondentNotificationsRead(uid));
            setIsNotificationsOpen(true);
          }}
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

        <Suspense fallback={<div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center text-sm text-emerald-200">Memuat menu SIPANDU…</div>}>
          {activeTab === 'beranda' && (
            <BerandaView
              ppksList={ppksList}
              googleSpreadsheetUrl={settings.googleSpreadsheetSourceUrl || ''}
              googleSpreadsheetName={settings.googleSpreadsheetSourceName || ''}
              onSyncGoogleSpreadsheet={handleSyncGoogleSpreadsheet}
              liveSyncStatus={liveSyncState.type}
              liveSyncLastUpdatedAt={liveSyncState.lastUpdatedAt}
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
              stageOneRespondents={stageOneRespondents}
              stageOneSyncMessage={stageOneResponseSyncState.message}
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
        </Suspense>
      </main>

      {/* Bottom Navigation Bar: BERANDA - DATABASE PPKS - ASESMEN - FROM ASESMEN TERINTEGRASI - DOKUMEN */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Load rarely used modal code only after the user opens that modal. */}
      <Suspense fallback={null}>
        {isEditProfileOpen && (
          <EditProfileModal
            isOpen={true}
            onClose={() => setIsEditProfileOpen(false)}
            profile={profile}
            onSave={(updated) => setProfile(updated)}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            isOpen={true}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onSave={(updated) => setSettings(updated)}
          />
        )}

        {isNotificationsOpen && (
          <NotificationsModal
            isOpen={true}
            onClose={() => setIsNotificationsOpen(false)}
            notifications={respondentNotifications}
            permission={notificationPermission}
            onEnableNotifications={handleEnableRespondentNotifications}
            onMarkAllRead={() => setRespondentNotifications(markRespondentNotificationsRead(auth.currentUser?.uid || 'default'))}
            followUpReady={Boolean(
              settings.googleFormTahapLanjutanUrl?.trim() &&
              /^\d+$/.test(String(settings.googleFormTahapLanjutanIdEntry || '').replace(/^entry\./i, ''))
            )}
            onSendFollowUp={handleSendFollowUpFromNotification}
          />
        )}

        {isGoogleWorkspaceOpen && (
          <GoogleWorkspaceModal
            isOpen={true}
            onClose={() => setIsGoogleWorkspaceOpen(false)}
            ppksList={ppksList}
            settings={settings}
            onUpdateSettings={(updated) => setSettings(updated)}
            onLoadPPKSFromCloud={handleLoadPPKSFromCloud}
          />
        )}
      </Suspense>
    </div>
  );
}
