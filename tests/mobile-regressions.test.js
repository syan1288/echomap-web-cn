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

test('mobile account supports resilient avatar uploads', () => {
  assert.match(mobileShell, /htmlFor="mobile-avatar-upload"/);
  assert.match(mobileShell, /id="mobile-avatar-upload"/);
  assert.match(mobileShell, /canvas\.toDataURL\('image\/jpeg', 0\.82\)/);
  assert.match(mobileShell, /Keep the in-memory avatar visible/);
});

test('mobile map keeps language and help with the four circular controls', () => {
  assert.match(mobileShell, /const \{ language, toggleLanguage \} = useLocalization\(\);/);
  assert.match(mobileShell, /copy\.switchToChinese/);
  assert.match(mobileShell, /copy\.switchToEnglish/);
  assert.match(mobileShell, /copy\.showHelp/);
  assert.match(mobileShell, /setShowHelpModal\(true\)/);
  assert.match(mobileShell, /absolute right-3 z-10 flex gap-\[10px\]/);
});

test('short mobile auth stages keep the registration sheet and actions inside the viewport', () => {
  assert.match(mobileShell, /mobile-auth-stage/);
  assert.match(authPanel, /auth-mobile-action/);
  assert.match(authPanel, /height: '39dvh'/);
  assert.match(authPanel, /flex: '0 0 39dvh'/);
  assert.match(authPanel, /auth-mobile-sign-up-sheet/);
  assert.match(mobileShell, /absolute inset-x-0 bottom-0 z-20/);
  assert.match(mobileCss, /\.auth-mobile-sign-up-sheet \.mobile-auth-action\s*\{[\s\S]*min-height:\s*clamp/);
  assert.match(mobileCss, /@media\s*\(max-width:\s*480px\)\s*and\s*\(max-height:\s*760px\)/);
  assert.match(mobileCss, /\.mobile-shell \.auth-mobile-sheet \.auth-mobile-action/);
  assert.match(mobileCss, /\.mobile-home-screen \.auth-mobile-sheet\s*\{[\s\S]*max-width:\s*none/);
});

test('mobile auth overlay preserves the full brand layer behind the sheet', () => {
  assert.match(mobileShell, /h-\[100dvh\].*overflow-hidden/);
  assert.match(mobileShell, /<BrandBlock showSubtitle \/>/);
  assert.match(mobileShell, /authStage === 'welcome' \? 'max-w-\[360px\]/);
});

test('mobile account switchers stay centered on one line inside the sheet', () => {
  assert.match(authPanel, /max-w-full whitespace-nowrap text-center text-\[clamp\(12px,4vw,16px\)\]/);
});
