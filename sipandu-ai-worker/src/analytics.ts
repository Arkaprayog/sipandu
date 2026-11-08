export interface DemographicRecord {
  usia?: unknown;
  jenisKelamin?: unknown;
  kotaDomisili?: unknown;
  jenisBantuan?: unknown;
}
export interface ServiceStatusRecord {
  nutritionStatus?: unknown;
  entrepreneurshipStatus?: unknown;
  psychosocialStatus?: unknown;
}
export interface SIPANDUAggregateSummary {
  generatedAt: string;
  scope: string;
  totalPpks: number;
  byRegion: Array<{ region: string; count: number }>;
  byAgeGroup: Array<{ group: string; count: number }>;
  byGender: Array<{ gender: string; count: number }>;
  requestedAssistance: Array<{ category: string; count: number }>;
  serviceMonitoring: {
    recordsWithStatus: number;
    nutrition: Array<{ status: string; count: number }>;
    entrepreneurship: Array<{ status: string; count: number }>;
    psychosocial: Array<{ status: string; count: number }>;
    note: string;
  };
  dataQuality: {
    missingOrInvalidAge: number | null;
    unknownGender: number | null;
    unclassifiedRegion: number | null;
  };
  privacy: {
    smallCellThreshold: number;
    smallGroupsSuppressed: boolean;
    note: string;
  };
  truncated: boolean;
}

const NORTH_SUMATRA_REGIONS = [
  "Asahan", "Batubara", "Dairi", "Deli Serdang", "Humbang Hasundutan", "Karo",
  "Labuhanbatu", "Labuhanbatu Selatan", "Labuhanbatu Utara", "Langkat",
  "Mandailing Natal", "Nias", "Nias Barat", "Nias Selatan", "Nias Utara",
  "Padang Lawas", "Padang Lawas Utara", "Pakpak Bharat", "Samosir",
  "Serdang Bedagai", "Simalungun", "Tapanuli Selatan", "Tapanuli Tengah",
  "Tapanuli Utara", "Toba",
] as const;
const NORTH_SUMATRA_CITIES = [
  "Binjai", "Gunungsitoli", "Medan", "Padangsidimpuan",
  "Pematangsiantar", "Sibolga", "Tanjungbalai", "Tebing Tinggi",
] as const;

const normalizeKey = (value: unknown): string =>
  String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");

function normalizeRegion(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 80) return null;
  const key = normalizeKey(raw.replace(/^(kabupaten|kab\.?|kota)\s*/i, ""));
  const district = NORTH_SUMATRA_REGIONS.find((item) => normalizeKey(item) === key);
  if (district) return "Kabupaten " + district;
  const city = NORTH_SUMATRA_CITIES.find((item) => normalizeKey(item) === key);
  if (city) return "Kota " + city;
  return null;
}

function assistanceCategories(value: unknown): string[] {
  const text = String(value ?? "").toLowerCase();
  if (!text.trim()) return [];
  const categories: string[] = [];
  if (/(nutrisi|gizi|sembako|pangan|makanan|protein)/i.test(text)) categories.push("Pemenuhan Nutrisi");
  if (/(wirausaha|kewirausahaan|modal\s*usaha|usaha|keterampilan|ekonomi)/i.test(text)) categories.push("Bantuan Kewirausahaan");
  if (/(medis|kesehatan|transport|rujukan|obat)/i.test(text)) categories.push("Bantuan Medis/Transportasi");
  if (/(psikososial|konseling|terapi|pendampingan\s*mental)/i.test(text)) categories.push("Pendampingan Psikososial");
  return categories.length ? categories : ["Kategori Lainnya"];
}

const SMALL_CELL_THRESHOLD = 5;
function countEntries(values: string[]): { entries: Array<{ label: string; count: number }>; suppressed: boolean } {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const all = [...counts.entries()].map(([label, count]) => ({ label, count }));
  return {
    entries: all
      .filter((entry) => entry.count >= SMALL_CELL_THRESHOLD)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id")),
    suppressed: all.some((entry) => entry.count < SMALL_CELL_THRESHOLD),
  };
}
function safeMetric(value: number): number | null {
  return value > 0 && value < SMALL_CELL_THRESHOLD ? null : value;
}
function statusCounts(records: ServiceStatusRecord[], field: keyof ServiceStatusRecord): { entries: Array<{ status: string; count: number }>; suppressed: boolean } {
  const values = records.map((record) => String(record[field] ?? "").trim()).filter(Boolean);
  const result = countEntries(values);
  return {
    entries: result.entries.map(({ label, count }) => ({ status: label, count })),
    suppressed: result.suppressed,
  };
}

