import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteCustomBuildingStyle,
  loadBuildingStyles,
  saveBuildingStyles,
  upsertBuildingStyle,
} from './buildingStyleStore.ts';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test('loads built-ins and isolates saved styles by user', () => {
  const store = storage();
  const initial = loadBuildingStyles(store, 'a');
  const next = upsertBuildingStyle(initial, {
    id: 'custom-one',
    name: 'Mosaic',
    prompt: 'Mosaic building style',
    builtin: false,
  });
  saveBuildingStyles(store, next, 'a');
  assert.equal(loadBuildingStyles(store, 'a').some((style) => style.id === 'custom-one'), true);
  assert.equal(loadBuildingStyles(store, 'b').some((style) => style.id === 'custom-one'), false);
});

test('updates built-in prompt and deletes only custom styles', () => {
  const initial = loadBuildingStyles(storage(), 'a');
  const updated = upsertBuildingStyle(initial, {
    ...initial[0],
    prompt: 'Edited prompt',
  });
  assert.equal(updated[0].prompt, 'Edited prompt');
  const withCustom = upsertBuildingStyle(updated, {
    id: 'custom-two',
    name: 'Ink remix',
    prompt: 'A remix',
    builtin: false,
  });
  const deleted = deleteCustomBuildingStyle(withCustom, 'custom-two');
  assert.equal(deleted.some((style) => style.id === 'custom-two'), false);
  assert.equal(deleteCustomBuildingStyle(deleted, updated[0].id).some((style) => style.id === updated[0].id), true);
});

test('rejects empty and overlong prompts', () => {
  const initial = loadBuildingStyles(storage(), 'a');
  assert.throws(() => upsertBuildingStyle(initial, { ...initial[0], prompt: ' ' }), /STYLE_PROMPT_REQUIRED/);
  assert.throws(() => upsertBuildingStyle(initial, { ...initial[0], prompt: 'x'.repeat(2001) }), /STYLE_PROMPT_TOO_LONG/);
});
