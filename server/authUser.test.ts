import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthenticatedUser, getBearerToken } from './authUser.js';

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

test('server auth verifies sessions with the Supabase publishable key', async () => {
  const originalFetch = globalThis.fetch;
  let requestHeaders: HeadersInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestHeaders = init?.headers;
    return new Response(JSON.stringify({ id: 'user-publishable-key' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await getAuthenticatedUser(
      { authorization: 'Bearer session-token' },
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      },
    );

    assert.deepEqual(result, { ok: true, userId: 'user-publishable-key' });
    assert.deepEqual(requestHeaders, {
      apikey: 'sb_publishable_test_key',
      Authorization: 'Bearer session-token',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
