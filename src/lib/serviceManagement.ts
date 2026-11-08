import type {
  AssistanceServiceStatus,
  PPKSRecord,
  PPKSServiceStatus,
} from '../types';

export interface PPKSServiceMetrics {
  total: number;
  nutritionNeeds: number;
  nutritionReceived: number;
  nutritionUnverified: number;
  entrepreneurshipNeeds: number;
  entrepreneurshipReceived: number;
  entrepreneurshipUnverified: number;
  therapyScheduled: number;
  therapyActive: number;
  therapyCompleted: number;
  followUpRequired: number;
  followUpScheduled: number;
}

const emptyStatus = (ppksId: string): PPKSServiceStatus => ({
  ppksId,
  nutritionStatus: 'belum-diverifikasi',
  entrepreneurshipStatus: 'belum-diverifikasi',
  psychosocialStatus: 'belum-dimulai',
  lastNutritionAt: '',
  lastEntrepreneurshipAt: '',
  lastTherapyAt: '',
  therapySessionCount: 0,
  followUpAt: '',
  followUpReason: '',
  assignedToUid: '',
  createdAt: '',
  updatedAt: '',
  updatedByUid: '',
});

const hasExplicitRecommendation = (value: unknown): boolean => {
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).join(' ').toLocaleLowerCase('id-ID')
    : String(value ?? '').trim().toLocaleLowerCase('id-ID');
  return /^(ya|iya|yes|true|1|butuh|dibutuhkan|direkomendasikan|direkomendasikan untuk bantuan)$/i.test(normalized);
};

const textHasNeed = (value: unknown, pattern: RegExp): boolean =>
  pattern.test(String(value ?? '').toLocaleLowerCase('id-ID'));

export function getInitialPPKSServiceStatus(record: PPKSRecord): PPKSServiceStatus {
  const initial = emptyStatus(record.id);
  const requested = String(record.jenisBantuan || '');
  const nutritionRecommended =
    record.integratedForm?.rekomendasiBantuanNutrisi === true ||
    hasExplicitRecommendation(record.officialAssessment?.rekomendasiBantuanNutrisi);
  const entrepreneurshipRecommended =
    record.integratedForm?.rekomendasiBantuanModalUsaha === true ||
    hasExplicitRecommendation(record.officialAssessment?.rekomendasiBantuanModalUsaha);

  if (nutritionRecommended || textHasNeed(requested, /nutrisi|gizi|pemenuhan makanan/)) {
    initial.nutritionStatus = 'dibutuhkan';
  }
  if (entrepreneurshipRecommended || textHasNeed(requested, /kewirausaha|wirausaha|modal usaha|bantuan usaha/)) {
    initial.entrepreneurshipStatus = 'dibutuhkan';
  }
  return initial;
}

export function resolvePPKSServiceStatus(
  record: PPKSRecord,
  stored?: PPKSServiceStatus | null,
): PPKSServiceStatus {
  const initial = getInitialPPKSServiceStatus(record);
  return stored ? { ...initial, ...stored, ppksId: record.id } : initial;
}

export function isAssistancePending(status: AssistanceServiceStatus): boolean {
  return status === 'dibutuhkan' || status === 'dalam-proses';
}

export function isFollowUpRequired(status: PPKSServiceStatus): boolean {
  return (
    isAssistancePending(status.nutritionStatus) ||
    isAssistancePending(status.entrepreneurshipStatus) ||
    status.psychosocialStatus === 'terjadwal' ||
    status.psychosocialStatus === 'aktif' ||
    Boolean(status.followUpAt)
  );
}

export type FollowUpReminderUrgency = 'overdue' | 'today' | 'upcoming' | 'unscheduled' | 'none';

function dateOrdinal(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}

/**
 * Derive an in-app reminder from an explicitly stored follow-up date.
 * Unscheduled pending work is surfaced separately; absence of a service record
 * is never interpreted as proof that assistance was not received.
 */
export function getFollowUpReminderUrgency(
  status: PPKSServiceStatus,
  todayDate: string,
  upcomingWindowDays = 7,
): FollowUpReminderUrgency {
  if (!status.followUpAt) return isFollowUpRequired(status) ? 'unscheduled' : 'none';
  const due = dateOrdinal(status.followUpAt);
  const today = dateOrdinal(todayDate);
  if (due === null || today === null) return 'none';
  const daysUntilDue = due - today;
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'today';
  return daysUntilDue <= Math.max(0, upcomingWindowDays) ? 'upcoming' : 'none';
}

export function calculatePPKSServiceMetrics(
  records: PPKSRecord[],
  storedStatuses: PPKSServiceStatus[],
): PPKSServiceMetrics {
  const statusById = new Map(storedStatuses.map((status) => [status.ppksId, status]));
  const statuses = records.map((record) => resolvePPKSServiceStatus(record, statusById.get(record.id)));
  return {
    total: records.length,
    nutritionNeeds: statuses.filter((status) => isAssistancePending(status.nutritionStatus)).length,
    nutritionReceived: statuses.filter((status) => status.nutritionStatus === 'diterima').length,
    nutritionUnverified: statuses.filter((status) => status.nutritionStatus === 'belum-diverifikasi').length,
    entrepreneurshipNeeds: statuses.filter((status) => isAssistancePending(status.entrepreneurshipStatus)).length,
    entrepreneurshipReceived: statuses.filter((status) => status.entrepreneurshipStatus === 'diterima').length,
    entrepreneurshipUnverified: statuses.filter((status) => status.entrepreneurshipStatus === 'belum-diverifikasi').length,
    therapyScheduled: statuses.filter((status) => status.psychosocialStatus === 'terjadwal').length,
    therapyActive: statuses.filter((status) => status.psychosocialStatus === 'aktif').length,
    therapyCompleted: statuses.filter((status) => status.psychosocialStatus === 'selesai' || status.therapySessionCount > 0).length,
    followUpRequired: statuses.filter(isFollowUpRequired).length,
    followUpScheduled: statuses.filter((status) => Boolean(status.followUpAt)).length,
  };
}
