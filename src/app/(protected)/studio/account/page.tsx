'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProfileRecord = {
  full_name: string | null;
  dealership_name: string | null;
  phone: string | null;
  plan: string | null;
  plan_status: string | null;
  stripe_customer_id: string | null;
};

export default function AccountPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [dealershipName, setDealershipName] = useState('');
  const [phone, setPhone] = useState('');
  const [plan, setPlan] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setEmail(user.email ?? '');

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, dealership_name, phone, plan, plan_status, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle<ProfileRecord>();

    if (profile) {
      setFullName(profile.full_name ?? '');
      setDealershipName(profile.dealership_name ?? '');
      setPhone(profile.phone ?? '');
      setPlan(profile.plan ?? null);
      setPlanStatus(profile.plan_status ?? null);
      setStripeCustomerId(profile.stripe_customer_id ?? null);
    }
  }, [supabase]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (!supabase) {
    return (
      <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
        <div className="hidden lg:block">
          <div className="max-w-7xl mx-auto px-5 py-3">
            <div className="mb-3">
              <h1 className="text-[15px] font-semibold text-white leading-tight">Account</h1>
              <p className="text-xs text-slate-500 leading-tight">Profile, subscription, and security</p>
            </div>
            <div className="max-w-xl">
              <div className="bg-slate-900/50 border border-slate-800 rounded p-3 text-center">
                <div className="w-8 h-8 rounded bg-yellow-500/20 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-400 mb-3">Configure Supabase in <code className="text-cyan-400">.env.local</code></p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:hidden px-4 py-6 pb-20">
          <h1 className="text-lg font-semibold mb-4">Account</h1>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-400">Configure Supabase to enable account features.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: fullName || null,
          dealership_name: dealershipName || null,
          phone: phone || null,
        }, { onConflict: 'id' });

      if (error) throw error;
      setMessage({ type: 'success', text: 'Profile saved' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!stripeCustomerId) return;
    setPortalLoading(true);
    setMessage(null);

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
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Portal error' });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/');
    router.refresh();
  };

  const hasSubscription = !!stripeCustomerId;
  const planLabel = hasSubscription ? (plan || 'Standard') : 'No active subscription';
  const statusLabel = hasSubscription ? (planStatus || 'Active') : 'Inactive';

  return (
    <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
      {/* Desktop Layout */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-5 py-3">
          <div className="mb-3">
            <h1 className="text-[15px] font-semibold text-white leading-tight">Account</h1>
            <p className="text-xs text-slate-500 leading-tight">Profile, subscription, and security</p>
          </div>

          {message && (
            <div className={`mb-2 px-2 py-1 rounded text-[11px] max-w-xl ${
              message.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-12 gap-3">
            {/* Profile */}
            <div className="col-span-8">
              <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <span className="text-xs font-medium text-slate-400">Profile</span>
                </div>
                <div className="p-2 space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Email</label>
                    <input
                      value={email}
                      readOnly
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Full name</label>
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Dealership</label>
                      <input
                        value={dealershipName}
                        onChange={(e) => setDealershipName(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                        placeholder="Dealership name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Phone</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                      placeholder="Phone number"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        saving
                          ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
                          : 'bg-[#1FB6A6] text-white hover:bg-[#22C6B5] active:bg-[#179E90]'
                      }`}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="col-span-4 space-y-2">
              {/* Subscription */}
              <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <span className="text-xs font-medium text-slate-400">Subscription</span>
                </div>
                <div className="p-2 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Plan</span>
                    <span className="text-slate-300">{planLabel}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Status</span>
                    <span className="text-slate-300">{statusLabel}</span>
                  </div>
                  {hasSubscription ? (
                    <button
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className={`w-full px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        portalLoading
                          ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
                          : 'bg-[#1FB6A6] text-white hover:bg-[#22C6B5] active:bg-[#179E90]'
                      }`}
                    >
                      {portalLoading ? 'Opening portal...' : 'Manage subscription'}
                    </button>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-600">No active subscription</p>
                      <Link
                        href="/upgrade"
                        className="block w-full px-2 py-1.5 rounded text-xs font-medium bg-[#1FB6A6] text-white text-center hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
                      >
                        Upgrade
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Security */}
              <div className="bg-slate-900/50 border border-slate-800 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-900/80">
                  <span className="text-xs font-medium text-slate-400">Security</span>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full px-2 py-1.5 text-red-400 border border-red-500/30 rounded text-xs font-medium hover:bg-red-500/10 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden px-4 py-6 pb-20">
        <h1 className="text-lg font-semibold mb-4">Account</h1>

        {message && (
          <div className={`mb-4 p-3 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-slate-400 mb-3">Profile</p>
          <div className="space-y-3">
            <input value={email} readOnly className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-400" />
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm" placeholder="Full name" />
            <input value={dealershipName} onChange={(e) => setDealershipName(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm" placeholder="Dealership name" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm" placeholder="Phone number" />
            <button onClick={handleSave} disabled={saving} className={`w-full py-2 rounded text-sm font-medium ${
              saving ? 'bg-slate-800 text-slate-500' : 'bg-[#1FB6A6] text-white'
            }`}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-slate-400 mb-3">Subscription</p>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex justify-between"><span className="text-slate-500">Plan</span><span>{planLabel}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Status</span><span>{statusLabel}</span></div>
          </div>
          {hasSubscription ? (
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className={`w-full mt-3 py-2 rounded text-sm font-medium ${
                portalLoading ? 'bg-slate-800 text-slate-500' : 'bg-[#1FB6A6] text-white'
              }`}
            >
              {portalLoading ? 'Opening portal...' : 'Manage subscription'}
            </button>
          ) : (
            <Link
              href="/upgrade"
              className="block w-full mt-3 py-2 rounded text-sm font-medium bg-[#1FB6A6] text-white text-center hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
            >
              Upgrade
            </Link>
          )}
        </div>

        <button onClick={handleSignOut} className="w-full py-3 text-red-400 border border-red-500/30 rounded-lg text-sm">
          Sign Out
        </button>
      </div>
    </div>
  );
}
