import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleDeadline } from './cloudSyncDeadline';

test('runs the callback when cloud sync exceeds its deadline', async () => {
  let elapsed = false;
  const cancel = scheduleDeadline(() => {
    elapsed = true;
  }, 5);

  await new Promise((resolve) => setTimeout(resolve, 15));
  cancel();

  assert.equal(elapsed, true);
});

test('cancels the deadline when cloud sync finishes first', async () => {
  let elapsed = false;
  const cancel = scheduleDeadline(() => {
    elapsed = true;
  }, 10);

  cancel();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(elapsed, false);
});
