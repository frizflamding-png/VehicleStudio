'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function StudioHomePage() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }

    const checkProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('dealership_name')
        .eq('id', user.id)
        .maybeSingle<{ dealership_name: string | null }>();

      if (!profile?.dealership_name) {
        router.replace('/onboarding');
        return;
      }

      setChecking(false);
    };

    checkProfile().catch(() => setChecking(false));
  }, [router, supabase]);

  if (checking) {
    return (
      <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)] flex items-center justify-center">
        <span className="text-sm text-slate-500">Loading studio...</span>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6.25rem)]">
      <div className="max-w-5xl mx-auto px-5 py-6">
        <h1 className="text-lg font-semibold text-white mb-2">Studio</h1>
        <p className="text-sm text-slate-400 mb-6">
          Quick access to your photo processing tools and account settings.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/upload"
            className="block bg-slate-900/60 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
          >
            <h2 className="text-sm font-semibold text-white mb-1">Single Upload</h2>
            <p className="text-xs text-slate-400">Process one vehicle photo at a time.</p>
          </Link>
          <Link
            href="/batch"
            className="block bg-slate-900/60 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
          >
            <h2 className="text-sm font-semibold text-white mb-1">Batch Upload</h2>
            <p className="text-xs text-slate-400">Upload and process multiple photos.</p>
          </Link>
          <Link
            href="/account"
            className="block bg-slate-900/60 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
          >
            <h2 className="text-sm font-semibold text-white mb-1">Account</h2>
            <p className="text-xs text-slate-400">Profile and subscription settings.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
