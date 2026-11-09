import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFollowUpReminderPlan } from './followUpReminders';

const status = (followUpAt: string, assignedToUid = 'staff-1') => ({ followUpAt, assignedToUid });

test('creates one due-date reminder for many records on the same day', () => {
  const now = new Date(2026, 10, 9, 8, 0, 0);
  const plan = buildFollowUpReminderPlan([
    status('2026-11-10', 'staff-1'),
    status('2026-11-10', 'staff-2'),
    status('2026-11-12', 'staff-3'),
  ], 'owner-1', 'owner', now);

  assert.equal(plan.length, 2);
  assert.equal(plan[0].key, 'due:2026-11-10');
  assert.equal(plan[0].at.getFullYear(), 2026);
  assert.equal(plan[0].at.getMonth(), 10);
  assert.equal(plan[0].at.getDate(), 10);
  assert.equal(plan[0].at.getHours(), 9);
  assert.equal(plan[0].at.getMinutes(), 0);
});

test('pendamping receives only dates assigned to their own UID', () => {
  const now = new Date(2026, 10, 9, 8, 0, 0);
  const plan = buildFollowUpReminderPlan([
    status('2026-11-10', 'pendamping-1'),
    status('2026-11-11', 'pendamping-2'),
  ], 'pendamping-1', 'pendamping', now);

  assert.deepEqual(plan.map((item) => item.key), ['due:2026-11-10']);
});

test('overdue items are grouped into one generic reminder for the current date', () => {
  const now = new Date(2026, 10, 9, 14, 30, 0);
  const plan = buildFollowUpReminderPlan([
    status('2026-11-05'),
    status('2026-11-08'),
  ], 'owner-1', 'owner', now);

  assert.equal(plan.length, 1);
  assert.equal(plan[0].key, 'overdue:2026-11-09');
  assert.equal(plan[0].kind, 'overdue');
  assert.equal(plan[0].at.getTime(), now.getTime() + 3 * 60 * 1000);
});

test('invalid dates and unsupported roles do not create reminders', () => {
  const now = new Date(2026, 10, 9, 8, 0, 0);
  assert.deepEqual(buildFollowUpReminderPlan([status('2026-02-30'), status('not-a-date')], 'owner-1', 'owner', now), []);
  assert.deepEqual(buildFollowUpReminderPlan([status('2026-11-10')], 'staff-1', 'viewer', now), []);
  assert.deepEqual(buildFollowUpReminderPlan([status('2026-11-10')], '', 'owner', now), []);
});

test('past due today opens a short grace reminder rather than a past alarm', () => {
  const now = new Date(2026, 10, 9, 15, 0, 0);
  const plan = buildFollowUpReminderPlan([status('2026-11-09')], 'owner-1', 'owner', now);
  assert.equal(plan[0].at.getTime(), now.getTime() + 3 * 60 * 1000);
});

test('reminder plan contains no respondent identity or free-text fields', () => {
  const plan = buildFollowUpReminderPlan([status('2026-11-10')], 'owner-1', 'owner', new Date(2026, 10, 9, 8));
  assert.deepEqual(Object.keys(plan[0]).sort(), ['at', 'id', 'key', 'kind'].sort());
});
