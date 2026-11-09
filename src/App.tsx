import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { PPKSRecord, ProfileUser, AppSettings, PPKSServiceStatus, SecurityAuditEntry } from './types';
import { importLazyModuleWithRecovery } from './lib/lazyImportRecovery';
import { initialPPKSList, initialProfileUser, initialAppSettings, isLegacySamplePPKS } from './data/initialData';
import { LoginPage } from './components/LoginPage';
import { StageOneRespondentPage } from './components/StageOneRespondentPage';
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
const SIPANDUAICopilot = lazyWithRecovery('SIPANDUAICopilot', () => import('./components/SIPANDUAICopilot').then((module) => ({ default: module.SIPANDUAICopilot })));
const ServiceCenterView = lazyWithRecovery('ServiceCenterView', () => import('./components/ServiceCenterView').then((module) => ({ default: module.ServiceCenterView })));
const RegionalIntelligenceView = lazyWithRecovery('RegionalIntelligenceView', () => import('./components/RegionalIntelligenceView').then((module) => ({ default: module.RegionalIntelligenceView })));
const ProgramPerformanceView = lazyWithRecovery('ProgramPerformanceView', () => import('./components/ProgramPerformanceView').then((module) => ({ default: module.ProgramPerformanceView })));
const FieldAssistanceView = lazyWithRecovery('FieldAssistanceView', () => import('./components/FieldAssistanceView').then((module) => ({ default: module.FieldAssistanceView })));
const SecurityAuditView = lazyWithRecovery('SecurityAuditView', () => import('./components/SecurityAuditView').then((module) => ({ default: module.SecurityAuditView })));
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { SIPANDU_AI_WORKER_URL } from './lib/sipanduAI';
import { auth, getAccessToken, savePPKSToFirestore, saveIntegratedAssessmentToFirestore, replacePPKSCollectionFromSpreadsheet, googleLogout, subscribeToPPKSChanges, subscribeToPPKSServiceStatus, savePPKSServiceUpdate, subscribeToFieldVisits, createFieldVisit, subscribeToIntegratedAssessmentAnswers, fetchSecurityAuditActivity, saveStageOneIntakeToFirestore, subscribeToStageOneIntake, staffAuthPersistenceReady, isWorkspaceAccountConnected, invalidateAccessToken, getSIPANDUUserProfile, saveSIPANDUUserProfile } from './lib/firebase';
import { activatePendingTeamMember, restorePendingTeamInvitation } from './lib/teamRegistration';
import { ensureSIPANDUDatabaseSheet, extractSpreadsheetId, getLinkedSpreadsheetUrlForForm, importPPKSFromSpreadsheet, upsertPPKSInSpreadsheet } from './lib/googleWorkspace';
import { GOOGLE_SIPANDU_RESOURCES, SIPANDU_OWNER_WHATSAPP_PHONE } from './lib/googleSIPANDUResources';
import { getLiveSyncRetryDelay, LIVE_SYNC_INTERVAL_MS } from './lib/liveSyncPolicy';
import { getCloudOnlyCompletedAssessments, mergeIntegratedAssessmentAnswers, type IntegratedAssessmentAnswersById } from './lib/integratedAssessmentArchive';
import { preservePPKSRecordOrder } from './lib/ppksRecordState';
import { clearFollowUpLocalNotifications, syncFollowUpLocalNotifications } from './lib/followUpNotificationScheduler';
import { filterStageOneNotificationSubmissions } from './lib/stageOneRespondents';
import { deduplicatePPKSRecords, parsePPKSTimestamp, samePPKSIdentity, sortPPKSRecordsByName, sortPPKSRecordsByTimestamp } from './lib/ppksData';
import { normalizePPKSPhotoSource } from './lib/photoSources';
import { stripPhotoPayloadsFromLocalCache } from './lib/localCacheSanitizer';
import { buildGoogleFormsPrefilledUrl, buildWhatsAppMessage, createWhatsAppLink } from './utils/helpers';
import {
  loadRespondentNotifications,
  markRespondentNotificationsRead,
  processRespondentSubmissionEvents,
  notifyIntegratedAssessmentSaved,
  type RespondentNotification,
} from './lib/respondentNotifications';

// Map Google Identity Toolkit IAM errors (including INSUFFICIENT_PERMISSION) to a safe recovery path.
function describeTeamActivationError(error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  const missing = [...new Set(
    detail.match(/FIREBASE_SERVICE_ACCOUNT_JSON|FIREBASE_AUTH_API_KEY|FIREBASE_WEB_API_KEY|FIREBASE_PROJECT_ID|PENDING_REGISTRATIONS KV/g) || []
  )];

  if (missing.length) {
    return `Email sudah diverifikasi, tetapi layanan belum dapat menerbitkan peran SIPANDU. Konfigurasi Worker yang belum tersedia: ${missing.join(', ')}. Administrator perlu melengkapi secret/binding pada Worker sipandu-registration. Sesi akun tetap tersimpan.`;
  }
  if (/layanan aktivasi belum siap dikonfigurasi administrator/i.test(detail)) {
    return 'Email sudah diverifikasi, tetapi Worker pendaftaran belum memiliki kredensial service account Firebase. Administrator perlu memasang secret FIREBASE_SERVICE_ACCOUNT_JSON pada Worker sipandu-registration dan memastikan izin IAM firebaseauth.users.update. Sesi akun tetap tersimpan.';
  }
  if (/PERMISSION_DENIED|INSUFFICIENT[_ ]+PERMISSION|firebaseauth[.]users[.]update|not authorized|insufficient[_ ]+permission/i.test(detail)) {
    return 'Email sudah diverifikasi, tetapi Firebase menolak pemberian peran pendamping karena izin service account belum lengkap. Pada Google Cloud Console proyek gen-lang-client-0197631978, buka IAM & Admin → IAM, cari service account yang tercantum sebagai client_email di secret FIREBASE_SERVICE_ACCOUNT_JSON milik Worker sipandu-registration, lalu berikan izin IAM firebaseauth.users.update (gunakan custom role khusus dengan izin tersebut). Setelah izin tersimpan, tekan “Coba verifikasi akses lagi”. Undangan dan sesi akun tetap tersimpan; tidak perlu mendaftar ulang.';
  }
  if (/undangan.*(tidak ditemukan|kedaluwarsa)|pending.*(not found|expired)/i.test(detail)) {
    return 'Email sudah diverifikasi, tetapi undangan pendaftaran tim tidak ditemukan atau telah kedaluwarsa. Pulihkan undangan untuk email yang sama; jangan membuat akun baru. Sesi akun tetap tersimpan.';
  }
  if (/email belum diverifikasi|not verified/i.test(detail)) {
    return 'Firebase belum membaca status verifikasi email. Buka kembali tautan verifikasi, lalu masuk dan coba lagi. Sesi akun tetap tersimpan.';
  }
  if (/network|fetch|tidak dapat dijangkau|unavailable|timeout/i.test(detail)) {
    return 'Layanan aktivasi SIPANDU belum dapat dijangkau. Periksa koneksi internet dan coba verifikasi lagi. Sesi akun tetap tersimpan.';
  }
  return `Email sudah diverifikasi, tetapi aktivasi peran SIPANDU belum berhasil. ${detail || 'Administrator perlu memeriksa Worker pendaftaran dan Firebase Authentication.'} Sesi akun tetap tersimpan.`;
}

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

