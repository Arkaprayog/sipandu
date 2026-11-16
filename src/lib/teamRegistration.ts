import type { User } from 'firebase/auth';

export const TEAM_REGISTRATION_API = 'https://sipandu-registration.aryprayoga139.workers.dev';

type ApiResponse = {
  ok?: boolean;
  ready?: boolean;
  message?: string;
  missing?: string[];
  status?: string;
  role?: string;
  configurationReady?: boolean;
  permissionCheckStatus?: 'checked' | 'unavailable' | 'skipped';
  roleUpdatePermission?: boolean | null;
  accountEmailVerified?: boolean;
  accountEnabled?: boolean;
};

async function requestJson(path: string, user: User): Promise<ApiResponse> {
  let response: Response;
  try {
    const idToken = await user.getIdToken(true);
    response = await fetch(`${TEAM_REGISTRATION_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({}),
    });
  } catch {
    throw new Error('Layanan aktivasi SIPANDU belum dapat dijangkau. Periksa koneksi internet lalu coba lagi.');
  }
  const body = await response.json().catch(() => ({})) as ApiResponse;
  if (!response.ok) throw new Error(body.message || 'Aktivasi akun SIPANDU belum berhasil.');
  return body;
}

function explainActivationFailure(original: unknown, diagnostics: ApiResponse | null): Error {
  const originalMessage = original instanceof Error ? original.message : 'Aktivasi akun SIPANDU belum berhasil.';
  if (!diagnostics) {
    return new Error(`${originalMessage} Pemeriksaan IAM otomatis belum dapat dijalankan. Jangan membuat akun baru; coba masuk kembali setelah administrator memeriksa Worker dan Firebase.`);
  }
  if (diagnostics.configurationReady === false) {
    const missing = diagnostics.missing?.length ? diagnostics.missing.join(', ') : 'konfigurasi Worker';
    return new Error(`Aktivasi belum dapat dilakukan. Konfigurasi Worker sipandu-registration belum lengkap: ${missing}. Sesi akun tetap dapat dipulihkan; jangan mendaftar ulang.`);
  }
  if (diagnostics.permissionCheckStatus === 'checked' && diagnostics.roleUpdatePermission === false) {
    return new Error('Email sudah diverifikasi, tetapi Firebase belum dapat menerbitkan peran anggota. Hasil pemeriksaan otomatis memastikan service account pada secret FIREBASE_SERVICE_ACCOUNT_JSON Worker sipandu-registration belum memiliki izin IAM firebaseauth.users.update. Administrator harus memberikan izin tersebut pada proyek gen-lang-client-0197631978. Jangan membuat akun baru; masuk kembali setelah izin diperbaiki.');
  }
  if (diagnostics.permissionCheckStatus === 'checked' && diagnostics.roleUpdatePermission === true) {
    return new Error(`${originalMessage} Pemeriksaan IAM otomatis memastikan izin firebaseauth.users.update tersedia. Administrator perlu memeriksa log Worker sipandu-registration dan status Firebase Authentication; jangan membuat akun baru.`);
  }
  return new Error(`${originalMessage} Konfigurasi dasar Worker tersedia, tetapi pemeriksaan izin IAM Google belum dapat dipastikan. Administrator perlu memeriksa akses service account tanpa memberikan hak Project Owner.`);
}

/**
 * Activates a Firebase account only after Firebase confirms its email and
 * the Worker verifies the matching self-registration record. The Worker
 * issues the least-privilege anggota role; clients cannot select a role.
 */
export async function activateVerifiedTeamMember(user: User): Promise<void> {
  let result: ApiResponse;
  try {
    result = await requestJson('/activate', user);
  } catch (activationError) {
    let diagnostics: ApiResponse | null = null;
    try {
      diagnostics = await requestJson('/activation-diagnostics', user);
    } catch {
      // Keep the original activation failure and explain that diagnostics
      // could not complete. Never treat an unavailable diagnostic as success.
    }
    throw explainActivationFailure(activationError, diagnostics);
  }
  if (result.status !== 'active' || result.role !== 'anggota') {
    throw new Error(result.message || 'Worker belum mengaktifkan akun sebagai anggota SIPANDU.');
  }
  // Force a new token so Firebase custom claims include the server-issued role.
  await user.getIdToken(true);
}
