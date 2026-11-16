import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferRegistrationRecovery } from './registrationRecovery';

test('offers recovery when a Firebase account was created before a later step failed', () => {
  assert.equal(shouldOfferRegistrationRecovery(true), true);
});

test('offers recovery when Firebase reports that the email already belongs to an account', () => {
  assert.equal(shouldOfferRegistrationRecovery(false, 'auth/email-already-in-use'), true);
});

test('does not offer account recovery when failure occurred before account creation', () => {
  assert.equal(shouldOfferRegistrationRecovery(false, 'auth/invalid-email'), false);
});
