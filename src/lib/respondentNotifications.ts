import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getSafeSystemNotificationContent, workspaceReconnectNotificationId } from './notificationPolicy';

export type RespondentNotificationKind = 'kuisioner' | 'asesmen' | 'terintegrasi' | 'workspace';

export interface RespondentNotification {
  id: string;
  kind: RespondentNotificationKind;
  title: string;
  body: string;
  respondentName: string;
  /** Stable PPKS record ID used to open the correctly prefilled follow-up Form in WhatsApp. */
  respondentId?: string;
  createdAt: string;
  read: boolean;
}

interface NotificationBaseline {
  questionnaireIds: string[];
  assessmentSignatures: Record<string, string>;
}

const HISTORY_LIMIT = 50;
const HISTORY_KEY = 'sipandu_respondent_notifications_v1';
const BASELINE_KEY = 'sipandu_respondent_notification_baseline_v1';
const NATIVE_NOTIFICATION_CHANNEL_ID = 'sipandu-respondent-updates-v2';
let notificationAudioContext: AudioContext | null = null;

async function ensureNativeNotificationChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: NATIVE_NOTIFICATION_CHANNEL_ID,
    name: 'Pemberitahuan SIPANDU',
    description: 'Respons Google Form, asesmen baru, dan koneksi Google Workspace',
    importance: 5,
    sound: 'sipandu_notification.wav',
    vibration: true,
    visibility: 1,
  });
}

function scopedKey(key: string, uid: string): string {
  return `${key}:${uid || 'default'}`;
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* OS notices still work if local storage is full. */ }
}

export function loadRespondentNotifications(uid: string): RespondentNotification[] {
  return safeRead<RespondentNotification[]>(scopedKey(HISTORY_KEY, uid), [])
    .filter((item) => item && (item.kind === 'kuisioner' || item.kind === 'asesmen' || item.kind === 'terintegrasi'))
    .slice(0, HISTORY_LIMIT);
}

function notifyHistoryChanged(uid: string): void {
  window.dispatchEvent(new CustomEvent('sipandu-respondent-notifications-updated', { detail: { uid } }));
}

/** Add an in-app/system event only after the integrated assessment has been saved successfully. */
export async function notifyIntegratedAssessmentSaved(uid: string, respondentId: string, respondentName: string): Promise<RespondentNotification> {
  const now = new Date().toISOString();
  const item: RespondentNotification = {
    id: `terintegrasi:${respondentId}:${fingerprint(now)}`,
    kind: 'terintegrasi',
    title: 'From Asesmen Terintegrasi Berhasil Disimpan',
    body: `Form Asesmen Terintegrasi milik ${respondentName || 'responden'} berhasil disimpan.`,
    respondentName: respondentName || 'Responden',
    respondentId,
    createdAt: now,
    read: false,
  };
  const history = [item, ...loadRespondentNotifications(uid)].slice(0, HISTORY_LIMIT);
  safeWrite(scopedKey(HISTORY_KEY, uid), history);
  notifyHistoryChanged(uid);
  await showSystemNotification(item, uid);
  const badgeNavigator = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void> };
  try { await badgeNavigator.setAppBadge?.(history.filter((entry) => !entry.read).length); } catch { /* optional badges */ }
  return item;
}

export function markRespondentNotificationsRead(uid: string): RespondentNotification[] {
  const updated = loadRespondentNotifications(uid).map((item) => ({ ...item, read: true }));
  safeWrite(scopedKey(HISTORY_KEY, uid), updated);
  const badgeNavigator = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  void badgeNavigator.clearAppBadge?.().catch(() => undefined);
  notifyHistoryChanged(uid);
  return updated;
}

export function getRespondentNotificationPermission(): NotificationPermission | 'unsupported' {
  if (Capacitor.isNativePlatform()) {
    try {
      const saved = window.localStorage.getItem('sipandu_native_notification_permission');
      return saved === 'granted' || saved === 'denied' || saved === 'default' ? saved : 'default';
    } catch {
      return 'default';
    }
  }
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported';
}

