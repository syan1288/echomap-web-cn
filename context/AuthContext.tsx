import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export type AuthResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signInWithPhoneOtp: (phone: string) => Promise<AuthResult>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errMessage(err: AuthError | null): string {
  if (!err) return 'Unknown error';
  if (err.message === 'Invalid login credentials') return 'Email or password is incorrect';
  if (err.message.includes('Email not confirmed')) return 'Please confirm your email before signing in';
  return err.message;
}

function normalizePhoneForAuth(input: string): string {
  const compact = input.trim().replace(/[\s()-]/g, '');
  if (!compact) return '';
  if (compact.startsWith('+')) return compact;
  const digits = compact.replace(/\D/g, '');
  if (/^1\d{10}$/.test(digits)) return `+86${digits}`;
  if (/^86\d{11}$/.test(digits)) return `+${digits}`;
  return compact;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
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

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const trimmed = email.trim();
    if (!trimmed || !password) return { ok: false, message: 'Please enter email and password' };
    if (password.length < 6) return { ok: false, message: 'Password must be at least 6 characters' };
    const { error } = await supabase.auth.signUp({ email: trimmed, password });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const signInWithPhoneOtp = useCallback(async (phone: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const normalized = normalizePhoneForAuth(phone);
    if (!normalized) return { ok: false, message: 'Please enter a phone number' };
    if (!normalized.startsWith('+')) return { ok: false, message: 'Please enter phone number with country code, for example +8613812345678' };
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase is not configured' };
    const normalized = normalizePhoneForAuth(phone);
    const trimmedToken = token.trim().replace(/\s/g, '');
    if (!normalized) return { ok: false, message: 'Please enter a phone number' };
    if (!trimmedToken) return { ok: false, message: 'Please enter the verification code' };
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: trimmedToken,
      type: 'sms',
    });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
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
      signInWithEmail,
      signUpWithEmail,
      signInWithPhoneOtp,
      verifyPhoneOtp,
      signOut,
    }),
    [loading, session, signInWithEmail, signInWithPhoneOtp, signUpWithEmail, signOut, verifyPhoneOtp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
