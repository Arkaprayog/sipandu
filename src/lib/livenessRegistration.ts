import type { User } from 'firebase/auth';
import { TEAM_REGISTRATION_API } from './teamRegistration';

export type LivenessPurpose = 'registration' | 'login';

export interface LivenessHealth {
  ok: boolean;
  ready: boolean;
  region: string;
  minimumConfidence?: number;
  consentVersion: string;
  missing?: string[];
}

export interface LivenessSession {
  ok: boolean;
  challengeId: string;
  sessionId: string;
  region: string;
  expiresInSeconds: number;
}

export type LivenessFrameMessage =
  | { type: 'passed'; proofToken: string }
  | { type: 'error'; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidLivenessProofToken(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 2 && parts.every((part) => UUID_PATTERN.test(part));
}

export function isLivenessFrameReadyMessage(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).type === 'sipandu:liveness:ready'
  );
}

export function parseLivenessFrameMessage(value: unknown, nonce: string, challengeId: string): LivenessFrameMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.nonce !== nonce) return null;
  if (message.type === 'sipandu:liveness:passed'
    && isValidLivenessProofToken(message.proofToken)
    && message.proofToken.split('.')[0] === challengeId) {
    return { type: 'passed', proofToken: message.proofToken };
  }
  if (message.type === 'sipandu:liveness:error'
    && typeof message.message === 'string'
    && message.message.length > 0
    && message.message.length <= 240) {
    return { type: 'error', message: message.message };
  }
  return null;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

export async function getLivenessHealth(fetcher: typeof fetch = fetch): Promise<LivenessHealth> {
  const response = await fetcher(`${TEAM_REGISTRATION_API}/liveness/health`, {
    method: 'GET',
    cache: 'no-store',
  });
  const body = await responseBody(response);
  if (!response.ok || typeof body.ready !== 'boolean') {
    throw new Error(typeof body.message === 'string'
      ? body.message
      : `Status layanan verifikasi wajah tidak dapat dibaca (HTTP ${response.status}).`);
  }
  return body as unknown as LivenessHealth;
}

export async function createLivenessSession(
  user: User,
  consentVersion: string,
  purpose: LivenessPurpose = 'registration',
  fetcher: typeof fetch = fetch,
): Promise<LivenessSession> {
  if (!consentVersion) throw new Error('Versi persetujuan verifikasi wajah belum tersedia.');
  const idToken = await user.getIdToken(true);
  const response = await fetcher(`${TEAM_REGISTRATION_API}/liveness/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ consentVersion, purpose }),
  });
  const body = await responseBody(response);
  if (!response.ok
    || typeof body.challengeId !== 'string'
    || typeof body.sessionId !== 'string'
    || typeof body.region !== 'string') {
    throw new Error(typeof body.message === 'string'
      ? body.message
      : `Sesi verifikasi wajah belum dapat dibuat (HTTP ${response.status}).`);
  }
  return body as unknown as LivenessSession;
}

export async function registerSelfServiceMemberWithLiveness(
  user: User,
  proofToken: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!isValidLivenessProofToken(proofToken)) {
    throw new Error('Bukti verifikasi wajah tidak valid. Ulangi pemeriksaan.');
  }
  const idToken = await user.getIdToken(true);
  const response = await fetcher(`${TEAM_REGISTRATION_API}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ livenessProofToken: proofToken }),
  });
  const body = await responseBody(response);
  if (!response.ok || body.status !== 'pending_email') {
    throw new Error(typeof body.message === 'string'
      ? body.message
      : 'Pendaftaran mandiri belum berhasil dicatat.');
  }
}


export async function consumeLoginLivenessProof(
  user: User,
  proofToken: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!isValidLivenessProofToken(proofToken)) {
    throw new Error('Bukti verifikasi wajah tidak valid. Ulangi pemeriksaan.');
  }
  const idToken = await user.getIdToken(true);
  const response = await fetcher(`${TEAM_REGISTRATION_API}/liveness/login/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ proofToken }),
  });
  const body = await responseBody(response);
  if (!response.ok || body.status !== 'verified') {
    throw new Error(typeof body.message === 'string'
      ? body.message
      : 'Verifikasi wajah saat login belum berhasil diselesaikan.');
  }
}
