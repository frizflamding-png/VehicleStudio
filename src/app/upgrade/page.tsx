'use client';

import { useEffect, useState } from 'react';
import MarketingPricingCard from '@/components/MarketingPricingCard';

export default function UpgradePage() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'upgrade') {
      setShowMessage(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12">
      <div className="max-w-xl mx-auto">
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
