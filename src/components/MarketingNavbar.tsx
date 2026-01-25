'use client';
 
import Link from 'next/link';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
 import { useRouter } from 'next/navigation';
 import { useEffect, useMemo, useState } from 'react';
 import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
 
const OPEN_STUDIO_PATH = '/studio';

type MarketingNavbarProps = {
  onSignIn?: () => void;
  onSignUp?: () => void;
};

export default function MarketingNavbar({ onSignIn, onSignUp }: MarketingNavbarProps) {
   const [userEmail, setUserEmail] = useState<string | null>(null);
   const [userId, setUserId] = useState<string | null>(null);
   const router = useRouter();
 
   const supabase = useMemo(() => {
     if (!isSupabaseConfigured()) return null;
     return createClient();
   }, []);
 
   useEffect(() => {
     if (!supabase) return;
     let isMounted = true;
 
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
       if (!isMounted) return;
       setUserEmail(data.user?.email ?? null);
       setUserId(data.user?.id ?? null);
     });
 
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
       if (!isMounted) return;
       setUserEmail(session?.user?.email ?? null);
       setUserId(session?.user?.id ?? null);
     });
 
     return () => {
       isMounted = false;
       subscription.unsubscribe();
     };
   }, [supabase]);
 
   const handleSignOut = async () => {
     if (!supabase) return;
     await supabase.auth.signOut();
     setUserEmail(null);
     setUserId(null);
     router.push('/');
     router.refresh();
   };
 
   const isLoggedIn = Boolean(userId);
   const accountLabel = userEmail || 'Account';
 
   return (
     <>
       {/* ===== DESKTOP NAVIGATION (≥1024px) ===== */}
       <nav className="hidden lg:block fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
         <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
           {/* Wordmark */}
          <Link href="/" className="text-lg font-semibold text-white tracking-tight">
            VehicleStudio
          </Link>
 
           {/* Nav Links */}
           <div className="flex items-center gap-8">
             <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">
               Features
             </a>
             <a href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition-colors">
               How It Works
             </a>
             <a href="#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">
               Pricing
             </a>
 
            {isLoggedIn ? (
               <>
                 <Link
                   href={OPEN_STUDIO_PATH}
                   className="text-sm text-slate-300 hover:text-white transition-colors"
                 >
                   Open Studio
                 </Link>
 
                 <details className="relative">
                   <summary className="list-none cursor-pointer text-sm text-slate-300 hover:text-white transition-colors px-3 py-1.5 border border-slate-700/70 rounded-lg">
                     <span className="inline-block max-w-[180px] truncate align-bottom">
                       {accountLabel}
                     </span>
                   </summary>
                   <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-lg py-2">
                     <Link
                       href="/studio/account"
                       className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/70"
                     >
                       Account
                     </Link>
                     <Link
                       href="/studio"
                       className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/70"
                     >
                       Studio
                     </Link>
                     <button
                       type="button"
                       onClick={handleSignOut}
                       className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                     >
                       Sign out
                     </button>
                   </div>
                 </details>
               </>
            ) : (
               <>
                {onSignIn ? (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Sign in
                  </button>
                ) : (
                  <Link
                    href="/?auth=signin"
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Sign in
                  </Link>
                )}
                {onSignUp ? (
                  <button
                    type="button"
                    onClick={onSignUp}
                    className="text-sm px-4 py-2 bg-[#1FB6A6] text-white font-medium rounded-lg hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
                  >
                    Get started
                  </button>
                ) : (
                  <Link
                    href="/?auth=signup"
                    className="text-sm px-4 py-2 bg-[#1FB6A6] text-white font-medium rounded-lg hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
                  >
                    Get started
                  </Link>
                )}
               </>
             )}
           </div>
         </div>
       </nav>
 
      {/* ===== MOBILE HEADER ===== */}
      <header className="lg:hidden px-5 py-3 border-b border-slate-800/60 bg-slate-950/90">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-semibold text-white tracking-tight">
            VehicleStudio
          </Link>

          {isLoggedIn ? (
            <Link
              href={OPEN_STUDIO_PATH}
              className="text-xs px-3 py-1.5 bg-[#1FB6A6] text-white font-semibold rounded-md hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
            >
              Open Studio
            </Link>
          ) : (
            <div className="flex items-center gap-3 text-xs">
              {onSignIn ? (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Sign in
                </button>
              ) : (
                <Link href="/?auth=signin" className="text-slate-300 hover:text-white transition-colors">
                  Sign in
                </Link>
              )}
              {onSignUp ? (
                <button
                  type="button"
                  onClick={onSignUp}
                  className="px-3 py-1.5 bg-[#1FB6A6] text-white font-semibold rounded-md hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
                >
                  Get started
                </button>
              ) : (
                <Link
                  href="/?auth=signup"
                  className="px-3 py-1.5 bg-[#1FB6A6] text-white font-semibold rounded-md hover:bg-[#22C6B5] active:bg-[#179E90] transition-colors"
                >
                  Get started
                </Link>
              )}
            </div>
          )}
        </div>
      </header>
     </>
   );
 }
