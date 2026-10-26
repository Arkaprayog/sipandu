import { PPKSRecord } from '../types';

/**
 * Returns greeting based on hour (WIB)
 */
export function getWaktuGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return 'Pagi';
  if (hour >= 11 && hour < 15) return 'Siang';
  if (hour >= 15 && hour < 19) return 'Sore';
  return 'Malam';
}

/**
 * Validates password: at least 6 characters and contains at least one numeric digit
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Password wajib diisi' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password minimal 6 karakter' };
  }
  const hasNumber = /\d/.test(password);
  if (!hasNumber) {
    return { valid: false, error: 'Password harus memiliki kombinasi angka' };
  }
  return { valid: true };
}

/**
 * Convert a Google Forms editor URL into the respondent-facing URL.
 * Published short links (forms.gle) are left intact; editor URLs must never be
 * shown to respondents because they can require owner/editor access.
 */
export function toGoogleFormsRespondentUrl(formUrl: string | undefined): string {
  const value = String(formUrl || '').trim();
  if (!value) return '';
  if (/^https:\/\/forms\.gle\//i.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname !== 'docs.google.com') return value;
    const match = url.pathname.match(/^(\/forms\/d\/(?:e\/)?[^/]+)\/(edit|viewform)\/?$/);
    if (!match) return '';
    url.pathname = `${match[1]}/viewform`;
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Build a Google Forms prefilled URL that carries this respondent's stable
 * SIPANDU PPKS ID in the configured "ID PPKS" question.
 *
 * Google Forms exposes the field as an entry.<number> query parameter. The
 * numeric entry identifier must be copied from Google's own "Get pre-filled
 * link" flow; it must not be guessed.
 */
export function buildGoogleFormsPrefilledUrl(
  formUrl: string | undefined,
  entryId: string | undefined,
  ppksId: string
): string {
  const rawFormUrl = String(formUrl || '').trim();
  const rawEntryId = String(entryId || '').trim().replace(/^entry\./i, '');
  const respondentId = String(ppksId || '').trim();

  if (!rawFormUrl) throw new Error('URL Google Form lanjutan belum diatur.');
  if (!rawEntryId || !/^\d+$/.test(rawEntryId)) {
    throw new Error('ID entry pertanyaan “ID PPKS” belum valid. Ambil nomor entry dari tautan praisi Google Forms.');
  }
  if (!respondentId) throw new Error('ID PPKS kosong; tautan unik tidak dapat dibuat.');

  let url: URL;
  try {
    url = new URL(rawFormUrl);
  } catch {
    throw new Error('URL Google Form lanjutan tidak valid.');
  }
  if (url.hostname !== 'docs.google.com') {
    throw new Error('Untuk tautan unik, gunakan URL Google Forms lengkap dari docs.google.com, bukan tautan pendek forms.gle.');
  }
  const match = url.pathname.match(/^(\/forms\/d\/(?:e\/)?[^/]+)\/(edit|viewform)\/?$/);
  if (!match) {
    throw new Error('URL harus berupa halaman Google Forms editor (/edit) atau responden (/viewform).');
  }

  url.pathname = `${match[1]}/viewform`;
  url.searchParams.set('usp', 'pp_url');
  url.searchParams.set(`entry.${rawEntryId}`, respondentId);
  return url.toString();
}

/**
 * Builds the official WhatsApp message for follow-up assessment.
 * It deliberately does not reuse the stage-one form URL: stage two must have
 * its own configured form URL and prefill field so each link is tied to one PPKS.
 */
export function buildWhatsAppMessage(
  ppks: PPKSRecord,
  settings: {
    senderName?: string;
    senderRole?: string;
    senderUnit?: string;
    googleFormTahapLanjutanUrl?: string;
    googleFormTahapLanjutanIdEntry?: string;
    googleFormKesehatanMentalUrl?: string;
  } = {}
): string {
  const waktu = getWaktuGreeting().toLowerCase();
  const namaResponden = ppks.namaLengkap || 'Bapak/Ibu';
  const senderName = settings.senderName || 'Deny Arifin Martyon S.';
  const senderShortName = senderName.endsWith(' S.') ? senderName.slice(0, -3) : senderName;
  const senderRole = settings.senderRole || 'Pendamping ODHIV';
  const senderUnit =
    settings.senderUnit ||
    'Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV';

  let continuationText = '';
  try {
    const continuationUrl = buildGoogleFormsPrefilledUrl(
      settings.googleFormTahapLanjutanUrl,
      settings.googleFormTahapLanjutanIdEntry,
      ppks.id
    );
    continuationText = `Silakan lanjutkan asesmen melalui tautan khusus untuk data Anda berikut. ID referensi PPKS: ${ppks.id}. ID ini sudah diisi otomatis pada formulir; mohon jangan mengubahnya.\n${continuationUrl}`;
  } catch {
    continuationText =
      'Tautan asesmen lanjutan belum dapat dibuat karena pengaturan formulir lanjutan SIPANDU belum lengkap. Petugas akan mengirimkan tautan yang benar setelah konfigurasi selesai.';
  }

  const mentalHealthUrl = toGoogleFormsRespondentUrl(settings.googleFormKesehatanMentalUrl);
  const mentalHealthText = mentalHealthUrl
    ? `\n\nKuesioner Asesmen Kesehatan Mental (sukarela):\n${mentalHealthUrl}`
    : '';

  return `Halo ${namaResponden}
Selamat ${waktu}

Saya ${senderShortName} dari Tim Administrasi.

Terima kasih telah mengisi formulir Asesmen Program Atensi Kementerian Sosial Tahap Awal. Data akan ditinjau petugas sebelum tindak lanjut diberikan.

${continuationText}${mentalHealthText}

Jika Anda memiliki pertanyaan terkait Program Bantuan Atensi ini, silakan membalas pesan ini.

Terima kasih,
${senderName}
${senderRole}
${senderUnit}`;
}

/**
 * Formats phone number into standard WhatsApp international format (628...)
 */
export function formatPhoneNumberForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

/**
 * Creates direct wa.me link
 */
export function createWhatsAppLink(phone: string, text: string): string {
  const formattedPhone = formatPhoneNumberForWhatsApp(phone);
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Desil descriptor helper
 */
export function getDesilDescription(desil: number): string {
  if (desil === 0) return 'Belum Terdaftar / Verifikasi DTKS';
  if (desil <= 1) return 'Desil 1: Sangat Miskin (Prioritas Utama Atensi)';
  if (desil <= 2) return 'Desil 2: Miskin';
  if (desil <= 3) return 'Desil 3: Hampir Miskin';
  if (desil <= 4) return 'Desil 4: Rentan Miskin';
  if (desil <= 7) return `Desil ${desil}: Menengah Bawah`;
  return `Desil ${desil}: Mandiri / Non-DTKS`;
}
