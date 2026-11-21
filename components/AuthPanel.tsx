import React, { useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { useAuth, type AuthResult } from '../context/AuthContext';

export interface AuthPanelProps {
  onPullFromCloud?: () => void | Promise<void>;
  onPushAllToCloud?: () => void | Promise<void>;
  cloudBusy?: boolean;
}

const BRAND_BLUE = '#0053D4';
const ICON_STROKE = 1.5;
const RECENT_EMAIL_KEY = 'echomap-recent-auth-email';

type AuthStage =
  | 'welcome'
  | 'signInChooser'
  | 'emailSignIn'
  | 'signUpChooser'
  | 'emailSignUp'
  | 'setPassword'
  | 'resetPassword';

type InputType = 'email' | 'password' | 'text';

function readRecentEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(RECENT_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveRecentEmail(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_EMAIL_KEY, email.trim());
  } catch {
    // Local storage is optional; authentication still works without it.
  }
}

function IconArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="m4 8 8 6 8-6" />
    </svg>
  );
}

function IconPassword() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="11" r="4" />
      <path d="m13 14 7 7" />
    </svg>
  );
}

function GlassInput({
  type,
  value,
  onChange,
  placeholder,
  leftIcon,
  onSubmit,
  showSubmit = false,
  autoComplete,
  submitLabel,
}: {
  type: InputType;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  leftIcon?: React.ReactNode;
  onSubmit?: () => void;
  showSubmit?: boolean;
  autoComplete?: string;
  submitLabel?: string;
}) {
  return (
    <div
      className="flex min-h-11 w-full items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 backdrop-blur-md"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)' }}
    >
      {leftIcon && <span className="shrink-0 text-black">{leftIcon}</span>}
      <input
        type={type}
        autoComplete={autoComplete ?? (type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#1d1d1d] outline-none placeholder:text-black/50"
        style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.();
        }}
      />
      {showSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-black/5"
          aria-label={submitLabel}
        >
          <IconArrow />
        </button>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-4 text-[13px] transition-colors';
  const styles = {
    primary: {
      background: BRAND_BLUE,
      color: '#fff',
      borderColor: BRAND_BLUE,
    },
    secondary: {
      background: 'rgba(255,255,255,0.72)',
      color: '#111',
      borderColor: 'rgba(255,255,255,0.8)',
    },
    quiet: {
      background: 'transparent',
      color: BRAND_BLUE,
      borderColor: 'transparent',
    },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:brightness-95'}`}
      style={{
        ...styles,
        fontFamily: '"Roboto Mono", ui-monospace, monospace',
        fontWeight: variant === 'primary' ? 500 : 400,
        boxShadow: variant === 'primary' ? '0 1px 0 rgba(255,255,255,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.45)',
      }}
    >
      {children}
    </button>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-[12px]"
      style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
    >
      <IconBack />
      {label}
    </button>
  );
}

function translateAuthResult(result: AuthResult, t: (key: string) => string): string | null {
  if ('message' in result) {
    switch (result.message) {
      case 'Please enter your email':
        return t('authEmailRequired');
      case 'Please enter email and password':
        return t('authEmailPasswordRequired');
      case 'Please enter your email and verification code':
      case 'Please enter the verification code':
        return t('authCodeRequired');
      case 'Password must be at least 6 characters':
        return t('authPasswordMinLength');
      case 'Invalid login credentials':
      case 'Email or password is incorrect':
        return t('authInvalidCredentials');
      default:
        return result.message;
    }
  }
  return null;
}

export const AuthPanel: React.FC<AuthPanelProps> = () => {
  const { t } = useLocalization();
  const {
    configured,
    loading,
    user,
    passwordRecovery,
    signInWithEmail,
    sendEmailSignupCode,
    verifyEmailSignupCode,
    setPasswordForCurrentUser,
    requestPasswordReset,
    signInWithGoogle,
    clearPasswordRecovery,
    signOut,
  } = useAuth();

  const [stage, setStage] = useState<AuthStage>('welcome');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [codeSeconds, setCodeSeconds] = useState(0);
  const recentEmail = useMemo(() => readRecentEmail(), []);

  useEffect(() => {
    if (passwordRecovery) {
      setEmail(user?.email ?? '');
      setPassword('');
      setHint(null);
      setStage('resetPassword');
    }
  }, [passwordRecovery, user?.email]);

  useEffect(() => {
    if (codeSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCodeSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeSeconds]);

  if (!configured || loading) return null;
  if (user && stage !== 'setPassword' && stage !== 'resetPassword') return null;

  const go = (nextStage: AuthStage) => {
    setStage(nextStage);
    setHint(null);
    setBusy(false);
  };

  const run = async (action: () => Promise<AuthResult>, onSuccess: () => void) => {
    setBusy(true);
    setHint(null);
    try {
      const result = await action();
      const message = translateAuthResult(result, t);
      if (message) {
        setHint(message);
        return;
      }
      onSuccess();
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = () => {
    void run(
      () => signInWithEmail(email, password),
      () => {
        saveRecentEmail(email);
      },
    );
  };

  const handleSendCode = () => {
    void run(
      () => sendEmailSignupCode(email),
      () => {
        saveRecentEmail(email);
        setVerificationCode('');
        setCodeSeconds(60);
        setHint(t('authVerificationCodeSent'));
      },
    );
  };

  const handleVerifyCode = () => {
    void run(
      () => verifyEmailSignupCode(email, verificationCode),
      () => {
        setPassword('');
        setStage('setPassword');
      },
    );
  };

  const handleSetPassword = () => {
    void run(
      () => setPasswordForCurrentUser(password, accountName),
      () => {
        setStage('welcome');
        setPassword('');
        setAccountName('');
        setHint(null);
      },
    );
  };

  const handleResetPassword = () => {
    void run(
      () => setPasswordForCurrentUser(password),
      () => {
        clearPasswordRecovery();
        void signOut();
        setPassword('');
        setStage('emailSignIn');
        setHint(t('authPasswordUpdated'));
      },
    );
  };

  const handleGoogle = () => {
    void run(signInWithGoogle, () => undefined);
  };

  const renderEmailSignIn = () => (
    <>
      <BackButton onClick={() => go('signInChooser')} label={t('authBack')} />
      <h2 className="m-0 text-center text-[15px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}>
        {t('authSignInTitle')}
      </h2>
      <GlassInput type="email" value={email} onChange={setEmail} placeholder={t('authEmailPlaceholder')} leftIcon={<IconMail />} onSubmit={handleSignIn} />
      <GlassInput type="password" value={password} onChange={setPassword} placeholder={t('authPasswordPlaceholder')} leftIcon={<IconPassword />} onSubmit={handleSignIn} showSubmit submitLabel={t('authSubmitLabel')} />
      <button
        type="button"
        onClick={() => go('resetPassword')}
        className="cursor-pointer border-0 bg-transparent p-0 text-[12px]"
        style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
      >
        {t('authForgetPassword')}
      </button>
      <ActionButton onClick={handleSignIn} disabled={busy}>{busy ? t('authProcessing') : t('authSubmitSignIn')}</ActionButton>
    </>
  );

  const renderSignInChooser = () => (
    <>
      <BackButton onClick={() => go('welcome')} label={t('authBack')} />
      <h2 className="m-0 text-center text-[15px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}>
        {t('authSignInChooserTitle')}
      </h2>
      {recentEmail && (
        <button
          type="button"
          onClick={() => {
            setEmail(recentEmail);
            setPassword('');
            go('emailSignIn');
          }}
          className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-2xl border border-white/80 bg-white/65 px-4 py-3 text-left backdrop-blur-md hover:bg-white/80"
          style={{ color: '#111', fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
        >
          <span className="text-[13px]">{recentEmail}</span>
          <span className="text-[11px] text-black/55">{t('authChooseExistingAccount')}</span>
        </button>
      )}
      <ActionButton variant="secondary" onClick={() => go('emailSignIn')}>
        {t('authSignInWithAnotherAccount')}
      </ActionButton>
    </>
  );

  const renderEmailSignUp = () => (
    <>
      <BackButton onClick={() => go('signUpChooser')} label={t('authBack')} />
      <h2 className="m-0 text-center text-[15px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}>
        {t('authSignUpTitle')}
      </h2>
      <GlassInput type="email" value={email} onChange={setEmail} placeholder={t('authEmailPlaceholder')} leftIcon={<IconMail />} onSubmit={handleSendCode} />
      <div className="flex w-full items-center gap-2">
        <div className="min-w-0 flex-1">
          <GlassInput type="text" value={verificationCode} onChange={setVerificationCode} placeholder={t('authVerificationCode')} onSubmit={handleVerifyCode} />
        </div>
        <button
          type="button"
          onClick={handleSendCode}
          disabled={busy || codeSeconds > 0}
          className="min-h-11 shrink-0 cursor-pointer rounded-full border border-white/80 bg-white/72 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
        >
          {codeSeconds > 0 ? t('authResendCodeIn', { seconds: codeSeconds }) : t('authGetVerificationCode')}
        </button>
      </div>
      <p className="m-0 text-center text-[11px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}>
        {codeSeconds > 0 ? t('authEmailCodeHint') : ''}
      </p>
      <ActionButton onClick={handleVerifyCode} disabled={busy || !verificationCode.trim()}>
        {busy ? t('authProcessing') : t('authContinue')}
      </ActionButton>
    </>
  );

  const renderSetPassword = () => (
    <>
      <h2 className="m-0 text-center text-[15px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}>
        {t('authSetPasswordTitle')}
      </h2>
      <GlassInput type="text" value={accountName} onChange={setAccountName} placeholder={t('authAccountName')} onSubmit={handleSetPassword} />
      <GlassInput type="password" value={password} onChange={setPassword} placeholder={t('authNewPassword')} leftIcon={<IconPassword />} onSubmit={handleSetPassword} showSubmit autoComplete="new-password" submitLabel={t('authSubmitLabel')} />
      <ActionButton onClick={handleSetPassword} disabled={busy}>
        {busy ? t('authProcessing') : t('authContinue')}
      </ActionButton>
    </>
  );

  const renderResetPassword = () => (
    <>
      <BackButton onClick={() => go('emailSignIn')} label={t('authBack')} />
      <h2 className="m-0 text-center text-[15px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}>
        {passwordRecovery ? t('authResetPasswordTitle') : t('authForgetPassword')}
      </h2>
      {!passwordRecovery ? (
        <>
          <GlassInput
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t('authEmailPlaceholder')}
            leftIcon={<IconMail />}
            onSubmit={() => void run(() => requestPasswordReset(email), () => setHint(t('authCheckEmailToReset')))}
          />
          <ActionButton
            onClick={() => void run(() => requestPasswordReset(email), () => setHint(t('authCheckEmailToReset')))}
            disabled={busy}
          >
            {busy ? t('authProcessing') : t('authContinue')}
          </ActionButton>
        </>
      ) : (
        <>
          <GlassInput type="password" value={password} onChange={setPassword} placeholder={t('authNewPassword')} leftIcon={<IconPassword />} onSubmit={handleResetPassword} showSubmit autoComplete="new-password" submitLabel={t('authSubmitLabel')} />
          <ActionButton onClick={handleResetPassword} disabled={busy}>
            {busy ? t('authProcessing') : t('authResetPassword')}
          </ActionButton>
        </>
      )}
    </>
  );

  const renderContent = () => {
    switch (stage) {
      case 'signInChooser':
        return renderSignInChooser();
      case 'emailSignIn':
        return renderEmailSignIn();
      case 'signUpChooser':
        return (
          <>
            <BackButton onClick={() => go('welcome')} label={t('authBack')} />
            <h2 className="m-0 text-center text-[15px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}>
              {t('authSignUpTitle')}
            </h2>
            <ActionButton onClick={() => go('emailSignUp')} variant="secondary"><IconMail />{t('authSignUpWithEmail')}</ActionButton>
            <ActionButton onClick={handleGoogle} variant="secondary"><span className="text-[15px] font-semibold">G</span>{t('authGoogle')}</ActionButton>
            <button type="button" onClick={() => go('signInChooser')} className="cursor-pointer border-0 bg-transparent p-0 text-[12px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}>
              {t('authAlreadyHaveAccount')}
            </button>
          </>
        );
      case 'emailSignUp':
        return renderEmailSignUp();
      case 'setPassword':
        return renderSetPassword();
      case 'resetPassword':
        return renderResetPassword();
      case 'welcome':
      default:
        return (
          <>
            <ActionButton onClick={() => go('signInChooser')}>
              {t('authSignInOrSignUp')}
              <IconArrow />
            </ActionButton>
            <button type="button" onClick={() => go('signUpChooser')} className="cursor-pointer border-0 bg-transparent p-0 text-[12px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}>
              {t('authNoAccount')}
            </button>
          </>
        );
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-[360px] flex-col gap-3">
        {renderContent()}
        {hint && (
          <p
            className="m-0 text-center text-[12px]"
            style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
};