/** Re-read the real operating-system/browser permission; do not trust a stale local flag. */
export async function refreshRespondentNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      const mapped: NotificationPermission = status.display === 'granted'
        ? 'granted'
        : status.display === 'denied' ? 'denied' : 'default';
      try { window.localStorage.setItem('sipandu_native_notification_permission', mapped); } catch { /* OS permission remains authoritative. */ }
      if (mapped === 'granted') {
        try { await ensureNativeNotificationChannel(); }
        catch (error) { console.warn('SIPANDU could not verify its Android notification channel:', error); }
      }
      return mapped;
    } catch (error) {
      console.warn('SIPANDU could not check native notification permission:', error);
      return 'unsupported';
    }
  }
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported';
}

export async function enableRespondentNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (Capacitor.isNativePlatform()) {
    try {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
      const mapped: NotificationPermission = permission.display === 'granted'
        ? 'granted'
        : permission.display === 'denied' ? 'denied' : 'default';
      try { window.localStorage.setItem('sipandu_native_notification_permission', mapped); } catch { /* Native permission result remains authoritative. */ }
      if (mapped !== 'granted') return mapped;
      await ensureNativeNotificationChannel();
      return 'granted';
    } catch (error) {
      console.warn('SIPANDU native notification permission setup failed:', error);
      return 'denied';
    }
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return Notification.permission;

  try {
    const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL });
    await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('SIPANDU notification service worker registration failed:', error);
  }

  // Warm up a short local audio cue from this explicit user gesture. System
  // notification sounds remain governed by Android/browser notification settings.
  try {
    const AudioContextConstructor = window.AudioContext;
    if (AudioContextConstructor) {
      notificationAudioContext ??= new AudioContextConstructor();
      await notificationAudioContext.resume();
    }
  } catch {
    // Browser autoplay policies can block in-page audio; system notices remain available.
  }
  return Notification.permission;
}

function playForegroundAlert(): void {
  if (document.visibilityState !== 'visible' || !notificationAudioContext) return;
  try {
    if (notificationAudioContext.state === 'suspended') void notificationAudioContext.resume();
    const oscillator = notificationAudioContext.createOscillator();
    const gain = notificationAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, notificationAudioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, notificationAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, notificationAudioContext.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, notificationAudioContext.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(notificationAudioContext.destination);
    oscillator.start();
    oscillator.stop(notificationAudioContext.currentTime + 0.34);
  } catch {
    // Never let an optional sound interrupt importing or saving respondent data.
  }
}

async function showSystemNotification(item: RespondentNotification, uid: string): Promise<void> {
  // Re-check OS/browser permission without opening an in-app permission prompt.
  if (await refreshRespondentNotificationPermission() !== 'granted') return;
  const systemContent = getSafeSystemNotificationContent(item.kind);

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: Number.parseInt(fingerprint(item.id), 16) % 2147483647,
          title: systemContent.title,
          body: systemContent.body,
          schedule: { at: new Date(Date.now() + 250) },
          ...(Capacitor.getPlatform() === 'ios' ? { sound: 'default' } : {}),
          ...(Capacitor.getPlatform() === 'android' ? { channelId: NATIVE_NOTIFICATION_CHANNEL_ID } : {}),
          smallIcon: 'ic_stat_sipandu',
          largeIcon: 'ic_launcher',
          ongoing: false,
          autoCancel: true,
          extra: { notificationId: item.id, uid, kind: item.kind },
        }],
      });
    } catch (error) {
      console.warn('SIPANDU native notification could not be scheduled:', error);
    }
    return;
  }

  const basePath = import.meta.env.BASE_URL || './';
  const options: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
  } = {
    body: systemContent.body,
    icon: `${basePath}uploads/App%20Icon%20Picture.png`,
    badge: `${basePath}uploads/App%20Icon%20Picture.png`,
    tag: item.id,
    renotify: true,
    requireInteraction: true,
    data: { url: basePath, notificationId: item.id, uid },
    vibrate: [250, 120, 250, 120, 450],
  };

  try {
    const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL });
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(systemContent.title, options);
    if (document.visibilityState === 'visible') playForegroundAlert();
    try { navigator.vibrate?.([250, 120, 250, 120, 450]); } catch { /* optional device feature */ }
  } catch (error) {
    console.warn('SIPANDU system notification could not be shown:', error);
  }
}

