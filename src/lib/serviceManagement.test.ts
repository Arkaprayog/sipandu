import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PPKSRecord, PPKSServiceStatus } from '../types';
import {
  calculatePPKSServiceMetrics,
  getInitialPPKSServiceStatus,
  getFollowUpReminderUrgency,
  isFollowUpRequired,
  resolvePPKSServiceStatus,
} from './serviceManagement';

const record = (overrides: Partial<PPKSRecord> = {}): PPKSRecord => ({
  id: 'ppks-001',
  timestamp: '2026-11-08T08:00:00.000Z',
  namaLengkap: 'Responden Satu',
  nik: '1234567890123456',
  usia: 34,
  jenisKelamin: 'Perempuan',
  kotaDomisili: 'Medan',
  alamatLengkap: '',
  noHpWa: '',
  jenisBantuan: '',
  intervensiMental: '',
  desil: 0,
  fotoDiri: '',
  fotoKtp: '',
  statusAsesmen: 'Tahap Awal',
  ...overrides,
});

test('initial service needs are derived only from requested assistance and explicit assessment recommendations', () => {
  const requested = getInitialPPKSServiceStatus(record({ jenisBantuan: 'BANTUAN PEMENUHAN NUTRISI' }));
  assert.equal(requested.nutritionStatus, 'dibutuhkan');
  assert.equal(requested.entrepreneurshipStatus, 'belum-diverifikasi');

  const recommended = getInitialPPKSServiceStatus(record({
    integratedForm: {
      nomorRegistrasi: '', noBpjs: '', statusPernikahan: '', pendidikanTerakhir: '', pekerjaan: '',
      kontakDaruratNama: '', kontakDaruratHubungan: '', kontakDaruratNoHp: '',
      tahunDiagnosa: '', faskesPdpRujukan: '', statusArv: '', regimenArv: '', kepatuhanArv: '',
      nilaiCd4Terakhir: '', viralLoadTerakhir: '', riwayatInfeksiOportunistik: '', kendalaAksesPengobatan: '',
      statusKeterbukaanStatus: '', dukunganKeluarga: '', pengalamanStigmaDiskriminasi: '',
      kondisiTempatTinggal: '', kondisiKelayakanRumah: '', penghasilanBulanan: '',
      pengeluaranKebutuhanObatNutrisi: '', tanggunganKeluarga: 0, kepemilikanUsaha: '',
      minatKeterampilanAtensi: '', desilKemiskinan: 0, skorKecemasan: '', skorDepresi: '',
      penerimaanDiri: '', doronganBunuhDiri: '', kebutuhanKonselingSosial: '',
      rekomendasiBantuanNutrisi: false, rekomendasiBantuanModalUsaha: true,
      rekomendasiBantuanMedisTransport: false, rekomendasiRujukanRehabilitasi: false,
      catatanIntervensiKhusus: '', rencanaAksiPendamping: '', jadwalMonitoringBerikutnya: '',
      namaAsesor: '', nipAsesor: '', supervisorKemensos: '',
    },
  }));
  assert.equal(recommended.entrepreneurshipStatus, 'dibutuhkan');
});

test('stored delivery status takes precedence over inferred request and follow-up remains explicit', () => {
  const input = record({ jenisBantuan: 'BANTUAN KEWIRAUSAHAAN' });
  const stored: PPKSServiceStatus = {
    ...getInitialPPKSServiceStatus(input),
    entrepreneurshipStatus: 'diterima',
    followUpAt: '2026-11-15',
    followUpReason: 'konfirmasi-penerimaan-bantuan',
  };
  const result = resolvePPKSServiceStatus(input, stored);
  assert.equal(result.entrepreneurshipStatus, 'diterima');
  assert.equal(isFollowUpRequired(result), true);
});

test('service metrics use actual statuses and count assistance needs separately', () => {
  const records = [
    record({ id: 'one', jenisBantuan: 'BANTUAN PEMENUHAN NUTRISI' }),
    record({ id: 'two', jenisBantuan: 'BANTUAN KEWIRAUSAHAAN' }),
    record({ id: 'three', jenisBantuan: '' }),
  ];
  const stored = [
    { ...getInitialPPKSServiceStatus(records[0]), nutritionStatus: 'diterima' as const },
    { ...getInitialPPKSServiceStatus(records[1]), entrepreneurshipStatus: 'dalam-proses' as const },
  ];
  const metrics = calculatePPKSServiceMetrics(records, stored);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.nutritionReceived, 1);
  assert.equal(metrics.nutritionNeeds, 0);
  assert.equal(metrics.entrepreneurshipNeeds, 1);
  assert.equal(metrics.nutritionUnverified, 2);
  assert.equal(metrics.followUpRequired, 1);
});


test('does not classify explicit negative recommendations as a need', () => {
  const negative = record({
    officialAssessment: {
      rekomendasiBantuanNutrisi: 'Tidak direkomendasikan',
      rekomendasiBantuanModalUsaha: 'Tidak',
    },
  });
  const status = getInitialPPKSServiceStatus(negative);
  assert.equal(status.nutritionStatus, 'belum-diverifikasi');
  assert.equal(status.entrepreneurshipStatus, 'belum-diverifikasi');
});


test('follow-up reminders distinguish overdue, due today, upcoming, unscheduled, and invalid dates', () => {
  const base = getInitialPPKSServiceStatus(record({ jenisBantuan: 'BANTUAN PEMENUHAN NUTRISI' }));
  assert.equal(getFollowUpReminderUrgency({ ...base, followUpAt: '2026-11-08', followUpReason: 'monitoring-pendampingan' }, '2026-11-09'), 'overdue');
  assert.equal(getFollowUpReminderUrgency({ ...base, followUpAt: '2026-11-09', followUpReason: 'monitoring-pendampingan' }, '2026-11-09'), 'today');
  assert.equal(getFollowUpReminderUrgency({ ...base, followUpAt: '2026-11-16', followUpReason: 'monitoring-pendampingan' }, '2026-11-09'), 'upcoming');
  assert.equal(getFollowUpReminderUrgency({ ...base, followUpAt: '', followUpReason: '' }, '2026-11-09'), 'unscheduled');
  assert.equal(getFollowUpReminderUrgency({ ...base, followUpAt: '2026-02-30', followUpReason: 'monitoring-pendampingan' }, '2026-11-09'), 'none');
  assert.equal(getFollowUpReminderUrgency({ ...getInitialPPKSServiceStatus(record()), followUpAt: '', followUpReason: '' }, '2026-11-09'), 'none');
});
