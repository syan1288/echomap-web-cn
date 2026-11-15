import assert from 'node:assert/strict';
import test from 'node:test';
import { getBearerToken } from './authUser.js';

test('getBearerToken extracts bearer token from string header', () => {
  assert.equal(getBearerToken({ authorization: 'Bearer abc.def' }), 'abc.def');
});

test('getBearerToken extracts bearer token from array header', () => {
  assert.equal(getBearerToken({ authorization: ['Basic nope', 'Bearer token-123'] }), 'token-123');
});

test('getBearerToken rejects missing or non-bearer headers', () => {
  assert.equal(getBearerToken({}), null);
  assert.equal(getBearerToken({ authorization: 'Basic nope' }), null);
});