function reconcileSpreadsheetPPKSRecords(
  localRecords: PPKSRecord[],
  sourceRecords: PPKSRecord[],
  authoritativeProfileRecords: PPKSRecord[] = sourceRecords,
): PPKSRecord[] {
  // The selected ATENSI response tab is authoritative for mapped profile fields.
  // Continuation Form rows may enrich assessment answers, but not these values.
  const uniqueSource = deduplicatePPKSRecords(sourceRecords);
  const uniqueProfileSource = deduplicatePPKSRecords(authoritativeProfileRecords);
  const merged = mergePPKSRecords(localRecords, uniqueSource);
  const sourceMatched = merged.filter((record) =>
    uniqueSource.some((sourceRecord) => samePPKSIdentity(record, sourceRecord))
  );
  const exactSourceValues = sourceMatched.map((record) => {
    const source = uniqueProfileSource.find((item) => item.id === record.id)
      || uniqueProfileSource.find((item) => samePPKSIdentity(item, record));
    if (!source) return record;
    const overrides = record.manualPhotoOverrides || {};
    return {
      ...record,
      timestamp: source.timestamp,
      namaLengkap: source.namaLengkap,
      nik: source.nik,
      usia: source.usia,
      alamatLengkap: source.alamatLengkap,
      kotaDomisili: source.kotaDomisili,
      noHpWa: source.noHpWa,
      jenisBantuan: source.jenisBantuan,
      intervensiMental: source.intervensiMental,
      desil: source.desil,
      fotoDiri: normalizePPKSPhotoSource(overrides.fotoDiri) || normalizePPKSPhotoSource(source.fotoDiri) || '',
      fotoKtp: normalizePPKSPhotoSource(overrides.fotoKtp) || normalizePPKSPhotoSource(source.fotoKtp) || '',
      fotoKk: normalizePPKSPhotoSource(overrides.fotoKk) || normalizePPKSPhotoSource(source.fotoKk) || '',
      fotoRumah: normalizePPKSPhotoSource(overrides.fotoRumah) || normalizePPKSPhotoSource(source.fotoRumah) || '',
    };
  });
  return sortPPKSRecordsByName(deduplicatePPKSRecords(exactSourceValues));
}

function normalizeAppSettings(value: unknown): AppSettings {
  const saved = value && typeof value === 'object' ? value as Partial<AppSettings> : {};
  // Backward-compatible URL field used by the Google Workspace Forms diagnostic.
  // The native SIPANDU stage-one form no longer uses a Google Form URL.
  const stageOneFormUrl = saved.googleFormTahapAwalUrl?.trim() || GOOGLE_SIPANDU_RESOURCES.formRespondentUrl;
  let databaseUrl = saved.googleSpreadsheetUrl?.trim() || '';
  if (databaseUrl.includes('1yA8KemensosODHIVSumut2026_LiveSync')) databaseUrl = '';
  if (databaseUrl) {
    try {
      if (extractSpreadsheetId(databaseUrl) === GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetId) databaseUrl = '';
    } catch {
      databaseUrl = '';
    }
  }

  // SIPANDU ODHIV uses one verified ATENSI response spreadsheet as the
  // authoritative PPKS roster. Do not let an older device/Firestore setting point
  // the app back to a previous spreadsheet or a different response tab.
  const resolvedSourceUrl = GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl;
  const sourceName = 'Sumber ATENSI SIPANDU';
  const sourceTab = 'From Responses 1';

  return {
    ...initialAppSettings,
    ...saved,
    googleFormTahapAwalUrl: stageOneFormUrl,
    googleFormTahapLanjutanUrl: saved.googleFormTahapLanjutanUrl || '',
    googleFormTahapLanjutanIdEntry: saved.googleFormTahapLanjutanIdEntry || '',
    googleSpreadsheetUrl: databaseUrl,
    googleSpreadsheetSourceUrl: resolvedSourceUrl,
    googleSpreadsheetSourceName: sourceName,
    googleSpreadsheetSourceTab: sourceTab,
    googleDriveFolderUrl: GOOGLE_SIPANDU_RESOURCES.driveFolderUrl,
    theme: saved.theme === 'light' ? 'light' : 'dark',
  };
}

async function clearSipanduBrowserCaches(): Promise<void> {
  const clearStorage = (storage: Storage) => {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && (key.startsWith('sipandu_') || key.startsWith('sipandu:'))) {
        storage.removeItem(key);
      }
    }
  };
  try { clearStorage(window.localStorage); } catch { /* Browser storage may be disabled. */ }
  try { clearStorage(window.sessionStorage); } catch { /* Browser storage may be disabled. */ }
  if ('caches' in window) {
    try {
      await Promise.all((await window.caches.keys()).map((key) => window.caches.delete(key)));
    } catch (error) {
      console.warn('SIPANDU could not clear the browser cache:', error);
    }
  }
}

