import test from "node:test";
import assert from "node:assert/strict";
import { buildAggregateSummary } from "./analytics";

test("aggregate summary groups allowed demographics and normalized assistance categories", () => {
  const records = [
    ...Array.from({ length: 5 }, () => ({
      namaLengkap: "Nama Rahasia", nik: "1234567890123456", usia: 22, jenisKelamin: "Laki-laki", kotaDomisili: "Kota Medan", jenisBantuan: "Pemenuhan Nutrisi dan Modal Usaha",
    } as never)),
    ...Array.from({ length: 5 }, () => ({
      namaLengkap: "Nama Lain", usia: 48, jenisKelamin: "Perempuan", kotaDomisili: "Deli Serdang", jenisBantuan: "Bantuan nutrisi dan kewirausahaan",
    })),
  ];
  const services = Array.from({ length: 5 }, () => ({
    nutritionStatus: "diterima", entrepreneurshipStatus: "dibutuhkan", psychosocialStatus: "aktif",
  }));
  const summary = buildAggregateSummary(records, services);

  assert.equal(summary.totalPpks, 10);
  assert.deepEqual(summary.byGender, [
    { gender: "Laki-laki", count: 5 },
    { gender: "Perempuan", count: 5 },
  ]);
  assert.equal(summary.byRegion.find((item) => item.region === "Kota Medan")?.count, 5);
  assert.equal(summary.byRegion.find((item) => item.region === "Kabupaten Deli Serdang")?.count, 5);
  assert.equal(summary.requestedAssistance.find((item) => item.category === "Pemenuhan Nutrisi")?.count, 10);
  assert.equal(summary.requestedAssistance.find((item) => item.category === "Bantuan Kewirausahaan")?.count, 10);
  assert.equal(summary.serviceMonitoring.recordsWithStatus, 5);
  assert.equal(summary.privacy.smallCellThreshold, 5);
});

test("small demographic groups are suppressed without echoing raw values", () => {
  const summary = buildAggregateSummary([
    { usia: "bukan usia", jenisKelamin: "tidak diketahui", kotaDomisili: "Nama alamat pribadi", jenisBantuan: "Catatan bebas yang sangat pribadi" },
    { usia: 20, jenisKelamin: "Perempuan", kotaDomisili: "Medan", jenisBantuan: "Bantuan nutrisi" },
  ], []);
  const output = JSON.stringify(summary);
  assert.equal(summary.dataQuality.missingOrInvalidAge, null);
  assert.equal(summary.dataQuality.unknownGender, null);
  assert.equal(summary.dataQuality.unclassifiedRegion, null);
  assert.equal(summary.byGender.length, 0);
  assert.equal(summary.byRegion.length, 0);
  assert.equal(summary.requestedAssistance.length, 0);
  assert.equal(summary.privacy.smallGroupsSuppressed, true);
  assert.equal(output.includes("Nama alamat pribadi"), false);
  assert.equal(output.includes("Catatan bebas"), false);
  assert.equal(output.includes("tidak diketahui"), false);
});

test("missing service-status rows are not described as aid not received", () => {
  const summary = buildAggregateSummary([{ usia: 30, jenisKelamin: "Laki-laki", kotaDomisili: "Medan" }], []);
  assert.equal(summary.serviceMonitoring.recordsWithStatus, 0);
  assert.match(summary.serviceMonitoring.note, /tidak membuktikan/i);
  assert.equal("notReceived" in summary.serviceMonitoring, false);
});
