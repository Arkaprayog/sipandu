export type RespondentNotificationKind = 'kuisioner' | 'asesmen';

export interface RespondentNotification {
  id: string;
  kind: RespondentNotificationKind;
  title: string;
  body: string;
  respondentName: string;
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
let notificationAudioContext: AudioContext | null = null;

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
    .filter((item) => item && (item.kind === 'kuisioner' || item.kind === 'asesmen'))
    .slice(0, HISTORY_LIMIT);
}

function notifyHistoryChanged(uid: string): void {
  window.dispatchEvent(new CustomEvent('sipandu-respondent-notifications-updated', { detail: { uid } }));
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
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported';
}

export async function enableRespondentNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return Notification.permission;

  try {
    const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
    await navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL });
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
  if (getRespondentNotificationPermission() !== 'granted') return;

  const basePath = import.meta.env.BASE_URL || './';
  const options: NotificationOptions = {
    body: item.body,
    icon: `${basePath}uploads/App%20Icon%20Picture.png`,
    badge: `${basePath}uploads/App%20Icon%20Picture.png`,
    tag: item.id,
    data: { url: basePath, notificationId: item.id, uid },
    vibrate: [250, 120, 250, 120, 450],
  };

  try {
    if ('serviceWorker' in navigator) {
      const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href);
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL });
      await registration.showNotification(item.title, options);
    } else {
      new Notification(item.title, options);
    }
    if (document.visibilityState === 'visible') playForegroundAlert();
    try { navigator.vibrate?.([250, 120, 250, 120, 450]); } catch { /* optional device feature */ }
  } catch (error) {
    console.warn('SIPANDU system notification could not be shown:', error);
  }
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
  assessmentRecords: Array<Record<string, unknown>>
): Promise<RespondentNotification[]> {
  const key = scopedKey(BASELINE_KEY, uid);
  const previous = safeRead<NotificationBaseline | null>(key, null);
  const current = baselineFor(questionnaireRecords, assessmentRecords);
  safeWrite(key, current);

  // The first successful import is a baseline; never alert for historic respondents.
  if (!previous || !Array.isArray(previous.questionnaireIds)) return [];

  const knownQuestionnaireIds = new Set(previous.questionnaireIds);
  const currentQuestionnaireIds = new Set(current.questionnaireIds);
  const newlySubmitted = questionnaireRecords.filter((record) => {
    const id = String(record.id || '').trim();
    return id && !knownQuestionnaireIds.has(id);
  });
  const newQuestionnaireIdSet = new Set(newlySubmitted.map((record) => String(record.id).trim()));
  const knownAssessment = previous.assessmentSignatures || {};
  const events: RespondentNotification[] = [];
  const now = new Date().toISOString();

  for (const record of newlySubmitted) {
    const id = String(record.id).trim();
    events.push({
      id: `kuisioner:${id}:${fingerprint(String(record.timestamp || ''))}`,
      kind: 'kuisioner',
      title: 'Kuisioner Responden Baru',
      body: `Responden ${String(record.namaLengkap || 'baru')} telah mengirim kuisioner tahap awal.`,
      respondentName: String(record.namaLengkap || 'Responden baru'),
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
