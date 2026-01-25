'use client';

import { useState } from 'react';
import Link from 'next/link';

type BillingCycle = 'monthly' | 'yearly';

const PRICING: Record<BillingCycle, { price: string; label: string }> = {
  monthly: { price: '$99', label: 'per month' },
  yearly: { price: '$999', label: 'per year' },
};

type MarketingPricingCardProps = {
  onSubscribe?: () => void;
};

export default function MarketingPricingCard({ onSubscribe }: MarketingPricingCardProps) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const activePricing = PRICING[cycle];

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

      {onSubscribe ? (
        <button
          type="button"
          onClick={onSubscribe}
          className="block w-full px-6 py-3 bg-[#1FB6A6] text-white font-medium rounded-lg text-center hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
        >
          Subscribe
        </button>
      ) : (
        <Link
          href="/?auth=signup"
          className="block w-full px-6 py-3 bg-[#1FB6A6] text-white font-medium rounded-lg text-center hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
        >
          Subscribe
        </Link>
      )}
    </div>
  );
}
