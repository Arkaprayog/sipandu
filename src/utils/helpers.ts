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
 * Builds the official WhatsApp text requested by Kemensos for SIPANDU ODHIV
 */
export function buildWhatsAppMessage(
  ppks: PPKSRecord,
  settings: {
    senderName?: string;
    senderRole?: string;
    senderUnit?: string;
    googleFormTahapAwalUrl?: string;
    googleFormKesehatanMentalUrl?: string;
  } = {}
): string {
  const waktu = getWaktuGreeting().toLowerCase();
  const namaResponden = ppks.namaLengkap || 'Bapak/Ibu';
  const senderName = settings.senderName || 'Deny Arifin Martyon S.';
  const senderRole = settings.senderRole || 'Pendamping ODHIV';
  const senderUnit =
    settings.senderUnit ||
    'Direktorat Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV';

  // Never fabricate a Forms URL. Convert the configured editor URL to its
  // public respondent URL, and omit the link section when no real form is configured.
  const configuredStageUrl = settings.googleFormTahapAwalUrl?.trim() || '';
  const baseUrl = configuredStageUrl
    .replace(/\/edit(?:\?.*)?$/, '/viewform')
    .replace(/\/$/, '');
  const uniqueLanjutanUrl = baseUrl
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}entry.id=${encodeURIComponent(ppks.id)}&entry.nik=${encodeURIComponent(ppks.nik)}`
    : '';
  const mentalHealthUrl = settings.googleFormKesehatanMentalUrl?.trim() || '';
  const continuationText = uniqueLanjutanUrl
    ? `Silakan gunakan tautan asesmen lanjutan berikut untuk melengkapi data:\n${uniqueLanjutanUrl}`
    : 'Tautan asesmen lanjutan belum dikonfigurasi. Silakan hubungi petugas pendamping untuk mendapatkan tautan yang benar.';
  const mentalHealthText = mentalHealthUrl
    ? `\n\nKuesioner Asesmen Kesehatan Mental (sukarela):\n${mentalHealthUrl}`
    : '';

  return `Halo ${namaResponden}
Selamat ${waktu}

Saya ${senderName} dari ${senderUnit}.

Terima kasih telah mengisi formulir Asesmen Program Atensi Kementerian Sosial Tahap Awal. Pesan ini untuk membantu proses tindak lanjut; status verifikasi data akan diinformasikan setelah diperiksa petugas.

${continuationText}${mentalHealthText}

Tim kami akan melakukan proses verifikasi lebih lanjut. Jika diperlukan asesmen lanjutan atau Anda membutuhkan pendampingan sosial, silakan menghubungi petugas pendamping.

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
