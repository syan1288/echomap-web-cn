import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeocodeQueries, shouldGeocodeBuildingName } from './geoFromBuildingName.js';

test('geocodes any useful building name instead of requiring a known place word', () => {
  for (const name of ['HKU', '香港大学', '香港维多利亚港', '故宫', '泉州']) {
    assert.equal(shouldGeocodeBuildingName(name), true, name);
    assert.deepEqual(buildGeocodeQueries(name)[0], name);
  }
});

test('skips empty and one-character names', () => {
  assert.equal(shouldGeocodeBuildingName(''), false);
  assert.equal(shouldGeocodeBuildingName(' '), false);
  assert.equal(shouldGeocodeBuildingName('粤'), false);
});