/** Notify at most once per calendar day while a previously connected Workspace needs reauthorization. */
export async function notifyWorkspaceReconnectRequired(uid: string): Promise<RespondentNotification | null> {
  const id = workspaceReconnectNotificationId(new Date());
  const prior = loadRespondentNotifications(uid);
  if (prior.some((item) => item.id === id)) return null;

  const item: RespondentNotification = {
    id,
    kind: 'workspace',
    title: 'Google Workspace Perlu Disambungkan Ulang',
    body: 'Akses Drive, Sheets, atau Forms belum tersedia. Buka Google Workspace & Cloud Hub → Pulihkan Izin Google API.',
    respondentName: 'Google Workspace',
    createdAt: new Date().toISOString(),
    read: false,
  };
  const nextHistory = [item, ...prior].slice(0, HISTORY_LIMIT);
  safeWrite(scopedKey(HISTORY_KEY, uid), nextHistory);
  notifyHistoryChanged(uid);
  await showSystemNotification(item, uid);
  const badgeNavigator = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void> };
  try { await badgeNavigator.setAppBadge?.(nextHistory.filter((entry) => !entry.read).length); } catch { /* optional badge */ }
  return item;
}

/** Clear the warning state after Google Workspace successfully reconnects. */
export function resolveWorkspaceReconnectNotifications(uid: string): RespondentNotification[] {
  const updated = loadRespondentNotifications(uid).map((item) =>
    item.kind === 'workspace' ? { ...item, read: true } : item
  );
  safeWrite(scopedKey(HISTORY_KEY, uid), updated);
  notifyHistoryChanged(uid);
  const badgeNavigator = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  const unreadCount = updated.filter((item) => !item.read).length;
  if (unreadCount > 0) void badgeNavigator.setAppBadge?.(unreadCount).catch(() => undefined);
  else void badgeNavigator.clearAppBadge?.().catch(() => undefined);
  return updated;
}

function meaningfulAssessmentSignature(record: Record<string, unknown>): string {
  const official = (record.officialAssessment && typeof record.officialAssessment === 'object')
    ? record.officialAssessment as Record<string, unknown>
    : {};
  // These fields form the respondent's identity/contact profile, not an assessment submission.
  const identityOnly = new Set(['q5', 'q15', 'q16', 'q19', 'q23', 'q25']);
  const meaningfulOfficial = Object.entries(official)
    .filter(([key, value]) => !identityOnly.has(key.toLowerCase()) && isFilled(value))
    .sort(([a], [b]) => a.localeCompare(b));
  const integrated = (record.integratedForm && typeof record.integratedForm === 'object')
    ? Object.entries(record.integratedForm as Record<string, unknown>)
      .filter(([, value]) => isFilled(value))
      .sort(([a], [b]) => a.localeCompare(b))
    : [];
  if (meaningfulOfficial.length === 0 && integrated.length === 0) return '';
  return JSON.stringify({ official: meaningfulOfficial, integrated });
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(isFilled);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(isFilled);
  return true;
}

function fingerprint(value: string): string {
  // Stable, non-cryptographic hash; data content itself is not saved to notification storage.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function baselineFor(questionnaireRecords: Array<{ id: string }>, assessmentRecords: Array<Record<string, unknown>>): NotificationBaseline {
  const assessmentSignatures: Record<string, string> = {};
  for (const record of assessmentRecords) {
    const id = String(record.id || '').trim();
    if (!id) continue;
    const signature = meaningfulAssessmentSignature(record);
    if (signature) assessmentSignatures[id] = fingerprint(signature);
  }
  return {
    questionnaireIds: [...new Set(questionnaireRecords.map((record) => String(record.id || '').trim()).filter(Boolean))],
    assessmentSignatures,
  };
}

/**
 * Called only after a successful Google Forms response-sheet import. First sync
 * is a quiet baseline; subsequent deltas emit only respondent questionnaire or
 * assessment events. Staff profile changes, photo uploads, sync status and errors
 * are deliberately not notification events.
 */
