import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export type AuthResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  passwordRecovery: boolean;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  sendEmailSignInCode: (email: string) => Promise<AuthResult>;
  sendEmailSignupCode: (email: string) => Promise<AuthResult>;
  verifyEmailSignupCode: (email: string, token: string) => Promise<AuthResult>;
  setPasswordForCurrentUser: (password: string, displayName?: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errMessage(err: AuthError | null): string {
  if (!err) return 'Unknown error';
  if (err.message === 'Invalid login credentials') return 'Email or password is incorrect';
  if (err.message.includes('Email not confirmed')) return 'Please confirm your email before signing in';
  if (err.message.toLowerCase().includes('unsupported provider') || err.message.toLowerCase().includes('provider is not enabled')) {
    return 'Google sign-in is not enabled';
  }
  return err.message;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const trimmed = email.trim();
    if (!trimmed || !password) return { ok: false, message: 'Please enter email and password' };
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const sendEmailSignInCode = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const trimmed = email.trim();
    if (!trimmed) return { ok: false, message: 'Please enter your email' };
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false },
    });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const sendEmailSignupCode = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const trimmed = email.trim();
    if (!trimmed) return { ok: false, message: 'Please enter your email' };
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const verifyEmailSignupCode = useCallback(async (email: string, token: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const trimmed = email.trim();
    const code = token.trim();
    if (!trimmed || !code) return { ok: false, message: 'Please enter your email and verification code' };
    const { data, error } = await supabase.auth.verifyOtp({ email: trimmed, token: code, type: 'email' });
    if (error) return { ok: false, message: errMessage(error) };
    if (!data.session) return { ok: false, message: 'Verification succeeded, but no session was created' };
    setSession(data.session);
    return { ok: true };
  }, []);

  const setPasswordForCurrentUser = useCallback(async (password: string, displayName?: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    if (password.length < 6) return { ok: false, message: 'Password must be at least 6 characters' };
    const { data, error } = await supabase.auth.updateUser({
      password,
      ...(displayName?.trim() ? { data: { full_name: displayName.trim() } } : {}),
    });
    if (error) return { ok: false, message: errMessage(error) };
    if (data.user) {
      const refreshed = await supabase.auth.getSession();
      setSession(refreshed.data.session);
    }
    return { ok: true };
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const trimmed = email.trim();
    if (!trimmed) return { ok: false, message: 'Please enter your email' };
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/?auth=reset`
      : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, redirectTo ? { redirectTo } : undefined);
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        ...(redirectTo ? { redirectTo } : {}),
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
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
    }),
    [
      loading,
      passwordRecovery,
      session,
      signInWithEmail,
      sendEmailSignInCode,
      sendEmailSignupCode,
      verifyEmailSignupCode,
      setPasswordForCurrentUser,
      requestPasswordReset,
      signInWithGoogle,
      clearPasswordRecovery,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