/** Builds aggregate-only context; never returns names, NIK, contacts, photos, addresses or clinical fields. */
export function buildAggregateSummary(
  records: DemographicRecord[],
  serviceRecords: ServiceStatusRecord[],
  options: { generatedAt?: string; scope?: string; truncated?: boolean } = {},
): SIPANDUAggregateSummary {
  const regions: string[] = [];
  const ageGroups: string[] = [];
  const genders: string[] = [];
  const assistance: string[] = [];
  let missingOrInvalidAge = 0;
  let unknownGender = 0;
  let unclassifiedRegion = 0;

  for (const record of records) {
    const region = normalizeRegion(record.kotaDomisili);
    if (region) regions.push(region);
    else unclassifiedRegion += 1;

    const age = Number(record.usia);
    if (Number.isInteger(age) && age >= 0 && age <= 120) {
      ageGroups.push(
        age <= 17 ? "0–17 tahun" :
        age <= 24 ? "18–24 tahun" :
        age <= 44 ? "25–44 tahun" :
        age <= 59 ? "45–59 tahun" : "60 tahun ke atas",
      );
    } else {
      missingOrInvalidAge += 1;
    }

    const gender = normalizeKey(record.jenisKelamin);
    if (gender === "lakilaki" || gender === "l") genders.push("Laki-laki");
    else if (gender === "perempuan" || gender === "p") genders.push("Perempuan");
    else unknownGender += 1;

    assistance.push(...assistanceCategories(record.jenisBantuan));
  }

  const regionCounts = countEntries(regions);
  const ageCounts = countEntries(ageGroups);
  const genderCounts = countEntries(genders);
  const aidCounts = countEntries(assistance);
  const nutritionCounts = statusCounts(serviceRecords, "nutritionStatus");
  const entrepreneurshipCounts = statusCounts(serviceRecords, "entrepreneurshipStatus");
  const psychosocialCounts = statusCounts(serviceRecords, "psychosocialStatus");
  const smallGroupsSuppressed = [
    regionCounts.suppressed, ageCounts.suppressed, genderCounts.suppressed, aidCounts.suppressed,
    nutritionCounts.suppressed, entrepreneurshipCounts.suppressed, psychosocialCounts.suppressed,
    missingOrInvalidAge > 0 && missingOrInvalidAge < SMALL_CELL_THRESHOLD,
    unknownGender > 0 && unknownGender < SMALL_CELL_THRESHOLD,
    unclassifiedRegion > 0 && unclassifiedRegion < SMALL_CELL_THRESHOLD,
    serviceRecords.length > 0 && serviceRecords.length < SMALL_CELL_THRESHOLD,
  ].some(Boolean);

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    scope: options.scope || "Seluruh data yang diizinkan oleh Firestore Security Rules",
    totalPpks: records.length,
    byRegion: regionCounts.entries.map(({ label, count }) => ({ region: label, count })),
    byAgeGroup: ageCounts.entries.map(({ label, count }) => ({ group: label, count })),
    byGender: genderCounts.entries.map(({ label, count }) => ({ gender: label, count })),
    requestedAssistance: aidCounts.entries.map(({ label, count }) => ({ category: label, count })),
    serviceMonitoring: {
      recordsWithStatus: safeMetric(serviceRecords.length),
      nutrition: nutritionCounts.entries,
      entrepreneurship: entrepreneurshipCounts.entries,
      psychosocial: psychosocialCounts.entries,
      note: "Tidak adanya catatan status tidak membuktikan bahwa bantuan belum diterima. Hanya status yang tercatat yang dihitung. Kategori permintaan bantuan dapat tumpang tindih karena satu PPKS dapat meminta lebih dari satu jenis bantuan.",
    },
    dataQuality: {
      missingOrInvalidAge: safeMetric(missingOrInvalidAge),
      unknownGender: safeMetric(unknownGender),
      unclassifiedRegion: safeMetric(unclassifiedRegion),
    },
    privacy: {
      smallCellThreshold: SMALL_CELL_THRESHOLD,
      smallGroupsSuppressed,
      note: "Kategori dengan jumlah 1–4 disembunyikan untuk mengurangi risiko identifikasi melalui kelompok kecil. Kategori yang disembunyikan bukan berarti nol.",
    },
    truncated: options.truncated === true,
  };
}
