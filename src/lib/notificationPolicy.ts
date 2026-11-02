export type SipanduSystemNotificationKind = 'kuisioner' | 'asesmen' | 'workspace';

export interface SafeSystemNotificationContent {
  title: string;
  body: string;
}

/**
 * OS notifications can appear on a lock screen. Never include respondent names,
 * HIV/health details, NIK, phone numbers, or other identifying information here.
 * The authenticated in-app notification history can retain its existing context.
 */
export function getSafeSystemNotificationContent(
  kind: SipanduSystemNotificationKind,
): SafeSystemNotificationContent {
  switch (kind) {
    case 'kuisioner':
      return {
        title: 'SIPANDU • Respons Baru',
        body: 'Ada respons Google Form baru. Buka SIPANDU untuk meninjau data yang masuk.',
      };
    case 'asesmen':
      return {
        title: 'SIPANDU • Asesmen Diperbarui',
        body: 'Ada pembaruan asesmen responden. Buka SIPANDU untuk meninjau.',
      };
    case 'workspace':
      return {
        title: 'SIPANDU • Google Workspace',
        body: 'Akses Google Drive, Sheets, atau Forms perlu disambungkan ulang. Buka SIPANDU untuk memulihkan izin.',
      };
  }
}

/** Daily deduplication key: a single reconnect warning per user per local calendar day. */
export function workspaceReconnectNotificationId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `workspace-reconnect:${year}-${month}-${day}`;
}
