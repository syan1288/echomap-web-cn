import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileShell = readFileSync(new URL('../mobile/components/MobileShell.tsx', import.meta.url), 'utf8');

test('mobile app gates unauthenticated visitors behind a login screen', () => {
  assert.match(mobileShell, /function LoginScreen/);
  assert.match(mobileShell, /signInWithEmail/);
  assert.match(mobileShell, /!user/);
  assert.doesNotMatch(mobileShell, /\|\| 'echomap-user'/);
});
