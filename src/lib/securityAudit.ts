import type { FieldVisitRecord, PPKSServiceEvent, SecurityAuditEntry } from '../types';

type ServiceAuditInput = Pick<
  PPKSServiceEvent,
  'id' | 'ppksId' | 'eventType' | 'status' | 'serviceDate' | 'createdByUid' | 'assignedToUid' | 'createdAt'
>;
type VisitAuditInput = Pick<
  FieldVisitRecord,
  'id' | 'ppksId' | 'visitType' | 'outcome' | 'visitDate' | 'createdByUid' | 'assignedToUid' | 'createdAt'
>;

const serviceLabels: Record<ServiceAuditInput['eventType'], string> = {
  'nutrition-assistance': 'Bantuan nutrisi',
  'entrepreneurship-assistance': 'Bantuan kewirausahaan',
  'psychosocial-therapy': 'Terapi psikososial',
};

const visitLabels: Record<VisitAuditInput['visitType'], string> = {
  'kunjungan-rumah': 'Kunjungan rumah',
  'kunjungan-faskes': 'Kunjungan fasilitas kesehatan',
  'pendampingan-sosial': 'Pendampingan sosial',
  'monitoring-bantuan': 'Monitoring bantuan',
  'koordinasi-rujukan': 'Koordinasi rujukan',
};

/**
 * Build a privacy-minimized audit feed from existing append-only event records.
 * Free-text visit summaries, next actions, names, NIK, addresses and contact data
 * are intentionally never copied into the audit view model.
 */
export function createSecurityAuditEntries(
  serviceEvents: ServiceAuditInput[],
  fieldVisits: VisitAuditInput[],
): SecurityAuditEntry[] {
  const serviceEntries: SecurityAuditEntry[] = serviceEvents.map((event) => ({
    id: `service:${event.id}`,
    source: 'service-event',
    ppksId: event.ppksId,
    label: serviceLabels[event.eventType] || 'Layanan tercatat',
    status: String(event.status || ''),
    eventDate: String(event.serviceDate || ''),
    actorUid: String(event.createdByUid || ''),
    assignedToUid: String(event.assignedToUid || ''),
    createdAt: String(event.createdAt || ''),
  }));

  const visitEntries: SecurityAuditEntry[] = fieldVisits.map((visit) => ({
    id: `visit:${visit.id}`,
    source: 'field-visit',
    ppksId: visit.ppksId,
    label: visitLabels[visit.visitType] || 'Kunjungan lapangan',
    status: String(visit.outcome || ''),
    eventDate: String(visit.visitDate || ''),
    actorUid: String(visit.createdByUid || ''),
    assignedToUid: String(visit.assignedToUid || ''),
    createdAt: String(visit.createdAt || ''),
  }));

  return [...serviceEntries, ...visitEntries].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
  );
}
