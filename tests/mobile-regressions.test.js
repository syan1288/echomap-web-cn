import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileShell = readFileSync(new URL('../mobile/components/MobileShell.tsx', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../mobile/components/MobileShell.css', import.meta.url), 'utf8');

test('mobile login uses an explicit responsive brand title instead of a generated Tailwind class', () => {
  assert.match(mobileShell, /mobile-brand-title/);
  assert.match(mobileCss, /\.mobile-brand-title\s*\{[\s\S]*font-size:\s*clamp\(/);
  assert.doesNotMatch(mobileShell, /text-\[clamp\(\$\{compact \? '3\.5rem' : '4\.4rem'/);
});

test('mobile settings keeps logout reachable and closes after sign out', () => {
  assert.match(mobileCss, /\.echo-setting-row\s*\{[\s\S]*touch-action:\s*manipulation/);
  assert.match(mobileCss, /\.echo-settings-sheet\s*\{[\s\S]*scroll-padding-bottom:/);
  assert.match(mobileShell, /data-mobile-action="logout"/);
  assert.match(mobileShell, /const handleMobileLogout = useCallback/);
});
