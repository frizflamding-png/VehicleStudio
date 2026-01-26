"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const STUDIO_TABS = [
  { href: '/upload', label: 'Single' },
  { href: '/batch', label: 'Batch' },
  { href: '/settings', label: 'Settings' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inStudio = pathname.startsWith('/upload') || pathname.startsWith('/batch') || pathname.startsWith('/settings') || pathname.startsWith('/results') || pathname.startsWith('/studio');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  // Load subscription status
  useEffect(() => {
    if (!supabase) return;
    const loadStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_subscription_status')
        .eq('id', user.id)
        .maybeSingle<{ stripe_subscription_status: string | null }>();
      setSubscriptionStatus(profile?.stripe_subscription_status ?? null);
    };
    loadStatus();
  }, [supabase]);

  // Close dropdown on outside click
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setDropdownOpen(false);
    }
  }, []);

  // Close dropdown on Escape key
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen, handleClickOutside, handleKeyDown]);

  const isPro = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isDev = process.env.NODE_ENV === 'development';
  
  // Debug badge color based on status
  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-slate-600';
    if (status === 'active') return 'bg-emerald-600';
    if (status === 'trialing') return 'bg-blue-600';
    return 'bg-red-600';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Desktop: Compact Navigation */}
      <header className="hidden lg:block border-b border-slate-800/60 bg-slate-950/95 sticky top-0 z-50">
        {/* Single Row Navigation */}
        <div className="flex items-center h-10 px-5">
          <Link href="/" className="text-sm font-semibold tracking-tight text-white hover:text-slate-200 transition-colors mr-6">
            VehicleStudio
          </Link>
          
          {inStudio && (
            <>
              <div className="w-px h-4 bg-slate-800 mr-4" />
              <nav className="flex gap-0.5">
                {STUDIO_TABS.map(tab => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      pathname.startsWith(tab.href)
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
          
          <div className="ml-auto flex items-center gap-3">
            {/* Debug badge - shows subscription status in dev mode */}
            {isDev && inStudio && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusColor(subscriptionStatus)} text-white font-mono`}>
                Status: {subscriptionStatus || 'unpaid'}
              </span>
            )}
            {isPro && !isDev && <span className="text-[11px] text-slate-600">Pro</span>}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                className="text-[11px] text-slate-500 hover:text-white transition-colors"
              >
                Account
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-36 rounded border border-slate-800 bg-slate-950 shadow-lg" role="menu">
                  <Link
                    href="/account"
                    className="block px-3 py-2 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                  >
                    Account settings
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile: Header */}
      <header className="lg:hidden flex items-center justify-between h-12 px-4 border-b border-slate-800/60 bg-slate-950/95 sticky top-0 z-50">
        <Link href="/" className="text-base font-semibold text-white">
          VehicleStudio
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/account" className="text-[11px] text-slate-500 hover:text-white transition-colors">
            Account
          </Link>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">Studio</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Mobile: Bottom Nav */}
      {inStudio && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800/60">
          <div className="flex items-center justify-around h-12 max-w-lg mx-auto">
            {STUDIO_TABS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center px-4 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