function StaffApp() {
  // Firebase Authentication is the source of truth; URL/localStorage flags cannot bypass login.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState(auth.currentUser?.uid || '');
  const [authReady, setAuthReady] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [authError, setAuthError] = useState('');
  const [localCacheReady, setLocalCacheReady] = useState(false);

  useEffect(() => {
    let active = true;
    let authEventGeneration = 0;
    let unsubscribe: (() => void) | null = null;
    void staffAuthPersistenceReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
      const generation = ++authEventGeneration;
      setAuthReady(false);
      // Hide the previous account while the next Firebase identity is verified.
      setIsAuthenticated(false);
      setCurrentUserUid(user?.uid || '');
      setRespondentNotifications(user ? loadRespondentNotifications(user.uid) : []);
      setCurrentUserName('');
      setCurrentUserRole('');
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
        // A verified member who registered with the shared team code is activated
        // on the server. The Worker assigns only the pendamping claim after it
        // confirms the pending invitation and the verified Firebase identity.
        // Refresh Firebase's cached user profile and ID token before making
        // an authorization decision. Email verification may have happened in
        // another browser/app after this session was first created.
        // A signed-in staff member already has a durable Firebase session and a
        // cached, signed role claim. Reuse it during normal reloads; refreshing
        // the user/token on every startup made temporary network failures look
        // like a logout. Re-check with the server only when the cached role is
        // missing or invalid (e.g. a newly activated invitation).
        let token = await getIdTokenResult(user);
        let role = token.claims.role;
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
          await user.reload();
          token = await getIdTokenResult(user, true);
          role = token.claims.role;
        }
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping' && !user.emailVerified) {
          setIsAuthenticated(false);
          setCurrentUserName('');
          setCurrentUserRole('');
          setAuthError('Email akun SIPANDU belum diverifikasi. Buka tautan verifikasi yang dikirim ke email, lalu masuk kembali.');
          return;
        }
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
          try {
            await activatePendingTeamMember(user);
            token = await getIdTokenResult(user, true);
            role = token.claims.role;
          } catch (activationError) {
            console.warn('Aktivasi pendaftaran anggota SIPANDU belum selesai:', activationError);
            if (!active || generation !== authEventGeneration || auth.currentUser?.uid !== user.uid) return;
            setIsAuthenticated(false);
            setCurrentUserName('');
            setCurrentUserRole('');
            setAuthError(describeTeamActivationError(activationError));
            return;
          }
        }
        if (!active || generation !== authEventGeneration || auth.currentUser?.uid !== user.uid) return;
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
          setIsAuthenticated(false);
          setCurrentUserName('');
          setCurrentUserRole('');
          setAuthError('Worker aktivasi telah merespons, tetapi klaim peran belum muncul pada token Firebase terbaru. Coba verifikasi lagi; bila tetap terjadi, administrator perlu memeriksa custom claim akun dan log Worker. Sesi akun tetap tersimpan.');
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
        setAuthError('Sesi akun tetap tersimpan. Verifikasi sementara gagal, kemungkinan karena jaringan atau Firebase sedang tidak tersedia. Tekan “Coba verifikasi lagi”; aplikasi tidak akan menghapus sesi secara otomatis.');
      } finally {
        if (active && generation === authEventGeneration && (!user || auth.currentUser?.uid === user.uid)) setAuthReady(true);
      }
      });
    });
    return () => {
      active = false;
      authEventGeneration++;
      unsubscribe?.();
    };
  }, []);

  // App navigation history: every selected bottom-nav menu pushes the previous menu.
  const [activeTab, setActiveTab] = useState<TabKey>('beranda');
  const [selectedDocumentAssessmentId, setSelectedDocumentAssessmentId] = useState('');
  const tabNavigationHistoryRef = useRef<TabKey[]>([]);
  const navigateToTab = useCallback((tab: TabKey) => {
    if (tab === activeTab) return;
    tabNavigationHistoryRef.current = [...tabNavigationHistoryRef.current, activeTab].slice(-40);
    setActiveTab(tab);
  }, [activeTab]);

  // Defer parsing potentially large PPKS/photo data until Firebase confirms authorization.
  const [ppksList, setPpksList] = useState<PPKSRecord[]>([]);
  const [fieldVisits, setFieldVisits] = useState<import('./types').FieldVisitRecord[]>([]);
  const [fieldVisitError, setFieldVisitError] = useState('');
  const [serviceStatuses, setServiceStatuses] = useState<PPKSServiceStatus[]>([]);
  const [serviceStatusLoading, setServiceStatusLoading] = useState(true);
  const [serviceStatusError, setServiceStatusError] = useState('');
  const [securityAuditEntries, setSecurityAuditEntries] = useState<SecurityAuditEntry[]>([]);
  const [securityAuditLoading, setSecurityAuditLoading] = useState(false);
  const [securityAuditError, setSecurityAuditError] = useState('');
  const [integratedAssessmentAnswers, setIntegratedAssessmentAnswers] = useState<IntegratedAssessmentAnswersById>({});
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
  const [isAICopilotOpen, setIsAICopilotOpen] = useState<boolean>(false);
  const [isAICopilotAvailable, setIsAICopilotAvailable] = useState<boolean>(false);

  // Keep the AI entry point hidden until the isolated backend confirms its Gemini secret is configured.
  // This prevents a non-functional or unconfigured Copilot from appearing in the production app.
  useEffect(() => {
    const allowedRole = isAuthenticated && ["owner", "supervisor", "pendamping"].includes(currentUserRole);
    if (!allowedRole) {
      setIsAICopilotAvailable(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    void fetch(SIPANDU_AI_WORKER_URL + "/health", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      return await response.json() as { service?: string; mode?: string; configured?: boolean };
    }).then((health) => {
      if (!active) return;
      setIsAICopilotAvailable(Boolean(
        health?.service === "SIPANDU AI Copilot" &&
        health.mode === "read-only" &&
        health.configured === true
      ));
    }).catch(() => {
      if (active) setIsAICopilotAvailable(false);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [isAuthenticated, currentUserRole]);

  const lastBackNavigationAtRef = useRef(0);
  const handleBackNavigation = useCallback(() => {
    // Debounce duplicate events when an Android edge gesture and touch swipe arrive together.
    const now = Date.now();
    if (now - lastBackNavigationAtRef.current < 220) return;
    lastBackNavigationAtRef.current = now;
    if (!isAuthenticated) return;
    if (isAICopilotOpen) { setIsAICopilotOpen(false); return; }

    // Close the top-most application modal before moving between menus.
    if (isGoogleWorkspaceOpen) { setIsGoogleWorkspaceOpen(false); return; }
    if (isNotificationsOpen) { setIsNotificationsOpen(false); return; }
    if (isSettingsOpen) { setIsSettingsOpen(false); return; }
    if (isEditProfileOpen) { setIsEditProfileOpen(false); return; }

    // Give the active view the first chance to leave its own submenu, preview, or dialog.
    const backDetail = { handled: false };
    window.dispatchEvent(new CustomEvent('sipandu:navigate-back', { detail: backDetail }));
    if (backDetail.handled) return;

    const previousTab = tabNavigationHistoryRef.current.pop();
    if (previousTab) {
      setActiveTab(previousTab);
      return;
    }

    // No older menu? Return to Beranda, and remain on Beranda rather than exiting the app.
    if (activeTab !== 'beranda') setActiveTab('beranda');
  }, [
    activeTab,
    isAuthenticated,
    isAICopilotOpen,
    isEditProfileOpen,
    isGoogleWorkspaceOpen,
    isNotificationsOpen,
    isSettingsOpen,
  ]);

  const backNavigationHandlerRef = useRef(handleBackNavigation);
  backNavigationHandlerRef.current = handleBackNavigation;

  // Keep browser/PWA Back inside SIPANDU. Capacitor's hardware Back uses the same handler.
  useEffect(() => {
    if (!isAuthenticated) return;
    const guardState = () => ({
      ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
      __sipanduNavigationGuard: true,
    });
    window.history.pushState(guardState(), '', window.location.href);
    const onPopState = () => {
      backNavigationHandlerRef.current();
      window.history.pushState(guardState(), '', window.location.href);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let mounted = true;
    let listener: { remove: () => Promise<void> } | undefined;
    void CapacitorApp.addListener('backButton', () => {
      backNavigationHandlerRef.current();
    }).then((handle) => {
      if (mounted) listener = handle;
      else void handle.remove();
    }).catch((error: unknown) => {
      console.warn('SIPANDU could not register Android Back navigation:', error);
    });
    return () => {
      mounted = false;
      if (listener) void listener.remove();
    };
  }, []);

  // Both left and right swipes go back one menu. Form controls and horizontal carousels
  // are excluded so swiping never submits a form or fights a field/scroll container.
  useEffect(() => {
    let touchStart: { x: number; y: number; at: number; ignored: boolean } | null = null;
    const shouldIgnoreSwipe = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return true;
      return Boolean(target.closest(
        'input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-no-app-swipe="true"], .official-assessment-shell, .official-page, .official-table, .no-app-swipe, .overflow-x-auto, canvas, iframe, video, [role="dialog"]'
      ));
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touchStart = null; return; }
      const touch = event.touches[0];
      touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        at: Date.now(),
        ignored: shouldIgnoreSwipe(event.target),
      };
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!touchStart || touchStart.ignored || event.changedTouches.length !== 1) {
        touchStart = null;
        return;
      }
      const start = touchStart;
      touchStart = null;
      const end = event.changedTouches[0];
      const deltaX = end.clientX - start.x;
      const deltaY = end.clientY - start.y;
      const elapsed = Date.now() - start.at;
      if (Math.abs(deltaX) < 76 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3 || elapsed > 1200) return;
      event.preventDefault();
      backNavigationHandlerRef.current();
    };
    const onTouchCancel = () => { touchStart = null; };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

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
            (stripPhotoPayloadsFromLocalCache(parsed) as PPKSRecord[]).filter((record) => record && !isLegacySamplePPKS(record))
          ));
          // Immediately scrub any legacy inline photo payloads left by older builds.
          try { localStorage.setItem('sipandu_ppks', JSON.stringify(stripPhotoPayloadsFromLocalCache(nextRecords))); } catch { /* cache is optional */ }
        } else {
          console.warn('Cached PPKS data is not an array; starting with the default roster.');
        }
      }
    } catch (error) {
      console.warn('SIPANDU could not read its local PPKS cache:', error);
    }
    try {
      const userUid = auth.currentUser?.uid || 'anonymous';
      const profileCacheKey = `sipandu_profile_${userUid}`;
      let raw = localStorage.getItem(profileCacheKey);
      // Preserve a one-time migration path for the existing owner/supervisor
      // profile. Pendamping accounts never inherit another user's browser cache.
      if (!raw && (currentUserRole === 'owner' || currentUserRole === 'supervisor')) {
        raw = localStorage.getItem('sipandu_profile');
      }
      if (raw) {
        const parsed = stripPhotoPayloadsFromLocalCache(JSON.parse(raw));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          nextProfile = parsed as ProfileUser;
          // Remove any legacy inline profile image from existing local storage.
          try { localStorage.setItem(profileCacheKey, JSON.stringify(stripPhotoPayloadsFromLocalCache(nextProfile))); } catch { /* cache is optional */ }
        }
      }
    } catch (error) {
      console.warn('SIPANDU could not read its local profile cache:', error);
    }
    try {
      const raw = localStorage.getItem('sipandu_settings');
      if (raw) {
        nextSettings = normalizeAppSettings(stripPhotoPayloadsFromLocalCache(JSON.parse(raw)) as Partial<AppSettings>);
        // Settings are text/configuration only; sanitize older cached values before retaining them.
        try { localStorage.setItem('sipandu_settings', JSON.stringify(stripPhotoPayloadsFromLocalCache(nextSettings))); } catch { /* cache is optional */ }
      }
    } catch (error) {
      console.warn('SIPANDU could not read its local settings cache:', error);
    }
    setPpksList(nextRecords);
    if (currentUserRole === 'owner') {
      nextProfile = { ...nextProfile, noHp: SIPANDU_OWNER_WHATSAPP_PHONE };
    }
    setProfile(nextProfile);
    setSettings(nextSettings);
    setLocalCacheReady(true);
  }, [authReady, isAuthenticated, currentUserRole]);

  // Pull the signed-in member's cloud profile. New members already have this
  // document from registration; existing members are migrated from their local
  // profile once so their current identity is not lost.
  useEffect(() => {
    const user = auth.currentUser;
    if (!isAuthenticated || !localCacheReady || !user) return;
    let active = true;
    void getSIPANDUUserProfile(user.uid).then(async (cloudProfile) => {
      if (!active) return;
      if (cloudProfile) {
        const resolvedProfile = currentUserRole === 'owner'
          ? { ...cloudProfile, noHp: SIPANDU_OWNER_WHATSAPP_PHONE }
          : cloudProfile;
        setProfile(resolvedProfile);
        if (currentUserRole === 'owner' && cloudProfile.noHp !== SIPANDU_OWNER_WHATSAPP_PHONE) {
          try {
            await saveSIPANDUUserProfile(user.uid, resolvedProfile);
          } catch (error) {
            console.warn('Nomor WhatsApp owner SIPANDU belum dapat diperbarui di Firestore:', error);
          }
        }
        return;
      }
      if (currentUserRole === 'owner' || currentUserRole === 'supervisor') {
        try {
          const raw = localStorage.getItem(`sipandu_profile_${user.uid}`)
            || localStorage.getItem('sipandu_profile');
          const cachedProfile = raw ? stripPhotoPayloadsFromLocalCache(JSON.parse(raw)) as ProfileUser : null;
          const localProfile = cachedProfile
            ? (currentUserRole === 'owner'
                ? { ...cachedProfile, noHp: SIPANDU_OWNER_WHATSAPP_PHONE }
                : cachedProfile)
            : null;
          if (localProfile) setProfile(localProfile);
          if (localProfile?.nama?.trim() && localProfile?.nip?.trim() && user.email) {
            await saveSIPANDUUserProfile(user.uid, localProfile);
          }
        } catch (error) {
          console.warn('Profil SIPANDU belum dapat dimigrasikan ke Firestore:', error);
        }
      } else {
        // Do not copy another account's browser-local profile into this UID.
        setProfile(initialProfileUser);
      }
    }).catch((error) => {
      console.warn('Profil anggota SIPANDU belum dapat dibaca dari Firestore:', error);
    });
    return () => { active = false; };
  }, [isAuthenticated, localCacheReady, currentUserRole]);

  // Debounce large JSON serialization/writes to reduce synchronous main-thread work.
  // This is a convenience cache and is not a replacement for authenticated server storage.
  useEffect(() => {
    if (!isAuthenticated || !localCacheReady) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('sipandu_ppks', JSON.stringify(stripPhotoPayloadsFromLocalCache(ppksList)));
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
      try {
        const uid = auth.currentUser?.uid || 'anonymous';
        localStorage.setItem(`sipandu_profile_${uid}`, JSON.stringify(stripPhotoPayloadsFromLocalCache(profile)));
      } catch (error) { console.error('SIPANDU profile cache could not be persisted:', error); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [profile, localCacheReady, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !localCacheReady) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem('sipandu_settings', JSON.stringify(stripPhotoPayloadsFromLocalCache(settings))); }
      catch (error) { console.warn('SIPANDU settings cache could not be persisted:', error); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [settings, localCacheReady, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserUid) {
      setRespondentNotifications([]);
      return;
    }
    const uid = currentUserUid;
    setRespondentNotifications(loadRespondentNotifications(uid));
    const onNotificationHistoryUpdated = (event: Event) => {
      const eventUid = (event as CustomEvent<{ uid?: string }>).detail?.uid || '';
      if (eventUid === uid) setRespondentNotifications(loadRespondentNotifications(uid));
    };
    window.addEventListener('sipandu-respondent-notifications-updated', onNotificationHistoryUpdated);
    return () => window.removeEventListener('sipandu-respondent-notifications-updated', onNotificationHistoryUpdated);
  }, [isAuthenticated, currentUserUid]);

  useEffect(() => {
    const unreadCount = respondentNotifications.filter((item) => !item.read).length;
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unreadCount > 0) void badgeNavigator.setAppBadge?.(unreadCount).catch(() => undefined);
    else void badgeNavigator.clearAppBadge?.().catch(() => undefined);
  }, [respondentNotifications]);

  const replaceFirestoreRosterFromSheet = async (
    spreadsheetId: string,
    records: PPKSRecord[],
    authoritativeProfileRecords: PPKSRecord[] = records,
  ): Promise<string> => {
    try {
      // The Firestore function performs a read/compare/write diff. Calling it
      // after each successful import keeps the same spreadsheet ID synchronized
      // when rows change and repairs any stale cloud edits without rewriting
      // unchanged documents on every five-minute poll.
      const result = await replacePPKSCollectionFromSpreadsheet(records, authoritativeProfileRecords);
      return `Koleksi Firestore ppks diselaraskan dengan spreadsheet “${spreadsheetId}”: ${result.created} dibuat, ${result.updated} diperbarui, ${result.deleted} dokumen lama dihapus. Koleksi stageOneIntake tidak disentuh.`;
    } catch (error) {
      console.error('SIPANDU could not replace the legacy Firestore PPKS roster:', error);
      return `Penyelarasan Firestore belum berhasil: ${error instanceof Error ? error.message : String(error)}. Data tabel tetap memakai spreadsheet sebagai sumber utama.`;
    }
  };

  // Auth Handlers
  const handleLogin = (user: string) => {
    // Firebase's auth-state observer updates the authenticated UI after sign-in.
    setCurrentUserName(user);
  };

  const handleLogout = async () => {
    if (!window.confirm('Apakah Anda yakin ingin keluar dari aplikasi SIPANDU ODHIV?')) return;
    const failures: string[] = [];
    const sessionUid = auth.currentUser?.uid || '';
    if (sessionUid) {
      try { await clearFollowUpLocalNotifications(sessionUid); }
      catch (error) { console.warn('SIPANDU could not clear local follow-up reminders during logout:', error); }
    }
    try {
      await signOut(auth);
    } catch (error) {
      failures.push('Sesi aplikasi: ' + (error instanceof Error ? error.message : String(error)));
    }
    try {
      await googleLogout();
    } catch (error) {
      failures.push('Sesi Google Workspace: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      // Remove respondent/profile caches, tokens, notification history, boot retry
      // markers, and all service-worker caches even when one sign-out call fails.
      await clearSipanduBrowserCaches();
      setIsAuthenticated(false);
      setCurrentUserName('');
      setCurrentUserRole('');
      setCurrentUserUid('');
      setPpksList([]);
      setServiceStatuses([]);
      setServiceStatusLoading(true);
      setServiceStatusError('');
      setProfile(initialProfileUser);
      setSettings(initialAppSettings);
      setRespondentNotifications([]);
      setAuthError(failures.length
        ? 'Data cache lokal sudah dibersihkan, tetapi ada sesi yang perlu diperiksa: ' + failures.join(' · ')
        : '');
    }
  };

  const handleRestoreTeamInvitation = async () => {
    const user = auth.currentUser;
    if (!user) {
      setAuthError('Sesi akun sudah tidak ditemukan. Masuk kembali dengan akun yang sama.');
      return;
    }
    setAuthReady(false);
    setAuthError('');
    try {
      await user.reload();
      if (!user.emailVerified) throw new Error('Email belum diverifikasi. Selesaikan verifikasi email sebelum memulihkan undangan.');
      await restorePendingTeamInvitation(user);
      await activatePendingTeamMember(user);
      const token = await getIdTokenResult(user, true);
      const role = token.claims.role;
      if (role !== 'pendamping') throw new Error('Peran pendamping belum muncul pada token Firebase terbaru. Coba verifikasi akses lagi.');
      setCurrentUserRole(role);
      setCurrentUserName(user.displayName || user.email || '');
      setIsAuthenticated(true);
      setLocalCacheReady(false);
    } catch (error) {
      setIsAuthenticated(false);
      setAuthError(describeTeamActivationError(error));
    } finally {
      setAuthReady(true);
    }
  };

  const handleRetryStaffAccess = async () => {
    const user = auth.currentUser;
    if (!user) {
      setAuthError('Sesi akun sudah tidak ditemukan. Silakan masuk kembali dengan akun SIPANDU.');
      setAuthReady(true);
      return;
    }
    setAuthReady(false);
    setAuthError('');
    try {
      // A link may have been opened outside SIPANDU; reload the Firebase user
      // before checking emailVerified or evaluating trusted role claims.
      await user.reload();
      let token = await getIdTokenResult(user, true);
      let role = token.claims.role;
      if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping' && !user.emailVerified) {
        setIsAuthenticated(false);
        setAuthError('Email akun belum diverifikasi. Verifikasi email terlebih dahulu, lalu coba lagi.');
        return;
      }
      if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
        await activatePendingTeamMember(user);
        token = await getIdTokenResult(user, true);
        role = token.claims.role;
      }
      if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
        setIsAuthenticated(false);
        setAuthError('Layanan aktivasi mengembalikan respons, tetapi klaim peran belum muncul pada token terbaru. Tunggu beberapa saat, lalu coba verifikasi lagi. Bila tetap terjadi, administrator perlu memeriksa custom claim akun Firebase.');
        return;
      }
      setCurrentUserRole(role);
      setCurrentUserName(user.displayName || user.email || '');
      setIsAuthenticated(true);
      setLocalCacheReady(false);
    } catch (error) {
      setIsAuthenticated(false);
      setAuthError(describeTeamActivationError(error));
    } finally {
      setAuthReady(true);
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

  // The standalone integrated assessment is persisted directly to its dedicated
  // Firestore field. It does not depend on Google Sheets/Workspace write access.
  const handleSaveIntegratedAssessment = async (updated: PPKSRecord): Promise<void> => {
    const answers = updated.formAsesmenTerintegrasi;
    if (!answers) throw new Error('Jawaban asesmen tidak tersedia untuk disimpan.');

    const { role } = await saveIntegratedAssessmentToFirestore(updated.id, answers);
    const notificationUid = auth.currentUser?.uid || 'default';
    await notifyIntegratedAssessmentSaved(notificationUid, updated.id, updated.namaLengkap);
    setRespondentNotifications(loadRespondentNotifications(notificationUid));
    setPpksList((prev) => prev.map((record) => {
      if (record.id !== updated.id) return record;
      return {
        ...record,
        formAsesmenTerintegrasi: answers,
        ...(role === 'pendamping' ? {} : { statusAsesmen: 'Terintegrasi' as const }),
      };
    }));
    setCloudSyncNotice({
      type: 'success',
      text: 'Form Asesmen Terintegrasi tersimpan di Firebase Firestore. Data profil utama tetap mengikuti spreadsheet.',
    });
  };

  // Cetak dari arsip juga menyimpan jawaban terbaru, tetapi tidak menggandakan backup Drive.
  const handleArchiveAssessmentBeforePrint = async (updated: PPKSRecord): Promise<void> => {
    const answers = updated.formAsesmenTerintegrasi;
    if (!answers) throw new Error('Jawaban asesmen tidak tersedia untuk diarsipkan.');
    const { role } = await saveIntegratedAssessmentToFirestore(updated.id, answers);
    setPpksList((previous) => previous.map((record) => record.id !== updated.id ? record : {
      ...record,
      formAsesmenTerintegrasi: answers,
      ...(role === 'pendamping' ? {} : { statusAsesmen: 'Terintegrasi' as const }),
    }));
    const notificationUid = auth.currentUser?.uid || 'default';
    await notifyIntegratedAssessmentSaved(notificationUid, updated.id, updated.namaLengkap);
    setRespondentNotifications(loadRespondentNotifications(notificationUid));
    setCloudSyncNotice({
      type: 'success',
      text: 'Dokumen asesmen berhasil disimpan ke database SIPANDU dan siap dicetak.',
    });
  };

  const handleAddNewPPKS = (newPPKS: PPKSRecord) => {
    // Tahap awal disimpan di database intake khusus. Data baru masuk ke sumber
    // PPKS utama setelah responden melanjutkan Google Form utama dan respons tersinkron.
    setStageOneRespondents((previous) => {
      const next = sortPPKSRecordsByTimestamp(deduplicatePPKSRecords([newPPKS, ...previous]));
      stageOneRespondentsRef.current = next;
      return next;
    });
    void saveStageOneIntakeToFirestore(newPPKS).then(() => {
      setStageOneResponseSyncState({
        type: 'success',
        message: `Asesmen tahap awal ${newPPKS.namaLengkap} tersimpan ke Database PPKS Asesmen Tahap Awal.`,
        lastUpdatedAt: new Date().toLocaleString('id-ID'),
      });
    }).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      setStageOneResponseSyncState({ type: 'error', message: `Gagal menyimpan asesmen tahap awal: ${detail}` });
      console.error('SIPANDU staff stage-one intake save failed:', error);
    });
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
   * Read the primary Google Form response spreadsheet and merge only rows whose
   * prefilled PPKS ID points to an existing stage-one intake record. Stage-one
   * records alone must not enter the main PPKS roster before Form utama is submitted.
   */
  const mergeContinuationResponses = async (mainFormRecords: PPKSRecord[]): Promise<{
    records: PPKSRecord[];
    matchedResponses: number;
    warning: string;
  }> => {
    const formUrl = GOOGLE_SIPANDU_RESOURCES.formRespondentUrl;
    if (!formUrl) {
      return {
        records: mainFormRecords,
        matchedResponses: 0,
        warning: 'URL Google Form utama belum tersedia; data tahap awal tetap terpisah.',
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

      const mainFormImport = await importPPKSFromSpreadsheet(spreadsheetUrl);
      const stageOneById = new Map(stageOneRespondentsRef.current.map((record) => [record.id, record]));
      const normalizePersonName = (value: unknown) => String(value ?? '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLocaleLowerCase('id-ID')
        .replace(/[^a-z0-9]/g, '');
      const resolveNIK = (record: PPKSRecord) => {
        const candidate = String(record.nik || record.officialAssessment?.q23 || '').replace(/\\D/g, '');
        return /^\\d{16}$/.test(candidate) ? candidate : '';
      };

      // Prefilled IDs can be edited by respondents, so reject identity conflicts.
      const matched = mainFormImport.records.filter((record) => {
        const stageOne = stageOneById.get(record.id);
        if (!stageOne) return false;
        const sourceNIK = resolveNIK(stageOne);
        const responseNIK = resolveNIK(record);
        if (sourceNIK && responseNIK && sourceNIK !== responseNIK) return false;
        const sourceName = normalizePersonName(stageOne.namaLengkap);
        const responseName = normalizePersonName(record.namaLengkap);
        if (sourceName && responseName && sourceName !== responseName) return false;
        return true;
      });

      const enrichedMatched = matched.map((response) => {
        const stageOne = stageOneById.get(response.id);
        if (!stageOne) return response;
        return mergePPKSRecords([stageOne], [response]).find((record) => record.id === response.id) || response;
      });
      const byId = new Map(enrichedMatched.map((record) => [record.id, record]));
      // Keep the master PPKS roster limited to records present in the primary
      // Form spreadsheet. Do not append stage-one-only respondents prematurely.
      const records = mainFormRecords.map((record) => byId.get(record.id) || record);
      const unmatchedCount = Math.max(0, mainFormImport.records.length - matched.length);
      return {
        records: mergePPKSRecords(records, enrichedMatched),
        matchedResponses: matched.length,
        warning: unmatchedCount > 0
          ? `${unmatchedCount} respons Form utama belum dapat dipadankan ke database Tahap Awal. Periksa kolom “ID PPKS”, nama, dan NIK.`
          : '',
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        records: mainFormRecords,
        matchedResponses: 0,
        warning: `Sinkronisasi respons Google Form utama belum aktif: ${detail}`,
      };
    }
  };

  const processGoogleFormNotifications = async (
    questionnaireRecords: PPKSRecord[],
    assessmentRecords: PPKSRecord[],
  ) => {
    const uid = auth.currentUser?.uid || 'default';
    await processRespondentSubmissionEvents(
      uid,
      questionnaireRecords.map((record) => ({
        id: record.id,
        namaLengkap: record.namaLengkap,
        timestamp: record.timestamp,
      })),
      assessmentRecords as unknown as Array<Record<string, unknown>>,
      { baselineNamespace: 'google-forms-atensi-main' },
    );
    setRespondentNotifications(loadRespondentNotifications(uid));
  };

  const handleSyncGoogleSpreadsheet = async (): Promise<{ records: number; sourceDataRows: number; sourceRowsWithName: number; sampleRecordsFiltered: number; duplicateRowsCollapsed: number; photosRecoveredFromForm: number; photoRecoveryStatus: string; photoRecoveryDetail: string; photoRecoveryDiagnostics: { responseCount: number; responsesWithUploads: number; recordsMatched: number }; photoCounts: { diri: number; ktp: number; kk: number; rumah: number } }> => {
    const sourceUrl = GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl;
    const sourceTab = 'From Responses 1';
    const imported = await importPPKSFromSpreadsheet(sourceUrl, sourceTab);
    if (!imported.records.length) {
      const headers = (imported.previewRows[0] || []).slice(0, 12).join(' | ');
      throw new Error(
        `Spreadsheet “${imported.spreadsheetTitle}”, tab “${imported.selectedTab}” berhasil dibaca (${imported.rowsRead} baris), tetapi tidak ditemukan baris responden yang memiliki kolom nama dikenali. Periksa judul kolom. Header: ${headers || '(kosong)'}`
      );
    }
    const continuation = await mergeContinuationResponses(imported.records);
    await processGoogleFormNotifications(imported.records, continuation.records);
    const recordsForSync = continuation.records;
    setPpksList((localRecords) => preservePPKSRecordOrder(localRecords, reconcileSpreadsheetPPKSRecords(localRecords, recordsForSync, imported.records)));
    setSettings((current) => ({
      ...current,
      googleSpreadsheetSourceUrl: sourceUrl,
      googleSpreadsheetSourceName: imported.spreadsheetTitle,
      googleSpreadsheetSourceTab: imported.selectedTab,
    }));
    const firestoreMessage = await replaceFirestoreRosterFromSheet(imported.spreadsheetId, recordsForSync, imported.records);
    const updatedAt = new Date().toLocaleString('id-ID');
    setLiveSyncState({
      type: 'success',
      message: `Sumber “${imported.spreadsheetTitle}” → “${imported.selectedTab}”: ${imported.sourceDataRows} baris data, ${recordsForSync.length} PPKS unik dimuat, ${imported.duplicateRowsCollapsed} duplikat spreadsheet digabung, ${imported.sampleRecordsFiltered} contoh disaring. Intervensi & rekomendasi mengikuti pemetaan kolom spreadsheet: ${imported.recordsWithInterventionRecommendation}/${imported.records.length} responden terisi. Respons Form lanjutan dipadankan: ${continuation.matchedResponses}. ${continuation.warning ? continuation.warning + ' ' : ''}Foto sumber: diri ${imported.photoCounts.diri}/${imported.records.length}, KTP ${imported.photoCounts.ktp}/${imported.records.length}, KK ${imported.photoCounts.kk}/${imported.records.length}, rumah ${imported.photoCounts.rumah}/${imported.records.length}; tautan dipulihkan dari Forms: ${imported.photosRecoveredFromForm}; status pemulihan: ${imported.photoRecoveryStatus} — ${imported.photoRecoveryDetail}. ${firestoreMessage} NIK terpetakan ${imported.recordsWithNIK}/${imported.records.length}. Sinkronisasi otomatis setiap 5 menit saat dashboard terbuka dan izin Google masih berlaku.`,
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

  // Service Center uses a separate Firestore collection; the spreadsheet remains
  // authoritative for PPKS identity and demographic data.
  useEffect(() => {
    if (!authReady || !isAuthenticated || !localCacheReady) {
      setServiceStatuses([]);
      setServiceStatusLoading(false);
      setServiceStatusError('');
      return;
    }
    let active = true;
    setServiceStatusLoading(true);
    setServiceStatusError('');
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeToPPKSServiceStatus(ppksList.map((record) => record.id), currentUserRole, currentUserUid, (statuses) => {
        if (!active) return;
        setServiceStatuses(statuses);
        setServiceStatusLoading(false);
        setServiceStatusError('');
      }, (error) => {
        if (!active) return;
        setServiceStatusLoading(false);
        setServiceStatusError(error.message);
      });
    } catch (error) {
      setServiceStatusLoading(false);
      setServiceStatusError(error instanceof Error ? error.message : String(error));
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authReady, isAuthenticated, localCacheReady, ppksList, currentUserRole, currentUserUid]);

  // Schedule generic Android reminders only after the service feed has loaded.
  // The user grants permission explicitly from Settings; notification text contains no PPKS identity.
  useEffect(() => {
    if (!authReady || !isAuthenticated || !localCacheReady || serviceStatusLoading || serviceStatusError) return;
    if (!['owner', 'supervisor', 'pendamping'].includes(currentUserRole) || !currentUserUid) return;
    void syncFollowUpLocalNotifications(currentUserUid, serviceStatuses, currentUserRole)
      .catch((error) => console.warn('SIPANDU could not synchronize local follow-up reminders:', error));
  }, [authReady, isAuthenticated, localCacheReady, serviceStatusLoading, serviceStatusError, currentUserRole, currentUserUid, serviceStatuses, isSettingsOpen]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !localCacheReady || !['owner', 'supervisor', 'pendamping'].includes(currentUserRole)) {
      setFieldVisits([]);
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToFieldVisits(currentUserRole, currentUserUid, (visits) => {
        if (active) { setFieldVisits(visits); setFieldVisitError(''); }
      }, (error) => { if (active) setFieldVisitError(error.message); });
    } catch (error) {
      setFieldVisitError(error instanceof Error ? error.message : String(error));
    }
    return () => { active = false; unsubscribe?.(); };
  }, [authReady, isAuthenticated, localCacheReady, currentUserRole, currentUserUid]);

  // Load the security audit only when an authorized manager opens its menu.
  useEffect(() => {
    if (activeTab !== 'security-audit') return;
    if (!authReady || !isAuthenticated || !['owner', 'supervisor'].includes(currentUserRole)) {
      setSecurityAuditEntries([]);
      setSecurityAuditError('Akses Pusat Audit tidak tersedia untuk akun ini.');
      setSecurityAuditLoading(false);
      return;
    }
    let active = true;
    setSecurityAuditLoading(true);
    setSecurityAuditError('');
    void fetchSecurityAuditActivity()
      .then((entries) => {
        if (active) setSecurityAuditEntries(entries);
      })
      .catch((error) => {
        if (active) setSecurityAuditError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setSecurityAuditLoading(false);
      });
    return () => { active = false; };
  }, [activeTab, authReady, isAuthenticated, currentUserRole]);

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
            const cloudById = new Map(cloudRecords.map((record) => [record.id, record]));
            const mergedLocalRecords = currentRecords.map((current) => {
              const cloud = cloudById.get(current.id);
              if (!cloud) return current;
              const manualPhotoOverrides = {
                ...(current.manualPhotoOverrides || {}),
                ...(cloud.manualPhotoOverrides || {}),
              };
              const mergeNonEmpty = <T extends object>(previous: T | undefined, incoming: T | undefined): T | undefined => {
                const merged = {
                  ...(previous || {}),
                  ...Object.fromEntries(Object.entries(incoming || {}).filter(([, value]) =>
                    value !== '' && value !== undefined && value !== null
                  )),
                };
                return Object.keys(merged).length ? merged as T : undefined;
              };
              return {
                ...current,
                // Only explicitly uploaded photo overrides may fill blank source cells.
                // Legacy Firestore profile fields never replace the spreadsheet values.
                manualPhotoOverrides,
                fotoDiri: normalizePPKSPhotoSource(manualPhotoOverrides.fotoDiri) || normalizePPKSPhotoSource(current.fotoDiri) || '',
                fotoKtp: normalizePPKSPhotoSource(manualPhotoOverrides.fotoKtp) || normalizePPKSPhotoSource(current.fotoKtp) || '',
                fotoKk: normalizePPKSPhotoSource(manualPhotoOverrides.fotoKk) || normalizePPKSPhotoSource(current.fotoKk) || '',
                fotoRumah: normalizePPKSPhotoSource(manualPhotoOverrides.fotoRumah) || normalizePPKSPhotoSource(current.fotoRumah) || '',
                integratedForm: mergeNonEmpty(current.integratedForm, cloud.integratedForm),
                officialAssessment: mergeNonEmpty(current.officialAssessment, cloud.officialAssessment),
                formAsesmenTerintegrasi: mergeNonEmpty(current.formAsesmenTerintegrasi, cloud.formAsesmenTerintegrasi),
                statusAsesmen: current.statusAsesmen === 'Tahap Awal' && cloud.statusAsesmen !== 'Tahap Awal'
                  ? cloud.statusAsesmen
                  : current.statusAsesmen,
              };
            });
            // Browser and Android have separate local caches. Include only cloud-only
            // records with a completed independent assessment so the Dokumen archive
            // is identical on each device without resurrecting the entire stale roster.
            return [
              ...mergedLocalRecords,
              ...getCloudOnlyCompletedAssessments(currentRecords, cloudRecords),
            ];
          });
          setFirestoreRealtimeState({
            type: info.fromCache ? 'paused' : 'connected',
            message: info.fromCache
              ? `Data realtime memakai cache lokal sementara; perubahan cloud diterapkan ketika server tersambung (${cloudRecords.length} dokumen terbaca).`
              : `Realtime Firestore aktif — hanya data asesmen tambahan dan unggahan foto SIPANDU yang dipertahankan (${cloudRecords.length} dokumen terbaca); profil utama tetap mengikuti spreadsheet.`,
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

  // Canonical answer-only records are independent from the roster. This feed
  // keeps a pendamping's saved answers visible even if the owner has not yet
  // materialized the matching spreadsheet respondent in /ppks.
  useEffect(() => {
    if (!authReady || !isAuthenticated || !localCacheReady) {
      setIntegratedAssessmentAnswers({});
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
      if (error) console.warn('SIPANDU integrated assessment answer listener disconnected:', error);
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
        unsubscribe = subscribeToIntegratedAssessmentAnswers((answersById) => {
          if (!active) return;
          retryCount = 0;
          setIntegratedAssessmentAnswers(answersById);
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
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      clearRetry();
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

  // Overlay only answer maps onto existing spreadsheet roster rows. Do not
  // synthesize profile-less PPKS records when an assessment exists without /ppks.
  useEffect(() => {
    if (!isAuthenticated) return;
    setPpksList((current) => mergeIntegratedAssessmentAnswers(current, integratedAssessmentAnswers));
  }, [integratedAssessmentAnswers, isAuthenticated, ppksList]);

  // Asesmen Tahap Awal berasal dari koleksi intake native SIPANDU, bukan Google Form.
  useEffect(() => {
    if (!authReady || !localCacheReady) return;
    if (!isAuthenticated) {
      stageOneRespondentsRef.current = [];
      setStageOneRespondents([]);
      setStageOneResponseSyncState({
        type: 'idle',
        message: 'Database Asesmen Tahap Awal tersedia setelah petugas SIPANDU masuk.',
      });
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;
    let retryTimer: number | undefined;
    const connect = () => {
      if (!active || unsubscribe || !isAuthenticated) return;
      try {
        unsubscribe = subscribeToStageOneIntake((records) => {
          if (!active) return;
          stageOneRespondentsRef.current = records;
          setStageOneRespondents(records);
          setStageOneResponseSyncState({
            type: 'success',
            message: `Database Firestore Asesmen Tahap Awal aktif: ${records.length} responden. Diperbarui ${new Date().toLocaleString('id-ID')}.`,
            lastUpdatedAt: new Date().toLocaleString('id-ID'),
          });
          const notificationUid = auth.currentUser?.uid || 'default';
          const publicSubmissions = filterStageOneNotificationSubmissions(
            records as Array<PPKSRecord & { source?: string }>,
          );
          void processRespondentSubmissionEvents(
            notificationUid,
            publicSubmissions.map(({ id, namaLengkap, timestamp }) => ({ id, namaLengkap, timestamp })),
            publicSubmissions as unknown as Array<Record<string, unknown>>,
            { baselineNamespace: 'native-sipandu-stage-one', notifyNewQuestionnairesOnFirstImport: true },
          ).then(() => {
            if (active) setRespondentNotifications(loadRespondentNotifications(notificationUid));
          }).catch((error) => console.warn('Stage-one respondent notifications could not be updated:', error));
        }, (error) => {
          if (!active) return;
          unsubscribe = null;
          setStageOneResponseSyncState({
            type: 'error',
            message: `Database Asesmen Tahap Awal belum dapat dibaca: ${error.message} Periksa apakah aturan firestore.rules terbaru sudah diterapkan ke Firebase.`,
          });
          if (retryTimer !== undefined) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(connect, 5000);
        });
      } catch (error) {
        setStageOneResponseSyncState({
          type: 'error',
          message: `Database Asesmen Tahap Awal belum dapat dihubungkan: ${error instanceof Error ? error.message : String(error)}`,
        });
        retryTimer = window.setTimeout(connect, 5000);
      }
    };
    const wake = () => {
      if (!active || unsubscribe || !isAuthenticated) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      retryTimer = undefined;
      connect();
    };
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    connect();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [authReady, isAuthenticated, localCacheReady]);

  // Continuously poll Google Forms' linked response Sheet while the app is signed in.
  // Firestore provides instant cross-device updates; Google Sheets does not expose a
  // browser push subscription, so this side uses a quota-conscious retrying poll loop.
  useEffect(() => {
    if (!authReady || !localCacheReady) return;

    const sourceUrl = GOOGLE_SIPANDU_RESOURCES.responseSpreadsheetUrl;
    const sourceTab = 'From Responses 1';
    if (!isAuthenticated) {
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
        await processGoogleFormNotifications(imported.records, continuation.records);
        const recordsForSync = continuation.records;
        setPpksList((current) => reconcileSpreadsheetPPKSRecords(current, recordsForSync, imported.records));
        const firestoreMessage = await replaceFirestoreRosterFromSheet(imported.spreadsheetId, recordsForSync, imported.records);
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
          message: `LIVE SYNC aktif berulang — “${imported.spreadsheetTitle}” → “${imported.selectedTab}”: ${recordsForSync.length} PPKS unik dimuat dari ${imported.sourceDataRows} baris sumber (${imported.sourceRowsWithName} bernama, ${imported.rowsWithoutRecognizedName} tanpa nama dikenali); ${imported.duplicateRowsCollapsed} duplikat digabung; ${imported.sampleRecordsFiltered} ID demo disaring; intervensi & rekomendasi terpetakan dari kolom spreadsheet yang ditetapkan: ${imported.recordsWithInterventionRecommendation}/${imported.records.length} responden; respons Google Form lanjutan yang dipadankan: ${continuation.matchedResponses}. ${continuation.warning ? continuation.warning + ' ' : ''}Foto diri ${imported.photoCounts.diri}/${imported.records.length}, KTP ${imported.photoCounts.ktp}/${imported.records.length}, KK ${imported.photoCounts.kk}/${imported.records.length}, rumah ${imported.photoCounts.rumah}/${imported.records.length}; tautan Forms dipulihkan: ${imported.photosRecoveredFromForm} (${imported.photoRecoveryStatus}); diagnosis: ${imported.photoRecoveryDetail}. ${firestoreMessage}`,
          lastUpdatedAt: new Date().toLocaleString('id-ID'),
        });
      } catch (error) {
        if (!active) return;
        failedAttempts += 1;
        nextDelay = getLiveSyncRetryDelay(failedAttempts);
        const detail = error instanceof Error ? error.message : String(error);
        if (
          isWorkspaceAccountConnected() &&
          /401|invalid_grant|token.{0,30}(expired|invalid)|unauthori[sz]ed/i.test(detail)
        ) {
          invalidateAccessToken();
        }
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

  // A signed-in account that cannot currently refresh its role claim stays signed in.
  // Offer a retry and an explicit manual exit instead of silently signing it out.
  if (!isAuthenticated && auth.currentUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a140b] px-4 py-8 text-white">
        <section className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-[#112214] p-5 shadow-2xl">
          <h1 className="text-lg font-extrabold text-amber-100">Sesi SIPANDU masih tersimpan</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-200">{authError || 'Akses akun sedang diperiksa.'}</p>
          {/undangan pendaftaran tim tidak ditemukan atau telah kedaluwarsa/i.test(authError) && (
            <div className="mt-4 rounded-xl border border-amber-300/30 bg-black/20 p-3">
              <p className="text-xs leading-relaxed text-amber-50">
                Pulihkan undangan untuk akun yang sedang tersimpan{auth.currentUser?.email ? ` (${auth.currentUser.email})` : ''}. Proses ini memakai UID Firebase yang sama dan tidak membuat akun baru. Pemulihan ini hanya memberikan peran anggota pendamping; akun owner/supervisor harus dipulihkan melalui administrasi Firebase.
              </p>
              <button
                type="button"
                onClick={() => void handleRestoreTeamInvitation()}
                className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black hover:bg-amber-400"
              >
                Pulihkan undangan akun yang sama
              </button>
            </div>
          )}
          <button type="button" onClick={() => void handleRetryStaffAccess()} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500">
            Coba verifikasi akses lagi
          </button>
          <button type="button" onClick={() => void handleLogout()} className="mt-2 w-full rounded-xl border border-rose-400/30 px-4 py-3 text-xs font-semibold text-rose-200 hover:bg-rose-950/40">
            Keluar dari akun SIPANDU
          </button>
        </section>
      </main>
    );
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
  const isImmersiveDashboard = [
    'database-ppks',
    'asesmen',
    'from-asesmen-terintegrasi',
    'dokumen',
    'layanan-ppks',
    'pendampingan-lapangan',
    'security-audit',
  ].includes(activeTab);

  return (
    <div data-sipandu-theme={settings.theme === 'light' ? 'light' : 'dark'} className={`sipandu-navigation-shell min-h-screen w-full bg-[#0a140b] text-white flex flex-col justify-between selection:bg-emerald-600 selection:text-white overflow-x-hidden relative ${isImmersiveDashboard ? 'h-[100dvh] min-h-[100dvh] overflow-hidden' : ''}`}>
      {/* Background ambient lighting: deep moss green with subtle black vignetting and crimson outline aura */}
      <div className="fixed inset-0 bg-radial-[at_top_right] from-[#17301b]/80 via-[#0a140b] to-[#040905] pointer-events-none" />
      <div className="fixed -top-40 -left-40 w-96 h-96 rounded-full bg-rose-600/10 blur-3xl pointer-events-none" />
      <div className="fixed top-1/2 -right-40 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

      {/* Top Header: Selamat (waktu live), Profil Owner di pojok kiri atas, 3 Icon di pojok kanan atas */}
      <div className="relative z-20 app-header">
        <Header
          currentUser={currentUserName}
          activeTab={activeTab}
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
      <main className={isImmersiveDashboard
        ? 'relative z-10 flex-1 min-h-0 w-full max-w-none mx-0 overflow-y-auto overscroll-y-contain px-3 pt-3 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:px-6 md:pt-5'
        : 'relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pb-28'}>
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
              serviceStatuses={serviceStatuses}
              serviceStatusLoading={serviceStatusLoading}
              serviceStatusError={serviceStatusError}
              onOpenServices={() => navigateToTab('layanan-ppks')}
            />
          )}

          {activeTab === 'layanan-ppks' && (
            <ServiceCenterView
              ppksList={ppksList}
              serviceStatuses={serviceStatuses}
              serviceStatusLoading={serviceStatusLoading}
              serviceStatusError={serviceStatusError}
              currentUserUid={currentUserUid}
              onSaveUpdate={async (input) => {
                await savePPKSServiceUpdate(input);
                setCloudSyncNotice({
                  type: 'success',
                  text: 'Status layanan tersimpan di Firestore dan riwayat aktivitas telah ditambahkan.',
                });
              }}
            />
          )}

          {activeTab === 'pendampingan-lapangan' && (
            <FieldAssistanceView
              ppksList={ppksList}
              visits={fieldVisits}
              currentUserUid={currentUserUid}
              currentUserRole={currentUserRole}
              error={fieldVisitError}
              onCreateVisit={createFieldVisit}
            />
          )}

          {activeTab === 'intelijen-wilayah' && <RegionalIntelligenceView ppksList={ppksList} />}
          {activeTab === 'security-audit' && <SecurityAuditView entries={securityAuditEntries} loading={securityAuditLoading} error={securityAuditError} currentUserRole={currentUserRole} />}
          {activeTab === 'laporan-kinerja' && <ProgramPerformanceView ppksList={ppksList} serviceStatuses={serviceStatuses} visits={fieldVisits} />}

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
              onSaveAssessment={handleSaveIntegratedAssessment}
              initialSelectedPPKSId={selectedDocumentAssessmentId}
              onBeforePrint={handleArchiveAssessmentBeforePrint}
            />
          )}

          {activeTab === 'dokumen' && (
            <DokumenView
              ppksList={ppksList}
              onOpenAssessment={(ppksId) => {
                setSelectedDocumentAssessmentId(ppksId);
                navigateToTab('from-asesmen-terintegrasi');
              }}
            />
          )}
        </Suspense>
      </main>

      {/* Bottom Navigation Bar: BERANDA - DATABASE PPKS - ASESMEN - FROM ASESMEN TERINTEGRASI - DOKUMEN */}
      {isAuthenticated && isAICopilotAvailable && ["owner", "supervisor", "pendamping"].includes(currentUserRole) && (
        <button
          type="button"
          onClick={() => setIsAICopilotOpen(true)}
          aria-label="Buka SIPANDU AI Copilot"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-500 px-4 py-3 text-xs font-extrabold text-[#052216] shadow-[0_8px_28px_rgba(16,185,129,0.28)] transition hover:-translate-y-0.5 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-2 focus:ring-offset-[#0a140b]"
        >
          <span aria-hidden="true" className="text-base">✦</span> SIPANDU AI
        </button>
      )}
      <Suspense fallback={null}>
        {isAICopilotOpen && <SIPANDUAICopilot onClose={() => setIsAICopilotOpen(false)} />}
      </Suspense>

      <BottomNav activeTab={activeTab} onSelectTab={navigateToTab} currentUserRole={currentUserRole} />

      {/* Load rarely used modal code only after the user opens that modal. */}
      <Suspense fallback={null}>
        {isEditProfileOpen && (
          <EditProfileModal
            isOpen={true}
            onClose={() => setIsEditProfileOpen(false)}
            profile={profile}
            onSave={async (updated) => {
              const uid = auth.currentUser?.uid;
              if (!uid) throw new Error('Sesi SIPANDU berakhir. Masuk kembali sebelum menyimpan profil.');
              try {
                await saveSIPANDUUserProfile(uid, updated);
                setProfile(updated);
                setCloudSyncNotice({ type: 'success', text: 'Profil berhasil disimpan ke akun cloud SIPANDU.' });
              } catch (error) {
                console.error('Profil SIPANDU gagal disimpan ke Firestore:', error);
                setCloudSyncNotice({ type: 'error', text: 'Perubahan profil belum tersimpan ke akun cloud. Periksa koneksi lalu coba simpan kembali.' });
                throw error;
              }
            }}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            isOpen={true}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onSave={(updated) => {
              setSettings(updated);
              try { localStorage.setItem('sipandu_settings', JSON.stringify(stripPhotoPayloadsFromLocalCache(updated))); }
              catch (error) { console.warn('SIPANDU settings could not be saved immediately:', error); }
            }}
          />
        )}

        {isNotificationsOpen && (
          <NotificationsModal
            isOpen={true}
            onClose={() => setIsNotificationsOpen(false)}
            notifications={respondentNotifications}
            onMarkAllRead={() => setRespondentNotifications(currentUserUid ? markRespondentNotificationsRead(currentUserUid) : [])}
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
            onUpdateSettings={(updated) => {
              setSettings(updated);
              try { localStorage.setItem('sipandu_settings', JSON.stringify(stripPhotoPayloadsFromLocalCache(updated))); }
              catch (error) { console.warn('SIPANDU Workspace settings could not be saved immediately:', error); }
            }}
            onLoadPPKSFromCloud={handleLoadPPKSFromCloud}
          />
        )}
      </Suspense>
    </div>
  );
}


/** Public respondent flow: the shareable URL bypasses the staff dashboard and login. */
export default function App() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'asesmen-tahap-awal') {
    return <StageOneRespondentPage />;
  }
  return <StaffApp />;
}
