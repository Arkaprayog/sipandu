/**
 * Registration failures can occur after Firebase Authentication has already
 * created the identity. These accounts must be resumed through login, never
 * duplicated with a second email or a destructive cleanup.
 */
export function shouldOfferRegistrationRecovery(firebaseAccountCreated: boolean, errorCode?: string): boolean {
  return firebaseAccountCreated || errorCode === 'auth/email-already-in-use';
}

export const REGISTRATION_RECOVERY_NOTICE =
  'Akun Firebase mungkin sudah terbentuk sebelum proses pendaftaran terputus. Jangan membuat akun baru. Kembali ke login dan masuk menggunakan email serta kata sandi yang sama. SIPANDU akan memeriksa status pendaftaran, memulihkan catatan yang belum tersimpan, dan mengirim ulang tautan verifikasi bila diperlukan.';
