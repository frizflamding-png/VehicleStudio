'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type FormMode = 'signin' | 'reset';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('signin');
  const router = useRouter();
  
  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');
    setNotice('');

    const redirectTo = `${window.location.origin}/auth/reset`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setNotice('Check your email for a reset link.');
    setLoading(false);
  };

  const switchToReset = () => {
    setFormMode('reset');
    setError('');
    setNotice('');
  };

  const switchToSignIn = () => {
    setFormMode('signin');
    setError('');
    setNotice('');
  };

  if (!supabase) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 py-12">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 max-w-sm text-center">
          <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2 text-white">Setup Required</h2>
          <p className="text-slate-400 text-sm mb-6">
            Configure Supabase credentials in <code className="text-cyan-400">.env.local</code> to enable authentication.
          </p>
          <Link href="/" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to Home</Link>
        </div>
      </main>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/studio');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Desktop Layout */}
      <div className="hidden lg:flex min-h-screen">
        {/* Left: Branding Panel */}
        <div className="w-1/2 bg-slate-900 border-r border-slate-800 flex items-center justify-center p-12">
          <div className="max-w-md">
            <Link href="/" className="text-2xl font-semibold text-white mb-6 block">
              VehicleStudio
            </Link>
            <h1 className="text-3xl font-semibold text-white leading-tight mb-4">
              Vehicle photo processing for automotive dealerships
            </h1>
            <p className="text-slate-400 leading-relaxed">
              Remove backgrounds, apply studio templates, and add your dealership branding. 
              Process inventory photos consistently at scale.
            </p>
          </div>
        </div>

        {/* Right: Login Form */}
        <div className="w-1/2 flex items-center justify-center p-12">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-2">
                {formMode === 'signin' ? 'Sign in' : 'Reset password'}
              </h2>
              <p className="text-slate-400">
                {formMode === 'signin' 
                  ? 'Enter your credentials to continue' 
                  : 'Enter your email to receive a reset link'}
              </p>
            </div>

            {formMode === 'signin' ? (
              <form onSubmit={handleLogin} className="space-y-5">
                {error && (
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
                    placeholder="you@dealership.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={switchToReset}
                    className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full px-4 py-2.5 bg-white text-slate-900 font-medium rounded hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-5">
                {error && (
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                    {notice}
                  </div>
                )}

                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
                    placeholder="you@dealership.com"
                    required
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full px-4 py-2.5 bg-white text-slate-900 font-medium rounded hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </button>

                <button
                  type="button"
                  onClick={switchToSignIn}
                  className="w-full text-sm text-slate-400 hover:text-white transition-colors"
                >
                  ← Back to sign in
                </button>
              </form>
            )}

            <p className="mt-6 text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <Link href="/?auth=signup" className="text-cyan-400 hover:text-cyan-300">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <main className="lg:hidden min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 text-white">
            {formMode === 'signin' ? 'Welcome back' : 'Reset password'}
          </h1>
          <p className="text-slate-400">
            {formMode === 'signin' ? 'Sign in to continue' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {formMode === 'signin' ? (
          <form onSubmit={handleLogin} className="w-full max-w-sm space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email-mobile" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email-mobile"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password-mobile" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password-mobile"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={switchToReset}
                className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-6">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="w-full max-w-sm space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}
            {notice && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                {notice}
              </div>
            )}

            <div>
              <label htmlFor="reset-email-mobile" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="reset-email-mobile"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-6">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending...
                </span>
              ) : (
                'Send reset link'
              )}
            </button>

            <button
              type="button"
              onClick={switchToSignIn}
              className="w-full text-sm text-slate-400 hover:text-white transition-colors mt-4"
            >
              ← Back to sign in
            </button>
          </form>
        )}

        <p className="mt-8 text-slate-400">
          Don&apos;t have an account?{' '}
          <Link href="/?auth=signup" className="text-cyan-400 hover:text-cyan-300 font-medium">
            Sign up
          </Link>
        </p>
      </main>
    </div>
  );
}
