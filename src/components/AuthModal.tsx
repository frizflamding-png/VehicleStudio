'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type AuthMode = 'signin' | 'signup';

type AuthModalProps = {
  isOpen: boolean;
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
};

export default function AuthModal({ isOpen, mode, onClose, onModeChange }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setNotice('');
    setLoading(false);
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const getCheckoutPlan = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout || checkout === 'false') return null;
    const plan = params.get('plan');
    return plan === 'yearly' ? 'yearly' : 'monthly';
  };

  const clearCheckoutParams = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    url.searchParams.delete('plan');
    window.history.replaceState({}, '', url.toString());
  };

  const startPostAuthCheckout = async () => {
    const plan = getCheckoutPlan();
    const priceId =
      plan === 'yearly'
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY
        : process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY;

    clearCheckoutParams();

    if (!priceId) {
      throw new Error('Stripe pricing is not configured.');
    }

    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to start checkout');
    }
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const shouldCheckout = Boolean(getCheckoutPlan());
    if (shouldCheckout) {
      try {
        await startPostAuthCheckout();
        onClose();
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start checkout');
        setLoading(false);
        return;
      }
    }
    onClose();
    router.push('/studio');
    router.refresh();
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (signUpData?.session) {
      const shouldCheckout = Boolean(getCheckoutPlan());
      if (shouldCheckout) {
        try {
          await startPostAuthCheckout();
          onClose();
          return;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to start checkout');
          setLoading(false);
          return;
        }
      }
      onClose();
      router.push('/studio');
      router.refresh();
      return;
    }

    setNotice('We’ve sent you a confirmation email. Click the link in your inbox to activate your account, then come back here to sign in.');
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4 py-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[420px] rounded-xl border border-slate-800 bg-slate-900 p-6 text-left shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {mode === 'signin'
                ? 'Enter your credentials to continue.'
                : 'Create your account to start using VehicleStudio.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!supabase ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-center">
            <p className="text-sm text-slate-400">
              Configure Supabase in <code className="text-cyan-400">.env.local</code> to enable authentication.
            </p>
          </div>
        ) : (
          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {notice}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-slate-600 focus:outline-none transition-colors"
                placeholder="you@dealership.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-slate-600 focus:outline-none transition-colors"
                placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                required
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-slate-600 focus:outline-none transition-colors"
                  placeholder="Repeat password"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white px-4 py-2.5 font-medium text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? mode === 'signin'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        )}

        <div className="mt-5 text-sm text-slate-400 text-center">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => onModeChange('signup')}
                className="text-cyan-400 hover:text-cyan-300"
              >
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => onModeChange('signin')}
                className="text-cyan-400 hover:text-cyan-300"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
