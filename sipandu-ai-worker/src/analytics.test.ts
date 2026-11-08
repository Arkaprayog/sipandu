import test from "node:test";
import assert from "node:assert/strict";
import { buildAggregateSummary } from "./analytics";

test("aggregate summary groups demographics and safe assistance categories", () => {
  const summary = buildAggregateSummary([
    { namaLengkap: "Nama Rahasia", nik: "1234567890123456", usia: 22, jenisKelamin: "Laki-laki", kotaDomisili: "Kota Medan", jenisBantuan: "Pemenuhan Nutrisi dan Modal Usaha" } as never,
    { namaLengkap: "Nama Lain", usia: 48, jenisKelamin: "Perempuan", kotaDomisili: "Deli Serdang", jenisBantuan: "Bantuan nutrisi" },
    { usia: 70, jenisKelamin: "Perempuan", kotaDomisili: "Kota Binjai", jenisBantuan: "Bantuan kewirausahaan" },
  ], [{ nutritionStatus: "diterima", entrepreneurshipStatus: "dibutuhkan", psychosocialStatus: "aktif" }]);

  assert.equal(summary.totalPpks, 3);
  assert.deepEqual(summary.byGender, [
    { gender: "Perempuan", count: 2 },
    { gender: "Laki-laki", count: 1 },
  ]);
  assert.equal(summary.byRegion.find((item) => item.region === "Kota Medan")?.count, 1);
  assert.equal(summary.byRegion.find((item) => item.region === "Kabupaten Deli Serdang")?.count, 1);
  assert.equal(summary.requestedAssistance.find((item) => item.category === "Pemenuhan Nutrisi")?.count, 2);
  assert.equal(summary.requestedAssistance.find((item) => item.category === "Bantuan Kewirausahaan")?.count, 2);
  assert.equal(summary.serviceMonitoring.recordsWithStatus, 1);
});

test("unknown region and invalid demographics are counted without echoing raw values", () => {
  const summary = buildAggregateSummary([
    { usia: "bukan usia", jenisKelamin: "tidak diketahui", kotaDomisili: "Nama alamat pribadi", jenisBantuan: "Catatan bebas yang sangat pribadi" },
  ], []);
  const output = JSON.stringify(summary);
  assert.equal(summary.dataQuality.missingOrInvalidAge, 1);
  assert.equal(summary.dataQuality.unknownGender, 1);
  assert.equal(summary.dataQuality.unclassifiedRegion, 1);
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
