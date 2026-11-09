import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSecurityAuditEntries } from './securityAudit';

test('combines service and field-visit events in newest-first order', () => {
  const entries = createSecurityAuditEntries(
    [{
      id: 'service-1',
      ppksId: 'ppks-opaque-1',
      eventType: 'nutrition-assistance',
      status: 'diterima',
      serviceDate: '2026-11-08',
      createdByUid: 'staff-1',
      assignedToUid: 'staff-2',
      createdAt: '2026-11-08T10:00:00.000Z',
    }],
    [{
      id: 'visit-1',
      ppksId: 'ppks-opaque-2',
      visitType: 'monitoring-bantuan',
      outcome: 'perlu-tindak-lanjut',
      visitDate: '2026-11-09',
      createdByUid: 'staff-2',
      assignedToUid: 'staff-2',
      createdAt: '2026-11-09T08:00:00.000Z',
    }],
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0].source, 'field-visit');
  assert.equal(entries[0].label, 'Monitoring bantuan');
  assert.equal(entries[1].source, 'service-event');
  assert.equal(entries[1].label, 'Bantuan nutrisi');
});

test('audit projection excludes free-text notes and direct personal identifiers', () => {
  const entries = createSecurityAuditEntries([], [{
    id: 'visit-2',
    ppksId: 'ppks-opaque-3',
    visitType: 'kunjungan-rumah',
    outcome: 'selesai',
    visitDate: '2026-11-09',
    createdByUid: 'staff-3',
    assignedToUid: 'staff-3',
    createdAt: '2026-11-09T09:00:00.000Z',
  }]);

  assert.deepEqual(
    Object.keys(entries[0]).sort(),
    ['actorUid', 'assignedToUid', 'createdAt', 'eventDate', 'id', 'label', 'ppksId', 'source', 'status'].sort(),
  );
  assert.equal('summary' in entries[0], false);
  assert.equal('nextAction' in entries[0], false);
  assert.equal('nik' in entries[0], false);
  assert.equal('namaLengkap' in entries[0], false);
});
