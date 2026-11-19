import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleServiceAccountJson } from './googleServiceAccount.js';

test('parses inline service account credentials without exposing unrelated fields', () => {
  assert.deepEqual(
    parseGoogleServiceAccountJson(
      JSON.stringify({
        type: 'service_account',
        project_id: 'echo-map',
        client_email: 'echo@example.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n',
        client_id: 'do-not-forward',
      })
    ),
    {
      project_id: 'echo-map',
      client_email: 'echo@example.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n',
    }
  );
});

test('returns null when no inline credentials are configured', () => {
  assert.equal(parseGoogleServiceAccountJson(undefined), null);
});

test('rejects malformed inline credentials', () => {
  assert.throws(
    () => parseGoogleServiceAccountJson('{"client_email":"echo@example.com"}'),
    /missing private_key/
  );
});
