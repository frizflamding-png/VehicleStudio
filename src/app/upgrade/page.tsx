'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarketingPricingCard from '@/components/MarketingPricingCard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function UpgradePage() {
  const [showMessage, setShowMessage] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'upgrade') {
      setShowMessage(true);
    }
  }, []);

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
        .select('stripe_subscription_status')
        .eq('id', user.id)
        .maybeSingle<{ stripe_subscription_status: string | null }>();

      const status = profile?.stripe_subscription_status ?? '';
      const isPaid = status === 'active' || status === 'trialing';
      if (isPaid) {
        router.replace('/studio');
        return;
      }
      setChecking(false);
    };

    checkStatus().catch(() => setChecking(false));
  }, [router, supabase]);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12">
      <div className="max-w-xl mx-auto">
        {checking && (
          <p className="text-sm text-slate-500 mb-4">Checking subscription...</p>
        )}
        <h1 className="text-2xl font-semibold text-white mb-3">Upgrade to access Studio</h1>
        <p className="text-sm text-slate-400 mb-6">
          Choose a plan to unlock VehicleStudio processing tools.
        </p>

        {showMessage && (
          <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            Upgrade to access Studio.
          </div>
        )}

        <MarketingPricingCard />
      </div>
    </div>
  );
}
