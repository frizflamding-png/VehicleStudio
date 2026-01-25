'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const OPEN_STUDIO_PATH = '/studio';

type Variant = 'desktop' | 'mobile';

type MarketingHeroActionsProps = {
  variant: Variant;
  onSignIn?: () => void;
  onSignUp?: () => void;
};

export default function MarketingHeroActions({ variant, onSignIn, onSignUp }: MarketingHeroActionsProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createClient();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setIsLoggedIn(Boolean(data.user?.id));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setIsLoggedIn(Boolean(session?.user?.id));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (variant === 'mobile') {
    return (
      <div className="space-y-3 max-w-sm mx-auto">
        {isLoggedIn ? (
          <Link href={OPEN_STUDIO_PATH} className="btn-primary block text-center">
            Open Studio
          </Link>
        ) : (
          <>
            {onSignUp ? (
              <button
                type="button"
                onClick={onSignUp}
                className="btn-primary block w-full text-center"
              >
                Get Started Free
              </button>
            ) : (
              <Link href="/?auth=signup" className="btn-primary block text-center">
                Get Started Free
              </Link>
            )}
            {onSignIn ? (
              <button
                type="button"
                onClick={onSignIn}
                className="btn-secondary block w-full text-center"
              >
                Sign In
              </button>
            ) : (
              <Link href="/?auth=signin" className="btn-secondary block text-center">
                Sign In
              </Link>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4">
      {isLoggedIn ? (
        <Link
          href={OPEN_STUDIO_PATH}
          className="px-6 py-3 bg-[#1FB6A6] text-white font-medium rounded-lg hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
        >
          Open Studio
        </Link>
      ) : (
        <>
          {onSignUp ? (
            <button
              type="button"
              onClick={onSignUp}
              className="px-6 py-3 bg-[#1FB6A6] text-white font-medium rounded-lg hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
            >
              Start processing photos
            </button>
          ) : (
            <Link
              href="/?auth=signup"
              className="px-6 py-3 bg-[#1FB6A6] text-white font-medium rounded-lg hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
            >
              Start processing photos
            </Link>
          )}
          {onSignIn ? (
            <button
              type="button"
              onClick={onSignIn}
              className="px-6 py-3 text-slate-300 font-medium rounded-lg border border-slate-700 hover:border-slate-600 hover:text-white transition-colors"
            >
              Sign in
            </button>
          ) : (
            <Link
              href="/?auth=signin"
              className="px-6 py-3 text-slate-300 font-medium rounded-lg border border-slate-700 hover:border-slate-600 hover:text-white transition-colors"
            >
              Sign in
            </Link>
          )}
        </>
      )}
    </div>
  );
}
