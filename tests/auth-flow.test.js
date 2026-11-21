import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('auth panel exposes the requested sign-in, sign-up, Google, OTP, and reset states', () => {
  const authPanel = read('../components/AuthPanel.tsx');

  assert.match(authPanel, /authSignInOrSignUp/);
  assert.match(authPanel, /authSignInWithAnotherAccount/);
  assert.match(authPanel, /authSignUpWithEmail/);
  assert.match(authPanel, /authGetCode/);
  assert.match(authPanel, /authResend/);
  assert.match(authPanel, /setCodeSeconds\(60\)/);
  assert.match(authPanel, /codeSentForEmail === email\.trim\(\)[\s\S]*?t\('authResend'\)/);
  assert.match(authPanel, /authGoogle/);
  assert.match(authPanel, /authVerificationCode/);
  assert.match(authPanel, /60/);
  assert.match(authPanel, /authCheckEmailToResetCountdown/);
  assert.match(authPanel, /authGoogleNotConfigured/);
  assert.match(authPanel, /onClick=\{\(\) => go\('emailSignIn'\)\}/);
});

test('auth context uses real Supabase recovery, email verification, and Google OAuth APIs', () => {
  const authContext = read('../context/AuthContext.tsx');

  assert.match(authContext, /resetPasswordForEmail/);
  assert.match(authContext, /signInWithOtp/);
  assert.match(authContext, /verifyOtp/);
  assert.match(authContext, /signInWithOAuth/);
  assert.match(authContext, /provider is not enabled/);
});

