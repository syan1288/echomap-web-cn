import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web and mobile login use email/password without phone OTP methods', () => {
  const authPanel = read('../components/AuthPanel.tsx');
  const authContext = read('../context/AuthContext.tsx');
  const mobileShell = read('../mobile/components/MobileShell.tsx');
  const mobileLogin = mobileShell.slice(
    mobileShell.indexOf('function LoginScreen'),
    mobileShell.indexOf('\nfunction BottomNav', mobileShell.indexOf('function LoginScreen'))
  );

  for (const source of [authPanel, authContext, mobileLogin]) {
    assert.doesNotMatch(
      source,
      /signInWithPhoneOtp|verifyPhoneOtp|one-time-code|type=["']tel|phoneCode|sendPhoneCode|verifyPhoneCode/
    );
  }
  assert.match(authPanel, /signInWithEmail/);
  assert.match(mobileLogin, /<AuthPanel mobileLayout onStageChange=\{setAuthStage\} \/>/);
});
