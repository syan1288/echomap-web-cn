import assert from 'node:assert/strict';
import test from 'node:test';
import { describeProviderError } from './providerError';

test('keeps only provider status and a recognized error category', () => {
  const detail = describeProviderError(
    'Gemini',
    Object.assign(new Error('internal upstream detail with user content'), {
      status: 500,
      code: 'INTERNAL',
    })
  );

  assert.deepEqual(detail, {
    message: 'Gemini upstream failed (HTTP 500, INTERNAL).',
    status: 500,
    code: 'INTERNAL',
    category: 'internal',
  });
  assert.equal(detail.message.includes('user content'), false);
});

test('classifies provider timeouts without exposing the raw error', () => {
  const detail = describeProviderError('Jimeng', new Error('upstream request timed out'));

  assert.equal(detail.category, 'timeout');
  assert.equal(detail.message, 'Jimeng upstream failed (timeout).');
});
