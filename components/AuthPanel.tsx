import React, { useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';

export interface AuthPanelProps {
  onPullFromCloud?: () => void | Promise<void>;
  onPushAllToCloud?: () => void | Promise<void>;
  cloudBusy?: boolean;
}

const BRAND_BLUE = '#0053D4';
const ICON_STROKE = 1.5;

function GlassInput({
  type,
  value,
  onChange,
  placeholder,
  leftIcon,
  onSubmit,
}: {
  type: 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  leftIcon: React.ReactNode;
  onSubmit: () => void;
}) {
  return (
    <div
      className="w-full h-11 rounded-full border border-white/70 bg-white/55 backdrop-blur-md flex items-center gap-2 px-3"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)' }}
    >
      <span className="shrink-0 text-black">{leftIcon}</span>
      <input
        type={type}
        autoComplete={type === 'email' ? 'email' : 'current-password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#1d1d1d] outline-none"
        style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
      />
      {type === 'password' && (
        <button
          type="button"
          onClick={onSubmit}
          className="h-7 w-7 rounded-full border-0 bg-transparent flex items-center justify-center cursor-pointer hover:bg-black/5"
          aria-label="submit auth"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

export const AuthPanel: React.FC<AuthPanelProps> = () => {
  const { t } = useLocalization();
  const { configured, loading, user, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [registerConfirmShown, setRegisterConfirmShown] = useState(false);

  if (!configured) return null;
  if (loading) return null;
  if (user) return null;

  const submit = async () => {
    setHint(null);
    if (mode === 'signIn') setRegisterConfirmShown(false);
    setBusy(true);
    try {
      const fn = mode === 'signIn' ? signInWithEmail : signUpWithEmail;
      const r = await fn(email, password);
      if (!r.ok) {
        setHint(r.message);
        return;
      }
      if (mode === 'signUp') {
        setRegisterConfirmShown(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setMode('signIn');
            setHint(null);
            setRegisterConfirmShown(false);
            setExpanded(true);
          }}
          className="h-11 w-11 rounded-full border border-white/65 flex items-center justify-center cursor-pointer transition-colors"
          style={{
            background: mode === 'signIn' ? BRAND_BLUE : 'rgba(255,255,255,0.75)',
            color: mode === 'signIn' ? '#fff' : '#111',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
          }}
          aria-label={t('authSignIn')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signUp');
            setHint(null);
            setRegisterConfirmShown(false);
            setExpanded(true);
          }}
          className="h-11 w-11 rounded-full border border-white/65 flex items-center justify-center cursor-pointer transition-colors"
          style={{
            background: mode === 'signUp' ? BRAND_BLUE : 'rgba(255,255,255,0.75)',
            color: mode === 'signUp' ? '#fff' : '#111',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
          }}
          aria-label={t('authSignUp')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 20 4.5-1 9-9a2 2 0 0 0-2.8-2.8l-9 9L4 20Z" />
            <path d="M14 6l4 4" />
          </svg>
        </button>
      </div>

      {expanded && (
        <>
          <GlassInput
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t('authEmailPlaceholder')}
            onSubmit={submit}
            leftIcon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="m4 8 8 6 8-6" />
              </svg>
            }
          />
          <GlassInput
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={t('authPasswordPlaceholder')}
            onSubmit={submit}
            leftIcon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="11" r="4" />
                <path d="m13 14 7 7" />
              </svg>
            }
          />
        </>
      )}

      {hint && (
        <p
          className="m-0 text-[12px] text-center"
          style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
        >
          {hint}
        </p>
      )}
      {expanded && (
        <div className="h-[20px] flex items-center justify-center">
          {mode === 'signIn' ? (
            <button
              type="button"
              className="border-0 bg-transparent text-[12px] cursor-pointer"
              style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
            >
              Forget password
            </button>
          ) : (
            <span
              className="text-[12px]"
              style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
            >
              {registerConfirmShown ? 'confirm your email to check' : ''}
            </span>
          )}
        </div>
      )}
      {busy && (
        <p className="m-0 text-[11px]" style={{ color: BRAND_BLUE, fontFamily: '"Roboto Mono", ui-monospace, monospace' }}>
          ...
        </p>
      )}
    </div>
  );
};
