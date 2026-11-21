import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileShell = readFileSync(new URL('../mobile/components/MobileShell.tsx', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../mobile/components/MobileShell.css', import.meta.url), 'utf8');
const authPanel = readFileSync(new URL('../components/AuthPanel.tsx', import.meta.url), 'utf8');

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

test('short mobile auth stages keep the registration sheet and actions inside the viewport', () => {
  assert.match(mobileShell, /mobile-auth-stage/);
  assert.match(authPanel, /auth-mobile-action/);
  assert.match(authPanel, /height: '39dvh'/);
  assert.match(authPanel, /flex: '0 0 39dvh'/);
  assert.match(authPanel, /auth-mobile-sign-up-sheet/);
  assert.match(mobileShell, /mobile-auth-stage-form flex flex-1 flex-col justify-end/);
  assert.match(mobileCss, /\.auth-mobile-sign-up-sheet \.mobile-auth-action\s*\{[\s\S]*min-height:\s*clamp/);
  assert.match(mobileCss, /@media\s*\(max-width:\s*480px\)\s*and\s*\(max-height:\s*760px\)/);
  assert.match(mobileCss, /\.mobile-shell \.auth-mobile-sheet \.auth-mobile-action/);
  assert.match(mobileCss, /\.mobile-home-screen \.auth-mobile-sheet\s*\{[\s\S]*max-width:\s*none/);
});

test('mobile account switchers stay centered on one line inside the sheet', () => {
  assert.match(authPanel, /max-w-full whitespace-nowrap text-center text-\[clamp\(12px,4vw,16px\)\]/);
});
