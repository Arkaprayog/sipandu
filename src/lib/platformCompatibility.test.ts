import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPwaRuntimeCapabilities } from './platformCompatibility';

const supportedApis = {
  serviceWorkerAvailable: true,
  browserNotificationsAvailable: false,
  standaloneMode: false,
};

test('mengenali indikasi HarmonyOS dari user-agent', () => {
  const result = detectPwaRuntimeCapabilities({
    ...supportedApis,
    userAgent: 'Mozilla/5.0 HarmonyOS 6.0 ArkWeb',
  });
  assert.equal(result.platformFamily, 'harmonyos');
  assert.equal(result.isHuaweiDevice, true);
  assert.equal(result.serviceWorkerAvailable, true);
});

test('mengenali perangkat Huawei dengan EMUI/Android', () => {
  const result = detectPwaRuntimeCapabilities({
    ...supportedApis,
    userAgent: 'Mozilla/5.0 (Linux; Android 12; HUAWEI; EMUI 12)',
  });
  assert.equal(result.platformFamily, 'huawei-android');
});

test('user-agent yang tidak mengungkap OS tidak dianggap sebagai ketidakcocokan', () => {
  const result = detectPwaRuntimeCapabilities({
    ...supportedApis,
    userAgent: 'Mozilla/5.0 Mobile Safari',
  });
  assert.equal(result.platformFamily, 'other');
  assert.equal(result.serviceWorkerAvailable, true);
  assert.equal(result.browserNotificationsAvailable, false);
});
