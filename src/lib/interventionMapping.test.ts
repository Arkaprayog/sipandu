import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVENTION_RECOMMENDATION_COLUMN_INDEX,
  readInterventionRecommendationFromRow,
} from './interventionMapping';

function rowWithBE(value: string): string[] {
  const row = Array.from({ length: 60 }, () => '');
  row[INTERVENTION_RECOMMENDATION_COLUMN_INDEX] = value;
  return row;
}

test('reads the intervention/recommendation directly from column BE', () => {
  const headers = Array.from({ length: 60 }, (_, index) => index === 56 ? 'Intervensi & Rekomendasi Tindak Lanjut' : `Kolom ${index + 1}`);
  const value = 'Pendampingan akses nutrisi dan pemantauan berkala';
  assert.equal(readInterventionRecommendationFromRow(headers, rowWithBE(value)), value);
});

test('column BE remains the primary source when a duplicate labelled column exists elsewhere', () => {
  const headers = ['Intervensi & Rekomendasi Tindak Lanjut', ...Array.from({ length: 56 }, () => ''), 'Intervensi & Rekomendasi Tindak Lanjut'];
  const row = rowWithBE('Nilai sumber BE');
  row[0] = 'Nilai kolom lain';
  assert.equal(readInterventionRecommendationFromRow(headers, row), 'Nilai sumber BE');
});

test('falls back to a labelled intervention column only when BE is blank', () => {
  const headers = ['Timestamp', 'Intervensi & Rekomendasi Tindak Lanjut'];
  const row = ['', 'Rujukan layanan dan monitoring lanjutan'];
  assert.equal(readInterventionRecommendationFromRow(headers, row), row[1]);
});

test('returns blank when BE and matching labelled columns have no result', () => {
  const headers = Array.from({ length: 60 }, (_, index) => `Kolom ${index + 1}`);
  assert.equal(readInterventionRecommendationFromRow(headers, rowWithBE('   ')), '');
});
