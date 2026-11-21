import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('homepage scroll-for-more cue uses Comfortaa without changing its surrounding section font', () => {
  const cueStart = app.indexOf("{t('scrollForMore')}");
  assert.notEqual(cueStart, -1, 'scroll-for-more text should exist');

  const cueMarkup = app.slice(app.lastIndexOf('<button', cueStart), app.indexOf('</button>', cueStart));
  assert.match(cueMarkup, /fontFamily:\s*['"]"Comfortaa", cursive['"]/);
});
