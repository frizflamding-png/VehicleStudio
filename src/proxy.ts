import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPaidStatus } from '@/lib/billing';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project') || supabaseUrl.includes('your_')) {
    // Supabase not configured - allow access to all pages for setup
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof supabaseResponse.cookies.set>[2];
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ============================================
  // ROUTE PROTECTION LOGIC
  // ============================================

  // Routes that require authentication (any logged-in user)
  const authRequiredPaths = ['/upload', '/batch', '/settings', '/results', '/studio', '/onboarding', '/upgrade', '/account'];
  const isAuthRequired = authRequiredPaths.some((path) => pathname.startsWith(path));

  // Routes that require PAID subscription
  const paidPaths = ['/upload', '/batch', '/settings', '/results', '/studio', '/onboarding'];
  const isPaidPath = paidPaths.some((path) => pathname.startsWith(path));

  // Routes that are auth pages (login/signup)
  const authPaths = ['/login'];
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  // ============================================
  // 1. NOT LOGGED IN + PROTECTED ROUTE → /login
  // ============================================
  if (!user && isAuthRequired) {
    console.log('[PAYWALL] No user, redirecting to login. Path:', pathname);
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // ============================================
  // 2. LOGGED IN + AUTH PAGE → /studio
  // ============================================
  if (user && isAuthPath) {
    console.log('[PAYWALL] User on auth page, redirecting to studio. User:', user.id);
    const url = request.nextUrl.clone();
    url.pathname = '/studio';
    return NextResponse.redirect(url);
  }

  // ============================================
  // 3. LOGGED IN + PAID PATH → CHECK SUBSCRIPTION
  // ============================================
  if (user && isPaidPath) {
    // Fetch subscription status from database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_subscription_status, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle<{ stripe_subscription_status: string | null; stripe_customer_id: string | null }>();

    const status = profile?.stripe_subscription_status ?? null;
    const isPaid = isPaidStatus(status);

    // Debug logging (visible in Vercel logs)
    console.log('[PAYWALL] Subscription check:', {
      userId: user.id,
      path: pathname,
      status,
      isPaid,
      hasCustomerId: Boolean(profile?.stripe_customer_id),
      error: error?.message ?? null,
    });

    if (!isPaid) {
      console.log('[PAYWALL] User not paid, redirecting to upgrade. User:', user.id, 'Status:', status);
      const url = request.nextUrl.clone();
      url.pathname = '/upgrade';
      url.searchParams.set('reason', 'paywall');
      return NextResponse.redirect(url);
    }

    console.log('[PAYWALL] User is paid, allowing access. User:', user.id, 'Status:', status);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
