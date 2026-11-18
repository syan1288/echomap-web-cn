import assert from 'node:assert/strict';
import test from 'node:test';
import { describeProviderError, getProviderErrorRuntimeInfo } from './providerError';

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

test('exposes safe runtime error metadata without paths or messages', () => {
  const cause = Object.assign(new Error('/private/service-account.json'), {
    code: 'ENOENT',
    syscall: 'open',
    path: '/private/service-account.json',
  });
  const error = Object.assign(new Error('request failed'), { cause });

  assert.deepEqual(getProviderErrorRuntimeInfo(error), {
    errorName: 'Error',
    syscall: null,
    causeName: 'Error',
    causeCode: 'ENOENT',
    causeSyscall: 'open',
  });
  assert.equal(JSON.stringify(getProviderErrorRuntimeInfo(error)).includes('/private'), false);
  assert.equal(JSON.stringify(getProviderErrorRuntimeInfo(error)).includes('request failed'), false);
});
