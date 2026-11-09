import type { PPKSServiceStatus } from '../types';

export interface FollowUpReminderSource {
  followUpAt: string;
  assignedToUid: string;
}

export interface FollowUpReminderPlanItem {
  id: number;
  key: string;
  kind: 'due' | 'overdue';
  at: Date;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const REMINDER_HOUR = 9;
const REMINDER_MINUTE = 0;
const LATE_OPEN_DELAY_MS = 3 * 60 * 1000;
const MAX_FUTURE_DAYS = 45;

function localDateKey(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0'),
  ].join('-');
}

function parseLocalDate(value: string): Date | null {
  const match = String(value || '').trim().match(DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null;
}

function stableNotificationId(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 1_000_000_000 + ((hash >>> 0) % 1_000_000_000);
}

function atReminderTime(date: Date, now: Date): Date {
  const scheduled = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    REMINDER_HOUR,
    REMINDER_MINUTE,
    0,
    0,
  );
  return scheduled.getTime() <= now.getTime()
    ? new Date(now.getTime() + LATE_OPEN_DELAY_MS)
    : scheduled;
}

/**
 * Create at most one generic, privacy-safe reminder per due date. Pendamping only
 * receives reminders for status records assigned to their UID; managers see the
 * aggregated dates across their accessible team scope.
 */
export function buildFollowUpReminderPlan(
  statuses: FollowUpReminderSource[],
  userUid: string,
  role: string,
  now: Date = new Date(),
  maxFutureDays = MAX_FUTURE_DAYS,
): FollowUpReminderPlanItem[] {
  if (!userUid || !['owner', 'supervisor', 'pendamping'].includes(role)) return [];

  const today = localDateKey(now);
  const dueDates = new Set<string>();
  let hasOverdue = false;

  for (const status of statuses as Array<Pick<PPKSServiceStatus, 'followUpAt' | 'assignedToUid'>>) {
    if (role === 'pendamping' && status.assignedToUid !== userUid) continue;
    const parsed = parseLocalDate(String(status.followUpAt || '').slice(0, 10));
    if (!parsed) continue;
    const dateKey = localDateKey(parsed);
    if (dateKey < today) hasOverdue = true;
    else dueDates.add(dateKey);
  }

  const plan: FollowUpReminderPlanItem[] = [];
  if (hasOverdue) {
    const key = `overdue:${today}`;
    plan.push({
      id: stableNotificationId(key),
      key,
      kind: 'overdue',
      at: new Date(now.getTime() + LATE_OPEN_DELAY_MS),
    });
  }

  const sortedDates = [...dueDates].sort().slice(0, Math.max(0, maxFutureDays));
  for (const dateKey of sortedDates) {
    const parsed = parseLocalDate(dateKey);
    if (!parsed) continue;
    const key = `due:${dateKey}`;
    plan.push({
      id: stableNotificationId(key),
      key,
      kind: 'due',
      at: atReminderTime(parsed, now),
    });
  }

  return plan;
}
