import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Protected routes
  const protectedPaths = ['/upload', '/batch', '/settings', '/results', '/studio', '/onboarding', '/upgrade', '/account'];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect logged-in users away from auth pages
  const authPaths = ['/login', '/signup'];
  const isAuthPath = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/upload';
    return NextResponse.redirect(url);
  }

  // Paywall for Studio routes (allow account even if unpaid)
  const paidPaths = ['/upload', '/batch', '/settings', '/results', '/studio'];
  const isPaidPath = paidPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );
  const isAccountPath = request.nextUrl.pathname.startsWith('/account');

  if (user && isPaidPath && !isAccountPath) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_status')
      .eq('id', user.id)
      .maybeSingle<{ stripe_subscription_status: string | null }>();

    const status = profile?.stripe_subscription_status ?? '';
    const isPaid = status === 'active' || status === 'trialing';

    if (!isPaid) {
      const url = request.nextUrl.clone();
      url.pathname = '/upgrade';
      url.searchParams.set('reason', 'upgrade');
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