test('forget password sends recovery email inline and shows a translated 60-second cooldown', () => {
  const authPanel = read('../components/AuthPanel.tsx');
  const translations = read('../localization/translations.ts');

  assert.match(authPanel, /const handleRequestPasswordReset = \(\) => \{[\s\S]*?requestPasswordReset\(email\)[\s\S]*?setPasswordResetSeconds\(60\)/);
  assert.match(authPanel, /passwordResetSeconds > 0[\s\S]*?authCheckEmailToResetCountdown[\s\S]*?authForgetPassword/);
  assert.match(authPanel, /onClick=\{handleRequestPasswordReset\}/);
  assert.doesNotMatch(authPanel, /onClick=\{\(\) => go\('resetPassword'\)\}/);
  assert.doesNotMatch(authPanel, /if \(mobileLayout && !passwordRecovery\)/);
  assert.match(translations, /authCheckEmailToResetCountdown:[\s\S]*?Check your email to reset your password · \{\{seconds\}\}s[\s\S]*?请查收邮件以重置密码 · \{\{seconds\}\}秒/);
  assert.doesNotMatch(authPanel, /authCheckEmailToReset[\s\S]{0,200}authContinue/);
});

test('remembered accounts use passwordless OTP sign-in without creating another account', () => {
  const authPanel = read('../components/AuthPanel.tsx');
  const authContext = read('../context/AuthContext.tsx');

  assert.match(authContext, /sendEmailSignInCode/);
  assert.match(authContext, /shouldCreateUser:\s*false/);
  assert.match(authPanel, /emailSignInCode/);
  assert.match(authPanel, /handleRememberedSignIn/);
});

test('web sidebar auth overlay is translucent, centered, full-height, and keeps 20px navigation labels', () => {
  const authPanel = read('../components/AuthPanel.tsx');
  const sidebar = read('../components/EchoSidebar.tsx');

  assert.match(sidebar, /flex-\[0_0_35%\][^"]*-mb-\[2\.5vh\]/);
  assert.match(sidebar, /bg-white\/60/);
  assert.match(sidebar, /backdrop-blur/);
  assert.match(sidebar, /footerHasSurface \? 'bg-white\/60 backdrop-blur-md' : 'bg-transparent'/);
  assert.match(sidebar, /flex-col overflow-hidden rounded-t-\[2rem\]/);
  assert.equal((sidebar.match(/text-\[20px\]/g) ?? []).length >= 2, true);
  assert.match(authPanel, /auth-embedded-panel min-h-0 flex-1 justify-center/);
  assert.match(authPanel, /embedded \? 'text-left text-\[1\.4rem\]'/);
  assert.match(authPanel, /min-h-\[2\.9rem\] rounded-\[10px\] bg-white px-4/);
  assert.match(authPanel, /authSignUpWithGoogle/);
  assert.match(authPanel, /embedded \? 'mt-3 grid w-full grid-cols-2 gap-3 pt-0' : 'mt-auto grid w-full grid-cols-2 gap-10 pt-10'/);
});

test('embedded saved-account chooser keeps alternate-account action with the shared feedback footer', () => {
  const authPanel = read('../components/AuthPanel.tsx');

  assert.match(authPanel, /my-auto flex w-full flex-col \$\{embedded \? 'gap-3' : 'gap-4'\}/);
  assert.match(authPanel, /authSignInWithAnotherAccountButton/);
  assert.match(authPanel, /auth-feedback-footer/);
});

test('all mobile auth feedback shares one reserved bottom area and a consistent 16px font', () => {
  const authPanel = read('../components/AuthPanel.tsx');

  assert.match(authPanel, /auth-feedback-footer/);
  assert.match(authPanel, /min-h-\[3rem\] w-full shrink-0/);
  assert.match(authPanel, /text-\[16px\] leading-snug/);
  assert.match(authPanel, /auth-feedback-footer[\s\S]*?hint && \([\s\S]*?className=\{AUTH_FEEDBACK_CLASS\}/);
  assert.doesNotMatch(authPanel, /hint && !hintAtChooserFooter/);
});

test('sign-in chooser stacks remembered and alternate email choices and provides a sign-up escape', () => {
  const authPanel = read('../components/AuthPanel.tsx');
  const translations = read('../localization/translations.ts');
  const chooserStart = authPanel.indexOf('const renderSignInChooser');
  const chooserEnd = authPanel.indexOf('const renderEmailSignUp', chooserStart);
  const signInChooser = authPanel.slice(chooserStart, chooserEnd);

  assert.match(signInChooser, /recentEmail/);
  assert.match(signInChooser, /authSignInWithAnotherAccountButton/);
  assert.match(signInChooser, /authBack/);
  assert.match(signInChooser, /authSubmitSignIn/);
  assert.match(signInChooser, /authDontHaveAccountLabel/);
  assert.match(signInChooser, /authSignUpAction/);
  assert.match(translations, /authDontHaveAccountLabel: \{ en: 'Don’t have an account\?', zh:/);
});

test('sign-up chooser offers email and Google signup as direct actions with back and sign-in routes', () => {
  const authPanel = read('../components/AuthPanel.tsx');
  const translations = read('../localization/translations.ts');
  const chooserStart = authPanel.indexOf("case 'signUpChooser':");
  const chooserEnd = authPanel.indexOf("case 'emailSignUp':", chooserStart);
  const signUpChooser = authPanel.slice(chooserStart, chooserEnd);

  assert.match(signUpChooser, /authSignUpWithEmail/);
  assert.match(signUpChooser, /authSignUpWithGoogle/);
  assert.match(signUpChooser, /onClick=\{handleGoogle\}/);
  assert.match(signUpChooser, /authBack/);
  assert.match(signUpChooser, /authAlreadyHaveAccountLabel/);
  assert.match(signUpChooser, /authSignInAction/);
  assert.doesNotMatch(signUpChooser, /authOr/);
  assert.match(translations, /authSignUpWithGoogle: \{ en: 'Or sign up with Google', zh:/);
});

test('travel log calls the feeling field mood instead of moon', () => {
  const travelLog = read('../components/TravelLogModal.tsx');

  assert.match(travelLog, /mood/);
  assert.doesNotMatch(travelLog, /label htmlFor="m02-moon"/);
});
