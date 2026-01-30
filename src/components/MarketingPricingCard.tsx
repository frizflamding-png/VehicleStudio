'use client';

import { useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type BillingCycle = 'monthly' | 'yearly';

const PRICING: Record<BillingCycle, { price: string; label: string }> = {
  monthly: { price: '899 kr', label: 'per month' },
  yearly: { price: '8 990 kr', label: 'per year' },
};

// Price IDs from environment
const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? '';
const YEARLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY ?? '';

type SubscriptionInfo = {
  status: string | null;
  priceId: string | null;
};

type MarketingPricingCardProps = {
  onSubscribe?: () => void;
  subscription?: SubscriptionInfo | null;
};

export default function MarketingPricingCard({ onSubscribe, subscription }: MarketingPricingCardProps) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activePricing = PRICING[cycle];

  // Derive subscription state
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const currentInterval: BillingCycle | null = subscription?.priceId 
    ? subscription.priceId === MONTHLY_PRICE_ID ? 'monthly' 
      : subscription.priceId === YEARLY_PRICE_ID ? 'yearly' 
      : null
    : null;
  const isCurrentPlan = isActive && currentInterval === cycle;
  const canSwitch = isActive && currentInterval !== null && currentInterval !== cycle;

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  const setCheckoutParams = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('checkout', 'true');
    url.searchParams.set('plan', cycle);
    window.history.replaceState({}, '', url.toString());
  };

  // Open Stripe Customer Portal for plan changes
  const handleOpenPortal = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to open billing portal');
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open billing portal');
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    // If already subscribed to this plan, do nothing
    if (isCurrentPlan) return;
    
    // If subscribed to different plan, open portal to switch
    if (canSwitch) {
      return handleOpenPortal();
    }

    setLoading(true);
    setError('');

    const priceId = cycle === 'monthly' ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;

    if (!priceId) {
      setError('Stripe pricing is not configured.');
      setLoading(false);
      return;
    }

    try {
      if (supabase && onSubscribe) {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          setCheckoutParams();
          setLoading(false);
          onSubscribe();
          return;
        }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout');
      setLoading(false);
    }
  };

  // Determine button text
  const getButtonText = () => {
    if (loading) return 'Redirecting...';
    if (isCurrentPlan) return 'Current plan';
    if (canSwitch) return `Switch to ${cycle === 'monthly' ? 'Monthly' : 'Yearly'}`;
    return 'Start 7-day free trial';
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-left">
      <div className="flex items-center justify-start gap-3 mb-6">
        <div className="inline-flex rounded-full bg-slate-950 border border-slate-800 p-1">
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5 ${
              cycle === 'monthly'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly
            {isActive && currentInterval === 'monthly' && (
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" title="Current plan" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setCycle('yearly')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5 ${
              cycle === 'yearly'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Yearly
            {isActive && currentInterval === 'yearly' && (
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" title="Current plan" />
            )}
          </button>
        </div>
        {isActive && (
          <span className="text-xs text-emerald-400 font-medium">Subscribed</span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-1">
        <span className="text-4xl font-semibold text-white">{activePricing.price}</span>
        <span className="text-slate-400">{activePricing.label}</span>
        {cycle === 'yearly' && (
          <span className="inline-block px-2 py-0.5 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full">
            Best value
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block px-2 py-0.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full">
          7-day free trial
        </span>
        {cycle === 'yearly' && (
          <span className="text-sm text-emerald-400">· Save 17% annually</span>
        )}
      </div>

      <ul className="space-y-3 mb-6">
        <li className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Unlimited processing (fair use)
        </li>
        <li className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Background removal included
        </li>
        <li className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          All studio templates
        </li>
        <li className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Custom logo branding
        </li>
        <li className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Batch processing up to 50 photos
        </li>
        <li className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          ZIP download
        </li>
      </ul>

      {error && (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading || isCurrentPlan}
        className={`block w-full px-6 py-3 font-medium rounded-lg text-center transition-colors disabled:cursor-not-allowed ${
          isCurrentPlan 
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
            : 'bg-[#1FB6A6] text-white hover:bg-[#22C6B5] active:bg-[#179E90] disabled:opacity-60'
        }`}
      >
        {getButtonText()}
      </button>
      {isCurrentPlan ? (
        <p className="mt-3 text-xs text-slate-500 text-center">
          You&apos;re already on the {currentInterval === 'monthly' ? 'Monthly' : 'Yearly'} plan.
        </p>
      ) : canSwitch ? (
        <p className="mt-3 text-xs text-slate-500 text-center">
          Opens billing portal to change your plan
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500 text-center">
          Card required
        </p>
      )}
    </div>
  );
}
