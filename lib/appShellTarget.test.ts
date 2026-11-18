import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUseMobileShell } from './appShellTarget';

const desktop = {
  width: 1440,
  height: 900,
  userAgent: 'Desktop browser',
  platform: 'MacIntel',
  maxTouchPoints: 0,
  coarsePointer: false,
};

test('uses the mobile shell at phone widths', () => {
  assert.equal(shouldUseMobileShell({ ...desktop, width: 390 }), true);
  assert.equal(shouldUseMobileShell({ ...desktop, width: 767 }), true);
});

test('keeps the web shell at desktop widths', () => {
  assert.equal(shouldUseMobileShell(desktop), false);
  assert.equal(shouldUseMobileShell({ ...desktop, width: 768 }), false);
});

test('keeps mobile devices in the mobile shell in landscape', () => {
  assert.equal(
    shouldUseMobileShell({
      ...desktop,
      width: 844,
      height: 390,
      coarsePointer: true,
    }),
    true,
  );
  assert.equal(
    shouldUseMobileShell({
      ...desktop,
      width: 900,
      height: 600,
      userAgent: 'Mozilla/5.0 (iPhone)',
    }),
    true,
  );
});

test('recognizes touch-enabled iPads that identify as Macs', () => {
  assert.equal(
    shouldUseMobileShell({
      ...desktop,
      width: 1024,
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    true,
  );
});
