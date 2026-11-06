import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeGeolocationError,
  PRECISE_GEOLOCATION_OPTIONS,
} from './locationPolicy';

test('requests a fresh high-accuracy position without cached coordinates', () => {
  assert.deepEqual(PRECISE_GEOLOCATION_OPTIONS, {
    enableHighAccuracy: true,
    timeout: 45000,
    maximumAge: 0,
  });
});

test('explains a denied location permission', () => {
  assert.match(
    normalizeGeolocationError({ code: 1, message: 'User denied Geolocation' }),
    /Lokasi Akurat\/Precise Location/
  );
});

test('explains disabled device location services', () => {
  assert.match(
    normalizeGeolocationError({ message: 'OS-PLUG-GLOC-0007: Location services are not enabled' }),
    /Aktifkan Lokasi/
  );
});

test('explains a GPS timeout with a practical recovery step', () => {
  assert.match(
    normalizeGeolocationError({ code: 3, message: 'Position acquisition timed out' }),
    /tempat terbuka/
  );
});

test('detects missing fine-location manifest permission', () => {
  assert.match(
    normalizeGeolocationError({ message: 'OS-PLUG-GLOC-0018: Location permissions are not declared in manifest' }),
    /ACCESS_FINE_LOCATION/
  );
});

test('keeps unexpected platform errors visible instead of hiding them', () => {
  assert.match(
    normalizeGeolocationError(new Error('Provider unavailable')),
    /Provider unavailable/
  );
});
