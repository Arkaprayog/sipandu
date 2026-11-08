import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregatePPKSByRegion } from './regionalIntelligence';

test('aggregates recorded domicile into 33 administrative districts without individual coordinates', () => {
  const result = aggregatePPKSByRegion([
    { kotaDomisili: 'Kab. Nias' },
    { kotaDomisili: 'Kota Medan, Sumatera Utara' },
    { kotaDomisili: 'Kabupaten Nias Selatan' },
    { kotaDomisili: 'Kabupaten Deli Serdang' },
    { kotaDomisili: 'Wilayah tidak dikenali' },
    { kotaDomisili: '' },
  ]);

  assert.equal(result.regions.length, 33);
  assert.equal(result.matchedRecords, 4);
  assert.equal(result.unmatchedRecords, 1);
  assert.equal(result.missingRegionRecords, 1);
  assert.equal(result.regions.find((item) => item.id === 'nias')?.count, 1);
  assert.equal(result.regions.find((item) => item.id === 'niasselatan')?.count, 1);
  assert.equal(result.regions.find((item) => item.id === 'medan')?.count, 1);
  assert.equal(result.regions.find((item) => item.id === 'deliserdang')?.count, 1);
});

test('does not count blank or unknown region as a mapped administrative area', () => {
  const result = aggregatePPKSByRegion([
    { kotaDomisili: 'Kab. Xyz' },
    { kotaDomisili: '   ' },
  ]);
  assert.equal(result.regions.reduce((sum, item) => sum + item.count, 0), 0);
  assert.equal(result.unmatchedRecords, 1);
  assert.equal(result.missingRegionRecords, 1);
});
