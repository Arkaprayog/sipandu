import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeSystemNotificationContent, workspaceReconnectNotificationId } from './notificationPolicy';

test('lock-screen notification copy never exposes respondent identity or health details', () => {
  for (const kind of ['kuisioner', 'asesmen', 'workspace'] as const) {
    const content = getSafeSystemNotificationContent(kind);
    const combined = `${content.title} ${content.body}`.toLowerCase();
    assert.equal(/nik|085\d|hiv|nama responden|alamat|diagnosis/.test(combined), false);
  }
});

test('questionnaire and assessment notifications have distinct, actionable generic copy', () => {
  assert.match(getSafeSystemNotificationContent('kuisioner').body, /Google Form/);
  assert.match(getSafeSystemNotificationContent('asesmen').body, /pembaruan asesmen/);
});

test('Workspace notification explains that Google access needs reconnecting', () => {
  assert.match(getSafeSystemNotificationContent('workspace').body, /disambungkan ulang/);
});

test('Workspace reconnect notifications deduplicate once per local calendar day', () => {
  const morning = new Date(2026, 10, 3, 8, 0, 0);
  const evening = new Date(2026, 10, 3, 21, 0, 0);
  const nextDay = new Date(2026, 10, 4, 0, 1, 0);
  assert.equal(workspaceReconnectNotificationId(morning), workspaceReconnectNotificationId(evening));
  assert.notEqual(workspaceReconnectNotificationId(evening), workspaceReconnectNotificationId(nextDay));
});
