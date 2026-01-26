'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MarketingPricingCard from '@/components/MarketingPricingCard';
import AuthModal from '@/components/AuthModal';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function UpgradePage() {
  const [reason, setReason] = useState<'paywall' | 'upgrade' | null>(null);
  const [checking, setChecking] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [hasCustomerId, setHasCustomerId] = useState(false);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  const openSignUp = () => {
    setAuthMode('signup');
    setIsAuthOpen(true);
  };

  // Check URL params for reason
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get('reason');
    if (r === 'paywall' || r === 'upgrade') {
      setReason(r);
    }
  }, []);

  // Check subscription status
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }

    const checkStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setChecking(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_subscription_status, stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle<{ stripe_subscription_status: string | null; stripe_customer_id: string | null }>();

      const status = profile?.stripe_subscription_status ?? '';
      const isPaid = status === 'active' || status === 'trialing';
      setHasCustomerId(Boolean(profile?.stripe_customer_id));

      if (isPaid) {
        router.replace('/studio');
        return;
      }
      setChecking(false);
    };

    checkStatus().catch(() => setChecking(false));
  }, [router, supabase]);

  // Manual sync button (for debugging "I paid but still blocked")
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/stripe/sync', { method: 'POST' });
      const data = await response.json();
      if (data.isPaid) {
        setSyncResult('✓ Subscription verified! Redirecting...');
        window.location.assign('/studio');
        return;
      }
      setSyncResult(`Status: ${data.status || 'none'} - ${data.debug || 'Not subscribed'}`);
    } catch {
      setSyncResult('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync once on paywall if customer exists
  useEffect(() => {
    if (reason !== 'paywall') return;
    if (!hasCustomerId) return;
    if (syncing || syncResult) return;
    handleSync();
  }, [reason, hasCustomerId, syncing, syncResult]);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12">
      <AuthModal
        isOpen={isAuthOpen}
        mode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onModeChange={setAuthMode}
      />
      <div className="max-w-xl mx-auto">
        {/* Back link */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to home
        </Link>

        {checking && (
          <p className="text-sm text-slate-500 mb-4">Checking subscription...</p>
        )}

        <h1 className="text-2xl font-semibold text-white mb-3">
          {reason === 'paywall' ? 'Upgrade to access Studio' : 'Choose your plan'}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {reason === 'paywall' 
            ? 'A subscription is required to use VehicleStudio processing tools.'
            : 'Choose a plan to unlock VehicleStudio processing tools.'}
        </p>

        {/* Paywall message */}
        {reason === 'paywall' && (
          <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-300 font-medium mb-1">Subscription required</p>
            <p className="text-xs text-yellow-300/80">
              The Studio features require an active subscription. Choose a plan below to get started.
            </p>
          </div>
        )}

        {/* Sync section for users who think they paid */}
        {hasCustomerId && (
          <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-300 mb-2">Already subscribed but seeing this page?</p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors disabled:opacity-50"
            >
              {syncing ? 'Checking...' : 'Verify my subscription'}
            </button>
            {syncResult && (
              <p className="text-xs text-slate-400 mt-2">{syncResult}</p>
            )}
          </div>
        )}

        <MarketingPricingCard onSubscribe={openSignUp} />

        {/* Account link */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-sm text-slate-500">
            Already have an active subscription?{' '}
            <Link href="/account" className="text-cyan-400 hover:text-cyan-300">
              Manage account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