export async function processRespondentSubmissionEvents(
  uid: string,
  questionnaireRecords: Array<{ id: string; namaLengkap?: string; timestamp?: string }>,
  assessmentRecords: Array<Record<string, unknown>>,
  options: {
    /** Keep the separate stage-one form's notification baseline independent of the main Form sheet. */
    baselineNamespace?: string;
    /** Safe only when the caller has excluded every pre-cutover/historical response. */
    notifyNewQuestionnairesOnFirstImport?: boolean;
  } = {},
): Promise<RespondentNotification[]> {
  const baselineKey = options.baselineNamespace
    ? `${BASELINE_KEY}:${options.baselineNamespace}`
    : BASELINE_KEY;
  const key = scopedKey(baselineKey, uid);
  const previous = safeRead<NotificationBaseline | null>(key, null);
  const current = baselineFor(questionnaireRecords, assessmentRecords);
  safeWrite(key, current);
  const hasPreviousBaseline = Boolean(previous && Array.isArray(previous.questionnaireIds));

  // Normal imports remain quiet on first load. The dedicated stage-one flow may
  // alert on first import only after its caller applies a fixed historical cutover.
  if (!hasPreviousBaseline && !options.notifyNewQuestionnairesOnFirstImport) return [];

  const knownQuestionnaireIds = new Set(hasPreviousBaseline ? previous!.questionnaireIds : []);
  const currentQuestionnaireIds = new Set(current.questionnaireIds);
  const newlySubmitted = questionnaireRecords.filter((record) => {
    const id = String(record.id || '').trim();
    return id && !knownQuestionnaireIds.has(id);
  });
  const newQuestionnaireIdSet = new Set(newlySubmitted.map((record) => String(record.id).trim()));
  const knownAssessment = hasPreviousBaseline ? (previous!.assessmentSignatures || {}) : {};
  const events: RespondentNotification[] = [];
  const now = new Date().toISOString();

  for (const record of newlySubmitted) {
    const id = String(record.id).trim();
    events.push({
      id: `kuisioner:${id}:${fingerprint(String(record.timestamp || ''))}`,
      kind: 'kuisioner',
      title: options.baselineNamespace === 'native-sipandu-stage-one'
        ? 'Kuisioner Tahap Awal — Responden Baru'
        : 'Google Form — Responden Baru',
      body: options.baselineNamespace === 'native-sipandu-stage-one'
        ? `Responden ${String(record.namaLengkap || 'baru')} telah mengisi kuisioner tahap awal SIPANDU.`
        : `Responden ${String(record.namaLengkap || 'baru')} baru mengirim Google Form. Tinjau data yang masuk di Database PPKS.`,
      respondentName: String(record.namaLengkap || 'Responden baru'),
      respondentId: id,
      createdAt: now,
      read: false,
    });
  }

  const assessmentById = new Map<string, Record<string, unknown>>();
  for (const record of assessmentRecords) {
    const id = String(record.id || '').trim();
    if (id) assessmentById.set(id, record);
  }
  for (const [id, record] of assessmentById) {
    if (!currentQuestionnaireIds.has(id) || newQuestionnaireIdSet.has(id)) continue;
    const signature = meaningfulAssessmentSignature(record);
    if (!signature) continue;
    const nextFingerprint = fingerprint(signature);
    if (knownAssessment[id] === nextFingerprint) continue;
    // New or changed assessment data for an already-known respondent.
    events.push({
      id: `asesmen:${id}:${nextFingerprint}`,
      kind: 'asesmen',
      title: 'Asesmen Responden Diperbarui',
      body: `Responden ${String(record.namaLengkap || 'terdaftar')} telah mengisi atau memperbarui asesmen.`,
      respondentName: String(record.namaLengkap || 'Responden terdaftar'),
      createdAt: now,
      read: false,
    });
  }

  if (events.length === 0) return [];
  const priorHistory = loadRespondentNotifications(uid);
  const knownEventIds = new Set(priorHistory.map((item) => item.id));
  const freshEvents = events.filter((event) => !knownEventIds.has(event.id));
  if (freshEvents.length === 0) return [];

  const nextHistory = [...freshEvents, ...priorHistory].slice(0, HISTORY_LIMIT);
  safeWrite(scopedKey(HISTORY_KEY, uid), nextHistory);
  notifyHistoryChanged(uid);
  for (const event of freshEvents) await showSystemNotification(event, uid);

  const badgeNavigator = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void> };
  const unreadCount = nextHistory.filter((item) => !item.read).length;
  try { await badgeNavigator.setAppBadge?.(unreadCount); } catch { /* badges are optional platform support */ }
  return freshEvents;
}
