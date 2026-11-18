import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInitialLanguage } from './LocalizationContext';

test('defaults new visits to English', () => {
  assert.equal(resolveInitialLanguage(null), 'en');
  assert.equal(resolveInitialLanguage(undefined), 'en');
  assert.equal(resolveInitialLanguage('other'), 'en');
});

test('preserves an explicitly saved language', () => {
  assert.equal(resolveInitialLanguage('en'), 'en');
  assert.equal(resolveInitialLanguage('zh'), 'zh');
});
