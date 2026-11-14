import type { User } from 'firebase/auth';

export const TEAM_REGISTRATION_API = 'https://sipandu-registration.aryprayoga139.workers.dev';

type ApiResponse = {
  ok?: boolean;
  ready?: boolean;
  message?: string;
  missing?: string[];
  status?: string;
  role?: string;
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

/**
 * Activates any Firebase account only after Firebase confirms its email.
 * The Worker assigns the least-privilege anggota role; no invitation,
 * team code, approval, or client-supplied role is accepted.
 */
export async function activateVerifiedTeamMember(user: User): Promise<void> {
  const result = await requestJson('/activate', user);
  if (result.status !== 'active' || result.role !== 'anggota') {
    throw new Error(result.message || 'Worker belum mengaktifkan akun sebagai anggota SIPANDU.');
  }
  // Force a new token so Firebase custom claims include the server-issued role.
  await user.getIdToken(true);
}
