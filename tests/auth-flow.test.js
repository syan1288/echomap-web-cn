import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('auth panel exposes the requested sign-in, sign-up, Google, OTP, and reset states', () => {
  const authPanel = read('../components/AuthPanel.tsx');

  assert.match(authPanel, /authSignInOrSignUp/);
  assert.match(authPanel, /authSignInWithAnotherAccount/);
  assert.match(authPanel, /authSignUpWithEmail/);
  assert.match(authPanel, /authGetVerificationCode/);
  assert.match(authPanel, /authGoogle/);
  assert.match(authPanel, /authVerificationCode/);
  assert.match(authPanel, /60/);
  assert.match(authPanel, /authCheckEmailToReset/);
});

test('auth context uses real Supabase recovery, email verification, and Google OAuth APIs', () => {
  const authContext = read('../context/AuthContext.tsx');

  assert.match(authContext, /resetPasswordForEmail/);
  assert.match(authContext, /signInWithOtp/);
  assert.match(authContext, /verifyOtp/);
  assert.match(authContext, /signInWithOAuth/);
});

test('travel log calls the feeling field mood instead of moon', () => {
  const travelLog = read('../components/TravelLogModal.tsx');

  assert.match(travelLog, /mood/);
  assert.doesNotMatch(travelLog, /label htmlFor="m02-moon"/);
});
