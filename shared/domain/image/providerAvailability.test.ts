import assert from 'node:assert/strict';
import test from 'node:test';
import { isGeminiProviderAvailable } from './providerAvailability.js';

test('does not mark Vertex Gemini available when credentials cannot be loaded', () => {
  assert.equal(
    isGeminiProviderAvailable(true, { mode: 'vertex', ok: false }),
    false
  );
});

test('marks Gemini available when its configured credentials pass the probe', () => {
  assert.equal(
    isGeminiProviderAvailable(true, { mode: 'vertex', ok: true }),
    true
  );
  assert.equal(
    isGeminiProviderAvailable(true, { mode: 'apiKey', ok: true }),
    true
  );
});

test('does not mark Gemini available without a configured client', () => {
  assert.equal(
    isGeminiProviderAvailable(false, { mode: 'apiKey', ok: true }),
    false
  );
});
