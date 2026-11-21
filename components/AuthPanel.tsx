import React, { useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { useAuth, type AuthResult } from '../context/AuthContext';

export interface AuthPanelProps {
  onPullFromCloud?: () => void | Promise<void>;
  onPushAllToCloud?: () => void | Promise<void>;
  cloudBusy?: boolean;
  mobileLayout?: boolean;
  embedded?: boolean;
  onStageChange?: (stage: AuthStage) => void;
}

const BRAND_BLUE = '#0053D4';
const ICON_STROKE = 1.5;
const RECENT_EMAIL_KEY = 'echomap-recent-auth-email';
const AUTH_FONT = '"Comfortaa", cursive';
const AUTH_FEEDBACK_CLASS = 'm-0 w-full whitespace-normal break-words px-2 text-center text-[12px] leading-tight';

export type AuthStage =
  | 'welcome'
  | 'signInChooser'
  | 'emailSignIn'
  | 'emailSignInCode'
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

function IconEye({ open = false }: { open?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {open ? (
        <>
          <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : (
        <>
          <path d="M3 12s3.5-5 9-5 9 5 9 5" />
          <path d="M5 15.5 3.5 17M8 17l-1 2M12 17.5V20M16 17l1 2M19 15.5l1.5 1.5" />
        </>
      )}
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
  mobile = false,
  embedded = false,
  showPasswordToggle = false,
  trailingAction,
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
  mobile?: boolean;
  embedded?: boolean;
  showPasswordToggle?: boolean;
  trailingAction?: React.ReactNode;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inputType = showPasswordToggle && passwordVisible ? 'text' : type;

  return (
    <div
      className={`flex w-full items-center gap-2 border border-white/70 backdrop-blur-md ${
        mobile
          ? embedded
            ? 'min-h-[2.9rem] rounded-[10px] bg-white px-4'
            : 'min-h-[clamp(3rem,6vh,4.75rem)] rounded-[14px] bg-white px-7'
          : 'min-h-11 rounded-full bg-white/55 px-3'
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)' }}
    >
      {leftIcon && <span className="shrink-0 text-black">{leftIcon}</span>}
      <input
        type={inputType}
        autoComplete={autoComplete ?? (type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 border-0 bg-transparent text-[#1d1d1d] outline-none placeholder:text-black/50 ${
          mobile ? (embedded ? 'text-[15px]' : 'text-[20px]') : 'text-[13px]'
        }`}
        style={{ fontFamily: AUTH_FONT, fontWeight: 700 }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.();
        }}
      />
      {trailingAction ? (
        <span className="shrink-0">{trailingAction}</span>
      ) : showPasswordToggle ? (
        <button
          type="button"
          onClick={() => setPasswordVisible((visible) => !visible)}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-black/65 hover:bg-black/5"
          aria-label={passwordVisible ? 'Hide password' : 'Show password'}
        >
          <IconEye open={passwordVisible} />
        </button>
      ) : showSubmit ? (
        <button
          type="button"
          onClick={onSubmit}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-black/5"
          aria-label={submitLabel}
        >
          <IconArrow />
        </button>
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  mobile = false,
  compact = false,
  embedded = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'mobileFilled' | 'mobileWelcome';
  disabled?: boolean;
  type?: 'button' | 'submit';
  mobile?: boolean;
  compact?: boolean;
  embedded?: boolean;
}) {
  const base = `flex w-full items-center justify-center gap-2 ${mobile ? 'border-0' : 'border'} outline-none transition-colors focus:outline-none focus-visible:ring-0 ${
      mobile
        ? compact
        ? embedded
          ? 'min-h-[2.5rem] rounded-[9px] px-3 text-[15px]'
          : 'min-h-[clamp(3rem,6vh,4.75rem)] rounded-[12px] px-4 text-[20px]'
        : embedded
          ? 'min-h-[3rem] rounded-[10px] px-3 text-[15px]'
          : 'min-h-[clamp(3rem,6vh,4.75rem)] rounded-[14px] px-4 text-[20px]'
      : 'min-h-11 rounded-full px-4 text-[13px]'
  }`;
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
    mobileFilled: {
      background: '#d6e5ff',
      color: BRAND_BLUE,
      borderColor: 'transparent',
    },
    mobileWelcome: {
      background: '#fff',
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
        fontFamily: AUTH_FONT,
        fontWeight: 700,
        ...(mobile && !embedded ? { fontSize: 'clamp(16px, 3.4vw, 20px)' } : {}),
        boxShadow: variant === 'primary' ? '0 1px 0 rgba(255,255,255,0.25)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

function AuthGlassInput({
  embedded,
  ...props
}: React.ComponentProps<typeof GlassInput> & { embedded?: boolean }) {
  return <GlassInput {...props} embedded={embedded} />;
}

function AuthActionButton({
  embedded,
  ...props
}: React.ComponentProps<typeof ActionButton> & { embedded?: boolean }) {
  return <ActionButton {...props} embedded={embedded} />;
}

function BackButton({ onClick, label, mobile = false }: { onClick: () => void; label: string; mobile?: boolean }) {
  if (mobile) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-[12px]"
      style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}
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
      case 'Google sign-in is not enabled':
        return t('authGoogleNotConfigured');
      default:
        return result.message;
    }
  }
  return null;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ mobileLayout = false, embedded = false, onStageChange }) => {
  const { t } = useLocalization();
  const {
    configured,
    loading,
    user,
    passwordRecovery,
    signInWithEmail,
    sendEmailSignInCode,
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
  const [codeSentForEmail, setCodeSentForEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [codeSeconds, setCodeSeconds] = useState(0);
  const [passwordResetSeconds, setPasswordResetSeconds] = useState(0);
  const recentEmail = useMemo(() => readRecentEmail(), []);
  const recentAccountName = useMemo(() => recentEmail.split('@')[0] || recentEmail, [recentEmail]);
  const recentInitial = recentAccountName.trim().charAt(0).toUpperCase() || 'S';
  const mobileTitleClass = embedded ? 'text-left text-[1.4rem]' : 'text-left text-[2.2rem]';
  useEffect(() => {
    onStageChange?.(stage);
  }, [onStageChange, stage]);

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

  useEffect(() => {
    if (passwordResetSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setPasswordResetSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [passwordResetSeconds]);

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

  const handleRequestPasswordReset = () => {
    void run(
      () => requestPasswordReset(email),
      () => {
        setPasswordResetSeconds(60);
        setHint(null);
      },
    );
  };

  const handleSendCode = () => {
    void run(
      () => sendEmailSignupCode(email),
      () => {
        saveRecentEmail(email);
        setCodeSentForEmail(email.trim());
        setVerificationCode('');
        setCodeSeconds(60);
        setHint(t('authVerificationCodeSent'));
      },
    );
  };

  const handleRememberedSignIn = () => {
    if (!recentEmail) return;
    setEmail(recentEmail);
    setPassword('');
    void run(
      () => sendEmailSignInCode(recentEmail),
      () => {
        saveRecentEmail(recentEmail);
        setCodeSentForEmail(recentEmail.trim());
        setVerificationCode('');
        setCodeSeconds(60);
        setStage('emailSignInCode');
        setHint(null);
      },
    );
  };

  const handleResendSignInCode = () => {
    void run(
      () => sendEmailSignInCode(email),
      () => {
        setCodeSentForEmail(email.trim());
        setVerificationCode('');
        setCodeSeconds(60);
        setHint(null);
      },
    );
  };

  const handleVerifySignInCode = () => {
    void run(
      () => verifyEmailSignupCode(email, verificationCode),
      () => {
        saveRecentEmail(email);
        setPassword('');
        setStage('welcome');
        setHint(null);
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

  const renderPasswordResetAction = (mobile: boolean) => (
    passwordResetSeconds > 0 ? (
      <p
        role="status"
        aria-live="polite"
        className={`m-0 max-w-full self-end text-right ${mobile ? (embedded ? 'text-[12px]' : 'text-[16px]') : 'text-[12px]'}`}
        style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}
      >
        {t('authCheckEmailToResetCountdown', { seconds: passwordResetSeconds })}
      </p>
    ) : (
      <button
        type="button"
        onClick={handleRequestPasswordReset}
        disabled={busy}
        className={`self-end border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60 ${mobile ? (embedded ? 'text-[15px]' : 'text-[20px]') : 'cursor-pointer text-[12px]'}`}
        style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
      >
        {busy ? t('authProcessing') : t('authForgetPassword')}
      </button>
    )
  );

  const renderEmailSignIn = () => (
    mobileLayout ? (
      <>
        <h2 className={`m-0 ${mobileTitleClass}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
          {t('authMobileSignInTitle')}
        </h2>
        <label className={`w-full self-start text-left ${embedded ? 'mt-3 text-[15px]' : 'mt-5 text-[20px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>
          {t('authAccountName')}
        </label>
        <AuthGlassInput embedded={embedded} type="email" value={email} onChange={setEmail} placeholder="" onSubmit={handleSignIn} mobile />
        <label className={`w-full self-start text-left ${embedded ? 'mt-1 text-[15px]' : 'mt-2 text-[20px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>
          {t('authNewPassword')}
        </label>
        <AuthGlassInput
          embedded={embedded}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder=""
          onSubmit={handleSignIn}
          autoComplete="current-password"
          mobile
          showPasswordToggle
        />
        {renderPasswordResetAction(true)}
        <div className={embedded ? 'mt-3 grid w-full grid-cols-2 gap-3 pt-0' : 'mt-auto grid w-full grid-cols-2 gap-10 pt-10'}>
          <AuthActionButton embedded={embedded} onClick={() => go('signInChooser')} variant="secondary" mobile compact>{t('authBack')}</AuthActionButton>
          <AuthActionButton embedded={embedded} onClick={handleSignIn} variant="mobileFilled" mobile compact disabled={busy}>
            {busy ? t('authProcessing') : t('authSubmitSignIn')}
          </AuthActionButton>
        </div>
      </>
    ) : (
    <>
      <BackButton onClick={() => go('signInChooser')} label={t('authBack')} mobile={mobileLayout} />
      <h2 className={`m-0 ${mobileLayout ? mobileTitleClass : 'text-center text-[15px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
        {t('authSignInTitle')}
      </h2>
      <AuthGlassInput embedded={embedded} type="email" value={email} onChange={setEmail} placeholder={t('authEmailPlaceholder')} leftIcon={mobileLayout ? undefined : <IconMail />} onSubmit={handleSignIn} mobile={mobileLayout} />
      <AuthGlassInput embedded={embedded} type="password" value={password} onChange={setPassword} placeholder={t('authPasswordPlaceholder')} leftIcon={mobileLayout ? undefined : <IconPassword />} onSubmit={handleSignIn} showSubmit submitLabel={t('authSubmitLabel')} mobile={mobileLayout} />
      {renderPasswordResetAction(mobileLayout)}
      <AuthActionButton embedded={embedded} onClick={handleSignIn} disabled={busy} mobile={mobileLayout}>{busy ? t('authProcessing') : t('authSubmitSignIn')}</AuthActionButton>
    </>
    )
  );

  const renderEmailSignInCode = () => (
    <>
      <h2 className={`m-0 ${mobileTitleClass}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
        {t('authSignInTitle')}
      </h2>
      <p className={`m-0 w-full text-left ${embedded ? 'text-[13px]' : 'text-[16px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>
        {email}
      </p>
      <p className={`m-0 w-full text-left ${embedded ? 'text-[12px]' : 'text-[14px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>
        {t('authVerificationCodeSent')}
      </p>
      <AuthGlassInput
        embedded={embedded}
        type="text"
        value={verificationCode}
        onChange={setVerificationCode}
        placeholder={t('authVerificationCode')}
        onSubmit={handleVerifySignInCode}
        trailingAction={(
          <button
            type="button"
            onClick={handleResendSignInCode}
            disabled={busy || codeSeconds > 0}
            className={`shrink-0 whitespace-nowrap cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50 ${embedded ? 'text-[12px]' : 'text-[16px]'}`}
            style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
          >
            {codeSeconds > 0 ? t('authResendCodeIn', { seconds: codeSeconds }) : t('authResend')}
          </button>
        )}
      />
      <div className={embedded ? 'mt-3 grid w-full grid-cols-2 gap-3 pt-0' : 'mt-auto grid w-full grid-cols-2 gap-5 pt-6'}>
        <AuthActionButton embedded={embedded} onClick={() => go('signInChooser')} variant="secondary" mobile compact>
          {t('authCancel')}
        </AuthActionButton>
        <AuthActionButton
          embedded={embedded}
          onClick={handleVerifySignInCode}
          variant="mobileFilled"
          mobile
          compact
          disabled={busy || !verificationCode.trim()}
        >
          {busy ? t('authProcessing') : t('authSubmitSignIn')}
        </AuthActionButton>
      </div>
    </>
  );

  const renderSignInChooser = () => (
    mobileLayout ? (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className={`my-auto flex w-full flex-col ${embedded ? 'gap-3' : 'gap-4'}`}>
          <h2 className={`m-0 ${mobileTitleClass}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
            {t('authSignInChooserTitle')}
          </h2>
          {recentEmail && (
            <div
              className={`flex w-full items-center ${embedded ? 'gap-3 rounded-[10px] px-4 py-2' : 'gap-3 rounded-[14px] px-4 py-3'} bg-[#c6ddff]`}
              style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-full bg-white/75 ${embedded ? 'h-10 w-10 text-[1.25rem]' : 'h-14 w-14 text-[1.75rem]'}`}>
                {recentInitial}
              </span>
              <span className="flex min-w-0 flex-col gap-1 text-left">
                <span className={`truncate ${embedded ? 'text-[0.9rem]' : 'text-[1.1rem]'}`}>{recentAccountName}</span>
                <span className={`truncate ${embedded ? 'text-[0.8rem]' : 'text-[0.95rem]'}`}>{recentEmail}</span>
              </span>
            </div>
          )}
          <AuthActionButton
            embedded={embedded}
            onClick={() => go('emailSignIn')}
            variant="mobileWelcome"
            mobile
          >
            {t('authSignInWithAnotherAccountButton')}
          </AuthActionButton>
        </div>
        <div className={`mt-auto w-full ${embedded ? 'pt-4' : 'pt-6'}`}>
          <div className={`grid w-full grid-cols-2 ${embedded ? 'gap-3' : 'gap-10'}`}>
            <AuthActionButton embedded={embedded} onClick={() => go('welcome')} variant="secondary" mobile compact>
              {t('authBack')}
            </AuthActionButton>
            <AuthActionButton
              embedded={embedded}
              onClick={handleRememberedSignIn}
              variant="mobileFilled"
              mobile
              compact
              disabled={!recentEmail}
            >
              {t('authSubmitSignIn')}
            </AuthActionButton>
          </div>
          <button
            type="button"
            onClick={() => go('signUpChooser')}
            className={`m-0 flex w-full cursor-pointer touch-manipulation items-center justify-center whitespace-nowrap border-0 bg-transparent px-2 ${embedded ? 'pt-3 text-[14px]' : 'pt-3 text-[16px]'}`}
            style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
          >
            {t('authDontHaveAccountLabel')}{' '}
            <span className="underline decoration-1 underline-offset-2">{t('authSignUpAction')}</span>
          </button>
        </div>
      </div>
    ) : (
    <>
      <BackButton onClick={() => go('welcome')} label={t('authBack')} mobile={mobileLayout} />
      <h2 className={`m-0 ${mobileLayout ? mobileTitleClass : 'text-center text-[15px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
        {t('authSignInChooserTitle')}
      </h2>
      {recentEmail && (
        <button
          type="button"
          onClick={() => setEmail(recentEmail)}
          className={`flex w-full cursor-pointer flex-col items-start gap-1 border border-white/80 bg-white/65 text-left backdrop-blur-md hover:bg-white/80 ${mobileLayout ? 'rounded-[14px] px-7 py-5' : 'rounded-2xl px-4 py-3'}`}
          style={{ color: '#111', fontFamily: AUTH_FONT }}
        >
          <span className={mobileLayout ? 'text-[1.15rem]' : 'text-[13px]'}>{recentEmail}</span>
          <span className="text-[11px] text-black/55">{t('authChooseExistingAccount')}</span>
        </button>
      )}
      <AuthActionButton embedded={embedded} variant="secondary" onClick={() => go('emailSignIn')} mobile={mobileLayout}>
        {t('authSignInWithAnotherAccount')}
      </AuthActionButton>
    </>
    )
  );

  const renderEmailSignUp = () => (
    <>
      <BackButton onClick={() => go('signUpChooser')} label={t('authBack')} mobile={mobileLayout} />
      <h2 className={`m-0 ${mobileLayout ? mobileTitleClass : 'text-center text-[15px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
        {mobileLayout ? t('authMobileSignUpTitle') : t('authSignUpTitle')}
      </h2>
      {mobileLayout ? (
        <div className={`flex w-full items-center gap-3 rounded-[14px] bg-white ${embedded ? 'mt-6 min-h-[2.9rem] rounded-[10px] px-4' : 'mt-[clamp(1rem,2.4vh,2rem)] min-h-[clamp(3rem,6vh,4.75rem)] px-7'}`}>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSendCode();
            }}
            placeholder={t('authEmailPlaceholder')}
            className={`min-w-0 flex-1 border-0 bg-transparent text-[#1d1d1d] outline-none placeholder:text-black/35 ${embedded ? 'text-[15px]' : 'text-[20px]'}`}
            style={{ fontFamily: AUTH_FONT }}
          />
          <button
            type="button"
            onClick={handleSendCode}
            disabled={busy || codeSeconds > 0}
            className={`shrink-0 whitespace-nowrap cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50 ${embedded ? 'text-[15px]' : 'text-[20px]'}`}
            style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
          >
            {codeSeconds > 0
              ? t('authResendCodeIn', { seconds: codeSeconds })
              : Boolean(codeSentForEmail) && codeSentForEmail === email.trim()
                ? t('authResend')
                : t('authGetCode')}
          </button>
        </div>
      ) : (
        <>
          <AuthGlassInput
            embedded={embedded}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t('authEmailPlaceholder')}
            leftIcon={<IconMail />}
            onSubmit={handleSendCode}
            trailingAction={(
              <button
                type="button"
                onClick={handleSendCode}
                disabled={busy || codeSeconds > 0}
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
              >
                {codeSeconds > 0
                  ? t('authResendCodeIn', { seconds: codeSeconds })
                  : Boolean(codeSentForEmail) && codeSentForEmail === email.trim()
                    ? t('authResend')
                    : t('authGetCode')}
              </button>
            )}
          />
          <AuthGlassInput
            embedded={embedded}
            type="text"
            value={verificationCode}
            onChange={setVerificationCode}
            placeholder={t('authVerificationCode')}
            onSubmit={handleVerifyCode}
          />
        </>
      )}
      {mobileLayout && (
        <div className={`w-full ${embedded ? 'mt-3' : 'mt-[clamp(0.75rem,1.8vh,1.25rem)]'}`}>
          <AuthGlassInput
            embedded={embedded}
            type="text"
            value={verificationCode}
            onChange={setVerificationCode}
            placeholder={t('authVerificationCode')}
            onSubmit={handleVerifyCode}
            mobile
          />
        </div>
      )}
      <p className={`m-0 text-center ${embedded ? 'mt-1 text-[12px]' : 'mt-[clamp(0.25rem,0.8vh,0.75rem)] text-[20px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>
        {codeSeconds > 0 ? t('authEmailCodeHint') : ''}
      </p>
      {mobileLayout ? (
        <div className={embedded ? 'mt-3 grid w-full grid-cols-2 gap-3 pt-0' : 'mt-auto grid w-full grid-cols-2 gap-10 pt-[clamp(1rem,2.5vh,2.5rem)]'}>
          <AuthActionButton embedded={embedded} onClick={() => go('signUpChooser')} variant="secondary" mobile compact>{t('authCancel')}</AuthActionButton>
          <AuthActionButton embedded={embedded} onClick={handleVerifyCode} variant="mobileFilled" mobile compact disabled={busy || !verificationCode.trim()}>
            {busy ? t('authProcessing') : t('authContinue')}
          </AuthActionButton>
        </div>
      ) : (
        <AuthActionButton embedded={embedded} onClick={handleVerifyCode} disabled={busy || !verificationCode.trim()}>
          {busy ? t('authProcessing') : t('authContinue')}
        </AuthActionButton>
      )}
    </>
  );

  const renderSetPassword = () => (
    <>
      <h2 className={`m-0 ${mobileLayout ? mobileTitleClass : 'text-center text-[15px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
        {mobileLayout ? t('authMobileSignUpTitle') : t('authSetPasswordTitle')}
      </h2>
      {mobileLayout && <label className={`${embedded ? 'mt-3 text-[15px]' : 'mt-5 text-[1.2rem]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>{t('authAccountName')}</label>}
      <AuthGlassInput embedded={embedded} type="text" value={accountName} onChange={setAccountName} placeholder={mobileLayout ? '' : t('authAccountName')} onSubmit={handleSetPassword} mobile={mobileLayout} />
      {mobileLayout && <label className={`${embedded ? 'mt-1 text-[15px]' : 'mt-2 text-[1.2rem]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>{t('authNewPassword')}</label>}
      <AuthGlassInput embedded={embedded} type="password" value={password} onChange={setPassword} placeholder={mobileLayout ? '' : t('authNewPassword')} leftIcon={mobileLayout ? undefined : <IconPassword />} onSubmit={handleSetPassword} showSubmit={!mobileLayout} showPasswordToggle={mobileLayout} autoComplete="new-password" submitLabel={t('authSubmitLabel')} mobile={mobileLayout} />
      {mobileLayout ? (
        <div className={embedded ? 'mt-3 grid w-full grid-cols-2 gap-3 pt-0' : 'mt-auto grid w-full grid-cols-2 gap-10 pt-[clamp(1rem,2.5vh,2.5rem)]'}>
          <AuthActionButton embedded={embedded} onClick={() => go('emailSignUp')} variant="secondary" mobile compact>{t('authBack')}</AuthActionButton>
          <AuthActionButton embedded={embedded} onClick={handleSetPassword} variant="mobileFilled" mobile compact disabled={busy}>
            {busy ? t('authProcessing') : t('authSubmitSignUp')}
          </AuthActionButton>
        </div>
      ) : (
        <AuthActionButton embedded={embedded} onClick={handleSetPassword} disabled={busy}>
          {busy ? t('authProcessing') : t('authContinue')}
        </AuthActionButton>
      )}
    </>
  );

  const renderResetPassword = () => (
    <>
      <BackButton onClick={() => go('emailSignIn')} label={t('authBack')} mobile={mobileLayout} />
      <h2 className={`m-0 ${mobileLayout ? mobileTitleClass : 'text-center text-[15px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
        {t('authResetPasswordTitle')}
      </h2>
      <AuthGlassInput
        embedded={embedded}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={mobileLayout ? '' : t('authNewPassword')}
        leftIcon={mobileLayout ? undefined : <IconPassword />}
        onSubmit={handleResetPassword}
        showSubmit={!mobileLayout}
        showPasswordToggle={mobileLayout}
        autoComplete="new-password"
        submitLabel={t('authSubmitLabel')}
        mobile={mobileLayout}
      />
      <AuthActionButton embedded={embedded} onClick={handleResetPassword} disabled={busy} mobile={mobileLayout}>
        {busy ? t('authProcessing') : t('authResetPassword')}
      </AuthActionButton>
    </>
  );

  const renderContent = () => {
    switch (stage) {
      case 'signInChooser':
        return renderSignInChooser();
      case 'emailSignIn':
        return renderEmailSignIn();
      case 'emailSignInCode':
        return renderEmailSignInCode();
      case 'signUpChooser':
        return mobileLayout ? (
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <div className={`my-auto flex w-full flex-col ${embedded ? 'gap-3' : 'gap-4'}`}>
              <h2 className={`m-0 ${mobileTitleClass}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
                {t('authMobileSignUpTitle')}
              </h2>
              <AuthActionButton
                embedded={embedded}
                onClick={() => go('emailSignUp')}
                variant="mobileFilled"
                mobile
              >
                {t('authSignUpWithEmail')}
              </AuthActionButton>
              <AuthActionButton
                embedded={embedded}
                onClick={handleGoogle}
                variant="mobileFilled"
                mobile
              >
                {t('authSignUpWithGoogle')}
              </AuthActionButton>
            </div>
            <div className={`mt-auto w-full ${embedded ? 'pt-4' : 'pt-6'}`}>
              <AuthActionButton
                embedded={embedded}
                onClick={() => go('welcome')}
                variant="secondary"
                mobile
              >
                {t('authBack')}
              </AuthActionButton>
              <button
                type="button"
                onClick={() => go('signInChooser')}
                className={`m-0 flex w-full cursor-pointer touch-manipulation items-center justify-center whitespace-nowrap border-0 bg-transparent px-2 ${embedded ? 'pt-3 text-[14px]' : 'pt-3 text-[16px]'}`}
                style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}
              >
                {t('authAlreadyHaveAccountLabel')}{' '}
                <span className="underline decoration-1 underline-offset-2">{t('authSignInAction')}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <BackButton onClick={() => go('welcome')} label={t('authBack')} />
            <h2 className={`m-0 ${mobileLayout ? mobileTitleClass : 'text-center text-[15px]'}`} style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}>
              {t('authSignUpTitle')}
            </h2>
            <AuthActionButton onClick={() => go('emailSignUp')} variant="secondary">
              <IconMail />{t('authSignUpWithEmail')}
            </AuthActionButton>
            <AuthActionButton onClick={handleGoogle} variant="secondary">
              <span className="text-[15px] font-semibold">G</span>{t('authSignUpWithGoogle')}
            </AuthActionButton>
            <button type="button" onClick={() => go('signInChooser')} className="cursor-pointer border-0 bg-transparent p-0 text-[12px]" style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT }}>
              <span>{t('authAlreadyHaveAccountLabel')}</span>{' '}
              <span className="underline decoration-1 underline-offset-2">{t('authSignInAction')}</span>
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
            <AuthActionButton
              embedded={embedded}
              onClick={() => go(recentEmail ? 'signInChooser' : 'signUpChooser')}
              variant={mobileLayout ? 'mobileWelcome' : 'primary'}
              mobile={mobileLayout}
              compact={mobileLayout}
            >
              {t('authSignInOrSignUp')}
              {!mobileLayout && <IconArrow />}
            </AuthActionButton>
          </>
        );
    }
  };

  const isEmbeddedMobile = mobileLayout && embedded;
  const centerEmbeddedStage = isEmbeddedMobile && stage !== 'welcome';
  const isMobilePanel = mobileLayout && stage !== 'welcome';
  const isMobileSheet = isMobilePanel && !embedded;

  return (
    <div
      className={`flex w-full flex-col items-center ${
        isMobileSheet
          ? 'auth-mobile-sheet min-h-full flex-1 -mx-[1.75rem] w-[calc(100%+3.5rem)] rounded-t-[4.25rem] bg-[#e8f1ff] px-7 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[clamp(1rem,2.4vh,2rem)]'
          : isEmbeddedMobile
            ? 'auth-embedded-panel min-h-0 flex-1 justify-center'
            : 'gap-3'
      }`}
      style={{
        fontFamily: AUTH_FONT,
        fontWeight: 700,
        ...(isMobileSheet ? { minHeight: '44dvh' } : {}),
      }}
    >
      <div className={`flex w-full flex-col ${isEmbeddedMobile ? 'gap-1 justify-center' : 'gap-3'} ${isMobilePanel ? 'min-h-0 flex-1' : ''} ${mobileLayout ? '' : 'w-full max-w-none'}`}>
        {renderContent()}
        {!mobileLayout && hint && (
          <p
            className={AUTH_FEEDBACK_CLASS}
            style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}
          >
            {hint}
          </p>
        )}
      </div>
      {isMobilePanel && (
        <div className="auth-feedback-footer flex min-h-[3.25rem] w-full shrink-0 items-end justify-center px-1 pb-1">
          {hint && (
            <p
              role="status"
              aria-live="polite"
              className={AUTH_FEEDBACK_CLASS}
              style={{ color: BRAND_BLUE, fontFamily: AUTH_FONT, fontWeight: 700 }}
            >
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
