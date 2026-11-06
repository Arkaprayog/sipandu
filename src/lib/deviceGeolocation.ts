import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import {
  normalizeGeolocationError,
  PRECISE_GEOLOCATION_OPTIONS,
} from './locationPolicy';

/**
 * Use the native Android/iOS permission flow in Capacitor apps and the
 * browser implementation in installed PWAs (Android Chrome and iOS Safari).
 *
 * Android 12+ can grant only approximate/coarse access. SIPANDU checks the
 * fine-location alias before requesting a high-accuracy position.
 */
export async function getPreciseDevicePosition(): Promise<Position> {
  if (Capacitor.isNativePlatform()) {
    let permission;

    try {
      permission = await Geolocation.checkPermissions();

      if (permission.location !== 'granted') {
        permission = await Geolocation.requestPermissions({
          permissions: ['location'],
        });
      }
    } catch (error) {
      throw new Error(normalizeGeolocationError(error));
    }

    if (permission.location !== 'granted') {
      if (permission.coarseLocation === 'granted') {
        throw new Error(
          'Izin yang aktif hanya Lokasi Perkiraan. Buka Setelan Android → Aplikasi → SIPANDU ODHIV → Izin → Lokasi, lalu pilih Izinkan dengan lokasi akurat/Precise.'
        );
      }

      throw new Error(
        'Izin lokasi presisi belum diberikan. Aktifkan izin Lokasi saat aplikasi digunakan dan pilih Lokasi Akurat/Precise.'
      );
    }
  }

  try {
    const position = await Geolocation.getCurrentPosition(
      PRECISE_GEOLOCATION_OPTIONS
    );

    const { latitude, longitude, accuracy } = position.coords;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(accuracy) ||
      accuracy <= 0
    ) {
      throw new Error('Perangkat mengembalikan koordinat atau tingkat akurasi GPS yang tidak valid.');
    }

    return position;
  } catch (error) {
    throw new Error(normalizeGeolocationError(error));
  }
}
