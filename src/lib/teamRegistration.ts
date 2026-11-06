import type { User } from 'firebase/auth';

export const TEAM_REGISTRATION_API = 'https://sipandu-registration.aryprayoga139.workers.dev';

type ApiResponse = {
  ok?: boolean;
  ready?: boolean;
  message?: string;
  missing?: string[];
};

async function requestJson(path: string, init?: RequestInit): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(`${TEAM_REGISTRATION_API}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('Layanan pendaftaran SIPANDU belum dapat dijangkau. Administrator perlu mengaktifkan layanan pendaftaran.');
  }
  const body = await response.json().catch(() => ({})) as ApiResponse;
  if (!response.ok) throw new Error(body.message || 'Permintaan pendaftaran belum berhasil. Periksa kode tim dan koneksi internet.');
  return body;
}

export async function checkTeamRegistrationService(): Promise<void> {
  const result = await requestJson('/health', { method: 'GET', headers: {} });
  if (!result.ready) {
    const missing = result.missing?.join(', ') || 'konfigurasi layanan';
    throw new Error(`Pendaftaran akun belum diaktifkan sepenuhnya oleh administrator SIPANDU (${missing}).`);
  }
}

export async function validateTeamRegistrationCode(code: string): Promise<void> {
  await requestJson('/validate-code', { method: 'POST', body: JSON.stringify({ code: code.trim() }) });
}

export async function registerPendingTeamMember(user: User, code: string): Promise<void> {
  const idToken = await user.getIdToken();
  await requestJson('/register', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ code: code.trim() }),
  });
}

export async function restorePendingTeamInvitation(user: User, code: string): Promise<void> {
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new Error('Masukkan kode pendaftaran tim dari administrator.');
  const idToken = await user.getIdToken(true);
  await requestJson('/restore-invitation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ code: normalizedCode }),
  });
}

export async function activatePendingTeamMember(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  await requestJson('/activate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  await user.getIdToken(true);
}
