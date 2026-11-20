import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileShell = readFileSync(new URL('../mobile/components/MobileShell.tsx', import.meta.url), 'utf8');

test('mobile app gates unauthenticated visitors behind a login screen', () => {
  assert.match(mobileShell, /function LoginScreen/);
  assert.match(mobileShell, /<AuthPanel \/>/);
  assert.match(mobileShell, /!user/);
  assert.doesNotMatch(mobileShell, /\|\| 'echomap-user'/);
});

test('mobile login reuses the web auth panel without mobile navigation chrome', () => {
  assert.match(mobileShell, /import \{ AuthPanel \} from '..\/\.\.\/components\/AuthPanel'/);
  assert.match(mobileShell, /<AuthPanel \/>/);
  assert.doesNotMatch(mobileShell, /rounded-\[22px\].*bg-white\/80/);
});
