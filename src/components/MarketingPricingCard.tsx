'use client';

import { useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type BillingCycle = 'monthly' | 'yearly';

const PRICING: Record<BillingCycle, { price: string; label: string }> = {
  monthly: { price: '899 kr', label: 'per month' },
  yearly: { price: '8 990 kr', label: 'per year' },
};

type MarketingPricingCardProps = {
  onSubscribe?: () => void;
};

export default function MarketingPricingCard({ onSubscribe }: MarketingPricingCardProps) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activePricing = PRICING[cycle];

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

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');

    const priceId =
      cycle === 'monthly'
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
        : process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY;

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

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-left">
      <div className="flex items-center justify-start mb-6">
        <div className="inline-flex rounded-full bg-slate-950 border border-slate-800 p-1">
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              cycle === 'monthly'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle('yearly')}
            className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
              cycle === 'yearly'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-semibold text-white">{activePricing.price}</span>
        <span className="text-slate-400">{activePricing.label}</span>
      </div>

      <ul className="space-y-3 mb-6">
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
        disabled={loading}
        className="block w-full px-6 py-3 bg-[#1FB6A6] text-white font-medium rounded-lg text-center hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirecting...' : 'Subscribe'}
      </button>
    </div>
  );
}
