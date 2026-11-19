import assert from 'node:assert/strict';
import test from 'node:test';
import { JIMENG_PROMPT_MAX_CHARS, buildJimengPrompt } from './jimengPrompt';

test('keeps immutable building constraints while staying within Jimeng prompt limit', () => {
  const prompt = buildJimengPrompt({
    buildingName: 'Demo Building',
    stylePrompt: 'A restrained architectural editorial illustration with crisp geometry.',
  });

  assert.ok(prompt.includes('保留建筑主体轮廓'));
  assert.ok(prompt.includes('去除背景、人物、车辆、天空、地面'));
  assert.ok(prompt.includes('Demo Building'));
  assert.ok(prompt.includes('architectural editorial illustration'));
  assert.ok(prompt.length <= JIMENG_PROMPT_MAX_CHARS);
});

test('truncates oversized user style text without dropping fixed constraints', () => {
  const prompt = buildJimengPrompt({
    stylePrompt: 'x'.repeat(JIMENG_PROMPT_MAX_CHARS * 2),
  });

  assert.ok(prompt.length <= JIMENG_PROMPT_MAX_CHARS);
  assert.ok(prompt.includes('保留建筑主体轮廓'));
  assert.ok(prompt.includes('去除背景、人物、车辆、天空、地面'));
});
