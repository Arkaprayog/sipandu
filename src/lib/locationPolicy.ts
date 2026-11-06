export const PRECISE_GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 45000,
  maximumAge: 0,
} as const;

/**
 * Convert platform-specific geolocation errors into an actionable message.
 * Browser error codes follow the W3C Geolocation API; Capacitor native errors
 * use OS-PLUG-GLOC codes.
 */
export function normalizeGeolocationError(error: unknown): string {
  const value = error as { code?: string | number; message?: string } | null;
  const code = String(value?.code ?? '').toUpperCase();
  const message = String(value?.message ?? error ?? '');
  const diagnostic = (code + ' ' + message).toLowerCase();

  if (
    diagnostic.includes('os-plug-gloc-0003') ||
    code === '1' ||
    /permission denied|user denied|not allowed to access.*location|location permission denied|location permissions? denied/i.test(diagnostic)
  ) {
    return 'Izin lokasi SIPANDU belum diberikan. Izinkan Lokasi Akurat/Precise Location untuk aplikasi atau browser SIPANDU.';
  }

  if (
    diagnostic.includes('os-plug-gloc-0007') ||
    diagnostic.includes('os-plug-gloc-0009') ||
    /location services are not enabled|location service.*disabled|gps.*disabled|location.*turned off/i.test(diagnostic)
  ) {
    return 'Layanan Lokasi/GPS perangkat sedang mati. Aktifkan Lokasi pada pengaturan cepat perangkat, lalu tekan ikon lokasi untuk mencoba lagi.';
  }

  if (
    diagnostic.includes('os-plug-gloc-0018') ||
    /permissions are not declared in manifest|location permission.*manifest/i.test(diagnostic)
  ) {
    return 'Izin GPS belum tercantum di paket Android. APK perlu dibangun ulang dengan deklarasi ACCESS_FINE_LOCATION.';
  }

  if (
    diagnostic.includes('os-plug-gloc-0010') ||
    code === '3' ||
    /position unavailable|position could not be obtained|timed? out|timeout/i.test(diagnostic)
  ) {
    return 'GPS belum mendapatkan posisi yang cukup cepat. Aktifkan Lokasi Akurat, nyalakan GPS, dan coba lagi di tempat terbuka.';
  }

  if (
    diagnostic.includes('os-plug-gloc-0008') ||
    /restricted|secure context|secure origin|https/i.test(diagnostic)
  ) {
    return 'Akses lokasi dibatasi oleh sistem atau browser. Buka SIPANDU melalui alamat HTTPS dan periksa izin lokasi.';
  }

  if (code === '2' || /position unavailable|unable to retrieve location/i.test(diagnostic)) {
    return 'Posisi GPS belum tersedia. Pastikan layanan lokasi perangkat aktif dan coba lagi.';
  }

  return message.trim()
    ? 'Lokasi GPS belum berhasil diperoleh: ' + message.trim()
    : 'Lokasi GPS belum berhasil diperoleh. Periksa izin lokasi dan layanan GPS, lalu coba lagi.';
}
