import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWithConcurrency } from './concurrentMap';

test('maps in input order while respecting the concurrency limit', async () => {
  let active = 0;
  let maxActive = 0;

  const values = await mapWithConcurrency([30, 10, 20, 5], 2, async (delay, index) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return `${index}:${delay}`;
  });

  assert.deepEqual(values, ['0:30', '1:10', '2:20', '3:5']);
  assert.equal(maxActive, 2);
});

test('returns an empty result for an empty input', async () => {
  assert.deepEqual(await mapWithConcurrency([], 3, async (value: never) => value), []);
});
