import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PPKSServiceStatus } from '../types';
import { buildFollowUpReminderPlan } from './followUpReminders';

const CHANNEL_ID = 'sipandu-follow-up-reminders-v1';
const STORAGE_PREFIX = 'sipandu_follow_up_notifications_v1';

interface NotificationExtra {
  uid?: string;
  namespace?: string;
  reminderKey?: string;
}

interface PendingNotification {
  id: number;
  extra?: NotificationExtra;
}

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}:${uid}`;
}

function readScheduledKeys(uid: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(uid)) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeScheduledKeys(uid: string, values: string[]): void {
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(values));
  } catch {
    // Android still retains the scheduled notification if local storage is unavailable.
  }
}

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function ensureChannel(): Promise<void> {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Pengingat Tindak Lanjut SIPANDU',
    description: 'Pengingat lokal untuk agenda tindak lanjut yang sudah dijadwalkan',
    importance: 4,
    sound: 'sipandu_notification.wav',
    vibration: true,
    visibility: 1,
  });
}

/**
 * Schedules generic local reminders on Android only. It never places a respondent
 * name, NIK, service type, clinical information, address, or PPKS ID in notification
 * title/body/extra. The device must first grant notification permission.
 */
export async function syncFollowUpLocalNotifications(
  uid: string,
  statuses: PPKSServiceStatus[],
  role: string,
  now: Date = new Date(),
): Promise<{ supported: boolean; permissionGranted: boolean; scheduled: number; cancelled: number }> {
  if (!isAndroidNative() || !uid || !['owner', 'supervisor', 'pendamping'].includes(role)) {
    return { supported: false, permissionGranted: false, scheduled: 0, cancelled: 0 };
  }

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') {
    return { supported: true, permissionGranted: false, scheduled: 0, cancelled: 0 };
  }

  await ensureChannel();
  const desiredPlan = buildFollowUpReminderPlan(statuses, uid, role, now);
  const desiredKeys = new Set(desiredPlan.map((item) => item.key));
  const previousKeys = readScheduledKeys(uid);

  const pendingResult = await LocalNotifications.getPending();
  const pending = pendingResult.notifications as PendingNotification[];
  const stalePending = pending.filter((item) =>
    item.extra?.namespace === 'follow-up'
    && (item.extra.uid !== uid || !desiredKeys.has(String(item.extra.reminderKey || '')))
  );
  if (stalePending.length) {
    await LocalNotifications.cancel({ notifications: stalePending.map((item) => ({ id: item.id })) });
  }

  const pendingCurrent = pending
    .filter((item) => item.extra?.namespace === 'follow-up' && item.extra.uid === uid)
    .map((item) => item.id);
  const pendingIds = new Set(pendingCurrent);
  const deliveredResult = await LocalNotifications.getDeliveredNotifications();
  const deliveredIds = new Set(deliveredResult.notifications.map((item) => item.id));

  const retainedKeys = previousKeys.filter((key) => desiredKeys.has(key));
  const retainedSet = new Set(retainedKeys);
  const toSchedule = desiredPlan.filter((item) =>
    !retainedSet.has(item.key) && !pendingIds.has(item.id) && !deliveredIds.has(item.id)
  );

  if (toSchedule.length) {
    await LocalNotifications.schedule({
      notifications: toSchedule.map((item) => ({
        id: item.id,
        title: 'Pengingat Tindak Lanjut SIPANDU',
        body: item.kind === 'overdue'
          ? 'Ada agenda tindak lanjut yang terlewat. Buka menu Layanan PPKS untuk meninjau.'
          : 'Ada agenda tindak lanjut terjadwal. Buka menu Layanan PPKS untuk meninjau.',
        schedule: { at: item.at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_sipandu',
        largeIcon: 'ic_launcher',
        autoCancel: true,
        ongoing: false,
        extra: { namespace: 'follow-up', uid, reminderKey: item.key },
      })),
    });
  }

  const nextKeys = [...new Set([...retainedKeys, ...toSchedule.map((item) => item.key)])];
  writeScheduledKeys(uid, nextKeys);
  return {
    supported: true,
    permissionGranted: true,
    scheduled: toSchedule.length,
    cancelled: stalePending.length,
  };
}

/** Cancel only this user's pending SIPANDU follow-up reminders on logout. */
export async function clearFollowUpLocalNotifications(uid: string): Promise<void> {
  if (!isAndroidNative() || !uid) return;
  const result = await LocalNotifications.getPending();
  const owned = (result.notifications as PendingNotification[])
    .filter((item) => item.extra?.namespace === 'follow-up' && item.extra.uid === uid);
  if (owned.length) {
    await LocalNotifications.cancel({ notifications: owned.map((item) => ({ id: item.id })) });
  }
  writeScheduledKeys(uid, []);
}
