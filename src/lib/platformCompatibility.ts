export type SIPANDUPlatformFamily = 'harmonyos' | 'huawei-android' | 'huawei-browser-unknown' | 'other';

export interface PwaRuntimeCapabilitiesInput {
  userAgent: string;
  serviceWorkerAvailable: boolean;
  browserNotificationsAvailable: boolean;
  standaloneMode: boolean;
}

export interface PwaRuntimeCapabilities extends PwaRuntimeCapabilitiesInput {
  platformFamily: SIPANDUPlatformFamily;
  platformLabel: string;
  isHuaweiDevice: boolean;
}

/** User-agent detection is advisory only; some browsers reduce or hide OS details. */
export function detectPwaRuntimeCapabilities(
  input: PwaRuntimeCapabilitiesInput,
): PwaRuntimeCapabilities {
  const userAgent = String(input.userAgent || '');
  let platformFamily: SIPANDUPlatformFamily = 'other';

  if (/HarmonyOS|OpenHarmony|ArkWeb/i.test(userAgent)) {
    platformFamily = 'harmonyos';
  } else if (/HuaweiBrowser/i.test(userAgent) && !/Android|EMUI/i.test(userAgent)) {
    platformFamily = 'huawei-browser-unknown';
  } else if (/HUAWEI|Huawei|HONOR|EMUI/i.test(userAgent)) {
    platformFamily = 'huawei-android';
  }

  const labels: Record<SIPANDUPlatformFamily, string> = {
    harmonyos: 'Huawei HarmonyOS (indikasi user-agent)',
    'huawei-android': 'Huawei / EMUI / Android (indikasi user-agent)',
    'huawei-browser-unknown': 'Huawei Browser (versi sistem tidak terdeteksi)',
    other: 'Perangkat lain atau informasi OS tidak tersedia',
  };

  return {
    ...input,
    platformFamily,
    platformLabel: labels[platformFamily],
    isHuaweiDevice: platformFamily !== 'other',
  };
}
